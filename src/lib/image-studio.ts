// 主图工作台服务端核心：视觉结构解析（多模态 LLM）+ 布局重排 prompt 构建 + 图生图
// 仅在服务端使用，禁止被客户端组件引入
import { Config, ImageGenerationClient, LLMClient } from 'coze-coding-dev-sdk';
import {
  ELEMENT_TYPES,
  SHOT_ROLE_META,
  SHOT_ROLES,
  type CreativeBrief,
  type ElementType,
  type ImageElement,
  type ImageStructure,
  type RemixResult,
  type Shot,
  type ShotRole,
} from './image-types';

const VISION_MODEL = 'doubao-seed-2-0-pro-260215';

function hasIntegrationEnv(): boolean {
  return Boolean(process.env.COZE_INTEGRATION_BASE_URL && process.env.COZE_WORKLOAD_API_TOKEN);
}

/** 集成本地环境不可用时给出友好错误 */
export function assertImageStudioReady(): void {
  if (!hasIntegrationEnv()) {
    throw new Error(
      '图像 AI 能力依赖云端集成凭证，本地环境未配置。请在沙箱/云端环境使用本功能。',
    );
  }
}

// ---------------------------------------------------------------------------
// 1. 主图结构解析（多模态）
// ---------------------------------------------------------------------------

const ANALYZE_PROMPT = `你是资深跨境电商视觉分析专家，精通 TikTok Shop 高转化主图设计。
请拆解这张商品主图的视觉结构，识别图中的每个组成元素，并以严格 JSON 返回（不要输出 markdown 代码块、不要输出任何解释文字）。

返回格式：
{
  "productName": "图中产品名称（中文）",
  "composition": "整体构图方式一句话描述",
  "style": "视觉风格一句话描述",
  "elements": [
    {
      "id": "e1",
      "type": "product | background | prop | text | badge | decor",
      "name": "元素简短名称",
      "description": "视觉描述（颜色/材质/形态）；若 type 为 text，此处填具体文案内容",
      "bbox": [x, y, width, height],
      "role": "该元素在主图中的营销作用"
    }
  ]
}

严格要求：
1. bbox 为 0-1 归一化坐标，x/y 是元素左上角，尽量贴合元素实际区域
2. type 取值只能是：product(产品主体，必有且仅有一个) / background(背景) / prop(搭配道具) / text(文字卖点) / badge(角标标签) / decor(纯装饰元素)
3. 元素总数 3-8 个，按视觉层级从底层(背景)到顶层排序
4. 只返回 JSON 本身`;

interface RawElement {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  description?: unknown;
  bbox?: unknown;
  role?: unknown;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function sanitizeElement(raw: RawElement, index: number): ImageElement | null {
  const type = typeof raw.type === 'string' && (ELEMENT_TYPES as string[]).includes(raw.type)
    ? (raw.type as ElementType)
    : 'decor';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `元素${index + 1}`;
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const role = typeof raw.role === 'string' ? raw.role.trim() : '';
  const b = Array.isArray(raw.bbox) ? raw.bbox : [];
  const nums = b.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  if (nums.length < 4) return null;
  // 先夹取再校验：模型偶发返回越界坐标，夹取后可能退化为零面积
  const x = clamp01(nums[0]);
  const y = clamp01(nums[1]);
  const w = Math.min(Math.max(nums[2], 0), 1 - x);
  const h = Math.min(Math.max(nums[3], 0), 1 - y);
  if (w <= 0.01 || h <= 0.01) return null;
  const bbox: [number, number, number, number] = [x, y, w, h];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `e${index + 1}`,
    type,
    name,
    description,
    bbox,
    role,
  };
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI 未返回有效的结构化结果，请重试');
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

/** 解析主图结构，image 支持 data: 前缀的 base64 或公网可访问的 URL */
export async function analyzeImage(
  image: string,
  headers?: Record<string, string>,
): Promise<ImageStructure> {
  assertImageStudioReady();
  const client = new LLMClient(new Config(), headers);
  const response = await client.invoke(
    [
      { role: 'system', content: ANALYZE_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请分析这张商品主图的视觉结构：' },
          { type: 'image_url', image_url: { url: image, detail: 'high' } },
        ],
      },
    ],
    { model: VISION_MODEL, temperature: 0.2 },
  );

