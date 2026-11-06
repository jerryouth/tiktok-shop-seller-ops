// 主图工作台服务端核心：视觉结构解析（多模态 LLM）+ 布局重排 prompt 构建 + 图生图
// 仅在服务端使用，禁止被客户端组件引入
import { Config, ImageGenerationClient, LLMClient } from 'coze-coding-dev-sdk';
import {
  ELEMENT_TYPES,
  type ElementType,
  type ImageElement,
  type ImageStructure,
  type RemixResult,
  type SceneSuggestion,
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
// 2. 场景联想：LLM 基于产品构思使用场景（画面暗示价值，而非文字卖点）
// ---------------------------------------------------------------------------

const SCENE_SYSTEM_PROMPT = `你是顶级电商视觉创意总监，擅长用生活方式场景为产品"讲故事"：不依赖任何文字标语，只靠画面元素让目标用户一眼感受到产品带来的价值，产生代入感和购买欲。`;

interface RawScene {
  name?: unknown;
  value?: unknown;
  scene?: unknown;
}

function sanitizeScene(raw: RawScene, index: number): SceneSuggestion | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  const scene = typeof raw.scene === 'string' ? raw.scene.trim() : '';
  if (!name || !scene) return null;
  return { id: `s${index + 1}`, name, value: value || name, scene };
}

/** 基于产品结构，联想 3 个差异化的真实使用场景 */
export async function suggestScenes(
  structure: ImageStructure,
  headers?: Record<string, string>,
): Promise<SceneSuggestion[]> {
  assertImageStudioReady();
  const client = new LLMClient(new Config(), headers);
  const product = structure.elements.find((e) => e.type === 'product');
  const response = await client.invoke(
    [
      { role: 'system', content: SCENE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `产品名称：${structure.productName}
产品特征：${product?.description || '见参考图'}
原图风格：${structure.style || '电商摄影'}

请为该产品构思 3 个互不重复的真实使用场景，用于拍摄电商场景主图。每个场景必须：
1. 具体可拍：环境、光线、氛围、搭配道具都能直接视觉化，避免空泛形容词堆砌
2. 暗示价值：不写任何文字标语，只靠画面元素让用户感受到产品带来的好处
3. 差异明显：覆盖不同的时间、空间或人群情绪（例如晨间/夜晚、居家/户外、独处/社交）

严格 JSON 返回（不要 markdown 代码块）：
{"scenes":[{"name":"场景短名(2-6字)","value":"画面暗示的价值点(12字内)","scene":"画面描述(50-80字，含环境/光线/道具/氛围)"}]}`,
      },
    ],
    { model: VISION_MODEL, temperature: 0.75 },
  );
  const parsed = extractJson(response.content);
  const rawScenes = Array.isArray(parsed.scenes) ? (parsed.scenes as RawScene[]) : [];
  const scenes = rawScenes
    .map((s, i) => sanitizeScene(s, i))
    .filter((s): s is SceneSuggestion => s !== null)
    .slice(0, 4);
  if (scenes.length === 0) {
    throw new Error('场景联想失败，请重试');
  }
  return scenes;
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

/** 基于使用场景构建图生图 prompt（每个场景一张，画面无文字） */
export function buildScenePrompts(
  structure: ImageStructure,
  scenes: SceneSuggestion[],
  extra?: string,
): { prompt: string; variant: string; value: string }[] {
  const product = structure.elements.find((e) => e.type === 'product');
  const productDesc = product?.description || structure.productName;
  const pos = product ? posWord(product.bbox) : '画面正中央';
  const extraLine = extra?.trim() ? `\n用户额外要求：${extra.trim()}` : '';
  return scenes.map((s) => ({
    variant: s.name,
    value: s.value,
    prompt: `高端生活方式电商摄影：${structure.productName}（${productDesc}）。
严格保持参考图中产品的外观、颜色、材质、形状与细节完全一致，将产品自然融入以下真实使用场景，产品位于${pos}，始终是画面的视觉焦点：
场景画面：${s.scene}
画面要无声地传达产品价值：${s.value}，让目标用户一眼产生"这就是我想要的生活"的代入感。
摄影要求：杂志级生活方式摄影质感，自然真实的光影层次，浅景深背景适度虚化，构图高级有呼吸感，色调和谐统一，正方形构图。${extraLine}
硬性要求：画面中不要出现任何文字、字母、数字、标签、logo 或水印。`,
  }));
}

// ---------------------------------------------------------------------------
// 4. 图生图执行
// ---------------------------------------------------------------------------

/** 以原图为参考，按使用场景批量生成场景化主图（允许部分失败，全部失败才抛错） */
export async function remixImage(
  referenceImageUrl: string,
  structure: ImageStructure,
  scenes: SceneSuggestion[],
  extra: string | undefined,
  headers: Record<string, string>,
): Promise<RemixResult[]> {
  assertImageStudioReady();
  if (scenes.length === 0) {
    throw new Error('请至少保留一个使用场景');
  }
  const client = new ImageGenerationClient(new Config(), headers);
  const variants = buildScenePrompts(structure, scenes, extra);
  const responses = await client.batchGenerate(
    variants.map((v) => ({
      prompt: v.prompt,
      image: referenceImageUrl,
      size: '4K',
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
        variant: variants[i]?.variant ?? `场景 ${i + 1}`,
        value: variants[i]?.value,
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