  const parsed = extractJson(response.content);
  const rawElements = Array.isArray(parsed.elements) ? (parsed.elements as RawElement[]) : [];
  const elements = rawElements
    .map((el, i) => sanitizeElement(el, i))
    .filter((el): el is ImageElement => el !== null);
  if (elements.length === 0) {
    throw new Error('AI 未能识别出有效的结构元素，请换一张更清晰的主图重试');
  }
  if (!elements.some((e) => e.type === 'product')) {
    elements.unshift({
      id: 'e0',
      type: 'product',
      name: '产品主体',
      description: typeof parsed.productName === 'string' ? parsed.productName : '产品主体',
      bbox: [0.25, 0.2, 0.5, 0.55],
      role: '主图核心视觉焦点',
    });
  }

  return {
    productName:
      typeof parsed.productName === 'string' && parsed.productName.trim()
        ? parsed.productName.trim()
        : '商品主图',
    composition: typeof parsed.composition === 'string' ? parsed.composition : '',
    style: typeof parsed.style === 'string' ? parsed.style : '',
    elements,
  };
}

// ---------------------------------------------------------------------------
// 2. 广告制作 Agent：产出 Listing 视觉策划案（Creative Brief）
// ---------------------------------------------------------------------------

const BRIEF_SYSTEM_PROMPT = `你是一位有 15 年经验的电商广告制作总监，操盘过数百个 TikTok Shop / 亚马逊爆款 Listing 的视觉策划与拍摄。你深知 Listing 图片不是艺术摄影，每一张都有明确的商业任务：首图抢点击、卖点图建信任、场景图造向往、细节图消顾虑。你的策划案永远边界清晰——产品是绝对主角，场景只是卖点的证据，情绪和温度服务于"让人想买"，而不是自我表达。你从不依赖文字标语，只靠画面完成销售。`;

interface RawShot {
  role?: unknown;
  name?: unknown;
  sellingPoint?: unknown;
  emotion?: unknown;
  scene?: unknown;
  composition?: unknown;
}

function sanitizeShot(raw: RawShot, index: number): Shot | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const scene = typeof raw.scene === 'string' ? raw.scene.trim() : '';
  if (!name || !scene) return null;
  const role =
    typeof raw.role === 'string' && (SHOT_ROLES as string[]).includes(raw.role)
      ? (raw.role as ShotRole)
      : 'scene';
  const sellingPoint = typeof raw.sellingPoint === 'string' ? raw.sellingPoint.trim() : '';
  const emotion = typeof raw.emotion === 'string' ? raw.emotion.trim() : '';
  const composition = typeof raw.composition === 'string' ? raw.composition.trim() : '';
  return {
    id: `shot-${index + 1}`,
    role,
    name,
    sellingPoint: sellingPoint || name,
    emotion: emotion || '向往与信赖',
    scene,
    composition: composition || SHOT_ROLE_META[role].duty,
  };
}

/** 广告制作 Agent：基于产品信息产出 Listing 视觉策划案（策略 + 拍摄清单） */
export async function produceCreativeBrief(
  structure: ImageStructure,
  headers?: Record<string, string>,
): Promise<CreativeBrief> {
  assertImageStudioReady();
  const client = new LLMClient(new Config(), headers);
  const product = structure.elements.find((e) => e.type === 'product');
  const sellingTexts = structure.elements
    .filter((e) => e.type === 'text' || e.type === 'badge')
    .map((e) => e.description)
    .filter(Boolean)
    .join('；');
  const response = await client.invoke(
    [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `产品名称：${structure.productName}
产品特征：${product?.description || '见参考图'}
原图风格：${structure.style || '电商摄影'}
原图卖点文案：${sellingTexts || '（原图无文字卖点，请从产品特征自行提炼）'}

请为该产品制定一份 Listing 视觉拍摄策划案，分三步：

第一步：定传播策略
- 目标人群：最会买它的人是谁，一句话
- 核心卖点：只选一个最能打的卖点（贪多必失）
- 传播钩子：一个让人一眼记住、愿意截图分享的视觉记忆点

第二步：开拍摄清单，固定 4 个镜头，各司其职：
1. hero 首图定调：产品占画面 50% 以上，简洁有冲击力，3 米外一眼认出产品，决定点击率
2. proof 卖点实证：用一个真实场景证明核心卖点，场景是卖点的证据而不是风景照
3. scene 使用场景：制造"这就是我想要的生活"的代入感与向往，但产品仍占画面至少 1/3 且是第一眼焦点
4. detail 细节特写：材质/工艺/质感微距，消除品质顾虑

第三步：为每个镜头写明边界，遵守铁律：
- 产品永远是主角：清晰锐利，场景、道具、人物都为卖点服务，禁止喧宾夺主
- 人物出现时不遮挡产品、不露正脸，只作氛围陪衬
- 可以有温度有情绪，但目标是"让人想买"，不是拍文艺片

严格 JSON 返回（不要 markdown 代码块）：
{"audience":"目标人群(15字内)","coreSellingPoint":"核心卖点(12字内)","hook":"传播钩子(15字内)","shots":[{"role":"hero|proof|scene|detail","name":"画面短名(2-6字)","sellingPoint":"本镜头服务的卖点(10字内)","emotion":"传达的情绪与理念(12字内)","scene":"画面描述(50-80字，含环境/光线/道具/人物状态)","composition":"构图规范(景别/产品占比/位置，25字内)"}]}`,
      },
    ],
    { model: VISION_MODEL, temperature: 0.7 },
  );
  const parsed = extractJson(response.content);
  const rawShots = Array.isArray(parsed.shots) ? (parsed.shots as RawShot[]) : [];
  const shots = rawShots
    .map((s, i) => sanitizeShot(s, i))
    .filter((s): s is Shot => s !== null)
    .slice(0, 5);
  if (shots.length === 0) {
    throw new Error('策划案生成失败，请重试');
  }
  return {
    audience: typeof parsed.audience === 'string' && parsed.audience.trim() ? parsed.audience.trim() : '跨境消费人群',
    coreSellingPoint:
      typeof parsed.coreSellingPoint === 'string' && parsed.coreSellingPoint.trim()
        ? parsed.coreSellingPoint.trim()
        : shots[0].sellingPoint,
    hook: typeof parsed.hook === 'string' && parsed.hook.trim() ? parsed.hook.trim() : '产品质感直击',
    shots,
  };
}

// ---------------------------------------------------------------------------
// 3. 场景化图生图 prompt 构建
// ---------------------------------------------------------------------------

/** bbox 中心点 → 中文方位词 */
export function posWord(bbox: [number, number, number, number]): string {
  const cx = bbox[0] + bbox[2] / 2;
  const cy = bbox[1] + bbox[3] / 2;
  const h = cx < 0.35 ? '左' : cx > 0.65 ? '右' : '中';
  const v = cy < 0.35 ? '上' : cy > 0.65 ? '下' : '中';
  if (h === '中' && v === '中') return '画面正中央';
  if (v === '中') return h === '左' ? '画面左侧中部' : '画面右侧中部';
  if (h === '中') return v === '上' ? '画面上方居中' : '画面下方居中';
  return `画面${v}${h}角区域`;
}

/** 基于拍摄清单构建图生图 prompt（广告大片定位 + 职能分工 + 边界控制） */
export function buildShotPrompts(
  structure: ImageStructure,
  brief: CreativeBrief,
  extra?: string,
): { prompt: string; variant: string; note: string; sceneId: string }[] {
  const product = structure.elements.find((e) => e.type === 'product');
  const productDesc = product?.description || structure.productName;
  const pos = product ? posWord(product.bbox) : '画面正中央';
  const extraLine = extra?.trim() ? `\n用户额外要求：${extra.trim()}` : '';
  return brief.shots.map((shot) => {
    const meta = SHOT_ROLE_META[shot.role];
    return {
      variant: shot.name,
      note: `${meta.label} · ${shot.sellingPoint}`,
      sceneId: shot.id,
      prompt: `TikTok Shop 高转化电商广告大片：${structure.productName}（${productDesc}）。
本图职能：${meta.label}——${meta.duty}
服务卖点：${shot.sellingPoint}
画面情绪：${shot.emotion}
画面内容：${shot.scene}
构图规范：${compositionLine(shot)}；产品摆放在${pos}。
传播策略：目标人群是${brief.audience}，画面要形成记忆点——${brief.hook}。

商业边界（必须严格遵守）：
1. 产品是画面绝对主角，清晰锐利、第一眼可辨；场景、道具、人物只为证明卖点服务，绝不喧宾夺主；
2. 商业广告大片质感：光影高级、色调统一干净，有生活温度但保持商业片的克制，拒绝文艺片式的松散构图；
3. 严格保持参考图中产品的外观、颜色、材质、形状与细节完全一致；
4. 画面中不要出现任何文字、字母、数字、标签、logo 或水印；
5. 正方形构图。${extraLine}`,
    };
  });
}

function compositionLine(shot: Shot): string {
  if (shot.role === 'hero') return `${shot.composition}（产品占比须达 50% 以上）`;
  if (shot.role === 'detail') return `${shot.composition}（微距特写，产品充满画面主体）`;
  return `${shot.composition}（产品占比不少于 1/3，为视觉第一焦点）`;
}

// ---------------------------------------------------------------------------
// 4. 多角度衍生：对满意场景做不同视角/构图的二次生成
// ---------------------------------------------------------------------------

/** 多角度构图预设 */
export const ANGLE_PRESETS = [
  {
    key: 'macro',
    name: '微距特写',
    desc: '镜头贴近产品做微距特写，产品占据画面主体，浅景深将场景环境虚化成柔美的光斑，集中展示产品的材质、工艺与质感细节',
  },
  {
    key: 'topdown',
    name: '俯拍陈列',
    desc: '45° 俯视角度完整呈现场景全貌，产品与道具的陈列关系一目了然，杂志平铺式构图，画面信息丰富而有序',
  },
  {
    key: 'eyelevel',
    name: '平视瞬间',
    desc: '平视视角抓拍人物自然使用产品的瞬间（可出现手部或局部侧影，不露正脸），真实生活抓拍感，突出人与产品的互动',
  },
  {
    key: 'wide',
    name: '远景氛围',
    desc: '拉远镜头展现场景的大环境与空间氛围，产品融入场景之中作为视觉点睛，强调情绪叙事与整体意境',
  },
] as const;

/** 基于选中镜头构建多角度图生图 prompt（参考图为该镜头已生成的图，保持场景连贯） */
export function buildAnglePrompts(
  shot: Shot,
  productName: string,
  extra?: string,
): { prompt: string; variant: string; note: string }[] {
  const extraLine = extra?.trim() ? `\n用户额外要求：${extra.trim()}` : '';
  return ANGLE_PRESETS.map((a) => ({
    variant: a.name,
    note: shot.name,
    prompt: `电商广告大片的机位变换：参考图中的产品、场景与光线保持不变，仅改变拍摄视角与构图。
场景：${shot.scene}
画面情绪：${shot.emotion}
新的视角与构图：${a.desc}
要求：场景环境、道具、光线与色调氛围与参考图保持连贯一致，像同一场广告拍摄的不同机位；产品（${productName}）的外观、颜色、材质、形状与细节和参考图完全一致，且始终是画面清晰焦点；保持商业广告大片质感，正方形构图。${extraLine}
硬性要求：画面中不要出现任何文字、字母、数字、标签、logo 或水印。`,
  }));
}

// ---------------------------------------------------------------------------
// 5. 图生图执行
// ---------------------------------------------------------------------------

interface GenRequest {
  prompt: string;
  variant: string;
  note?: string;
  sceneId?: string;
}

/** 批量图生图（允许部分失败，全部失败才抛错） */
export async function generateImages(
  referenceImageUrl: string,
  requests: GenRequest[],
  headers: Record<string, string>,
  size: '2K' | '4K' = '4K',
): Promise<RemixResult[]> {
  assertImageStudioReady();
  if (requests.length === 0) {
    throw new Error('缺少生成请求');
  }
  const client = new ImageGenerationClient(new Config(), headers);
  const responses = await client.batchGenerate(
    requests.map((r) => ({
      prompt: r.prompt,
      image: referenceImageUrl,
      size,
      responseFormat: 'url' as const,
      watermark: false,
    })),
  );
  const results: RemixResult[] = [];
  const errors: string[] = [];
  responses.forEach((resp, i) => {
    const helper = client.getResponseHelper(resp);
    if (helper.success && helper.imageUrls.length > 0) {
      results.push({
        url: helper.imageUrls[0],
        variant: requests[i]?.variant ?? `图 ${i + 1}`,
        note: requests[i]?.note,
        sceneId: requests[i]?.sceneId,
      });
    } else {
      const msg = resp.error?.message ?? helper.errorMessages.join('; ');
      if (msg) errors.push(msg);
    }
  });
  if (results.length === 0) {
    throw new Error(`图片生成失败${errors.length > 0 ? `：${errors[0]}` : '，请稍后重试'}`);
  }
  return results;
}

/** 以原图为参考，按拍摄清单批量生成广告主图 */
export async function remixImage(
  referenceImageUrl: string,
  structure: ImageStructure,
  brief: CreativeBrief,
  extra: string | undefined,
  headers: Record<string, string>,
): Promise<RemixResult[]> {
  if (brief.shots.length === 0) {
    throw new Error('请至少保留一个拍摄镜头');
  }
  const prompts = buildShotPrompts(structure, brief, extra);
  return generateImages(referenceImageUrl, prompts, headers);
}

/** 以选中镜头已生成的图为参考，衍生多角度/不同构图的同场景图 */
export async function remixAngles(
  selectedImageUrl: string,
  shot: Shot,
  productName: string,
  extra: string | undefined,
  headers: Record<string, string>,
): Promise<RemixResult[]> {
  const prompts = buildAnglePrompts(shot, productName, extra);
  return generateImages(selectedImageUrl, prompts, headers);
}
