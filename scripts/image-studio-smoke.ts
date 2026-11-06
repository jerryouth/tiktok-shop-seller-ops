// 主图工作台端到端冒烟：复刻用户真实链路——HTTP 上传真实图片 → 公网可达性校验 → HTTP 结构解析 → 以上传图公网 URL 做图生图
// 用法：pnpm tsx scripts/image-studio-smoke.ts
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildAnglePrompts,
  buildShotPrompts,
  generateImages,
  produceCreativeBrief,
  remixImage,
} from '../src/lib/image-studio';
import type { ImageStructure, RemixResult } from '../src/lib/image-types';

const PORT = process.env.DEPLOY_RUN_PORT ?? '5000';
const BASE = `http://localhost:${PORT}`;
const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT ?? '';
const ORIGIN = domain.startsWith('http') ? domain : `https://${domain}`;

async function main(): Promise<void> {
  const buf = await fs.readFile(path.join(process.cwd(), 'public/products/beauty-1.png'));
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;

  // 1. HTTP 上传真实商品图
  console.log('========== 1. POST /api/image/file（真实商品图）==========');
  const upRes = await fetch(`${BASE}/api/image/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const upJson = (await upRes.json()) as { id?: string; url?: string; error?: string };
  if (!upRes.ok || !upJson.url) throw new Error(`上传失败: ${upJson.error ?? upRes.status}`);
  console.log(`上传成功: ${upJson.url}`);

  // 2. 公网可达性校验（图生图服务回源视角）
  console.log('\n========== 2. 公网可达性校验 ==========');
  const publicUrl = `${ORIGIN}${upJson.url}`;
  const pubRes = await fetch(publicUrl);
  if (!pubRes.ok) throw new Error(`公网读取失败: ${pubRes.status} ${publicUrl}`);
  console.log(`公网可达: ${pubRes.status} ${pubRes.headers.get('content-type')} ${publicUrl.slice(0, 80)}...`);

  // 3. HTTP 结构解析（/products 路径走 fs 读取）
  console.log('\n========== 3. POST /api/image/analyze ==========');
  const anRes = await fetch(`${BASE}/api/image/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: '/products/beauty-1.png' }),
  });
  const anJson = (await anRes.json()) as { structure?: ImageStructure; error?: string };
  if (!anRes.ok || !anJson.structure) throw new Error(`解析失败: ${anJson.error ?? anRes.status}`);
  const structure = anJson.structure;
  console.log(`产品：${structure.productName} ｜ 元素数：${structure.elements.length}`);
  for (const el of structure.elements) {
    const b = el.bbox.map((v) => v.toFixed(2)).join(', ');
    console.log(`  [${el.type}] ${el.name} | bbox=[${b}]`);
  }
  for (const el of structure.elements) {
    if (el.bbox[2] <= 0 || el.bbox[3] <= 0) throw new Error(`退化 bbox 未被过滤: ${el.name}`);
  }

  // 4. 广告制作 Agent：产出 Listing 视觉策划案（直接调核心库，HTTP 层逻辑与 analyze 一致）
  console.log('\n========== 4. 广告拍摄策划案（Creative Brief）==========');
  const brief = await produceCreativeBrief(structure, {});
  console.log(`  目标人群：${brief.audience}`);
  console.log(`  核心卖点：${brief.coreSellingPoint}`);
  console.log(`  传播钩子：${brief.hook}`);
  for (const s of brief.shots) {
    console.log(`  [${s.role}]「${s.name}」卖点：${s.sellingPoint} ｜ 情绪：${s.emotion}`);
    console.log(`    构图：${s.composition}`);
  }
  if (brief.shots.length === 0) throw new Error('拍摄清单为空');
  if (brief.shots.some((s) => !s.sellingPoint || !s.emotion || !s.composition)) {
    throw new Error('镜头缺少卖点/情绪/构图字段');
  }

  // 5. 拍摄清单 prompt + 图生图（参考图 = 上传图的公网 URL，复刻用户真实链路；冒烟只拍前 3 个镜头控时）
  console.log('\n========== 5. 广告主图生成（4K 无文字，上传图回源）==========');
  const smokeBrief = { ...brief, shots: brief.shots.slice(0, 3) };
  const prompts = buildShotPrompts(structure, smokeBrief);
  for (const p of prompts) console.log(`  [${p.variant}] ${p.prompt.split('\n')[0]}`);
  const results: RemixResult[] = await remixImage(publicUrl, structure, smokeBrief, undefined, {});
  for (const r of results) console.log(`  [${r.variant}] sceneId=${r.sceneId ?? '—'} ${r.url.slice(0, 80)}...`);
  if (results.some((r) => !r.sceneId)) throw new Error('生成结果缺少 sceneId 回传');

  // 6. 多角度衍生：以第一张镜头图为参考，生成不同机位（冒烟只跑 2 个视角控时）
  console.log('\n========== 6. 多角度衍生（微距特写 + 俯拍陈列）==========');
  const first = results[0];
  const firstShot = brief.shots.find((s) => s.id === first.sceneId);
  if (!first || !firstShot) throw new Error('生成结果与拍摄清单无法关联');
  const anglePrompts = buildAnglePrompts(firstShot, structure.productName);
  console.log(`  预设视角：${anglePrompts.map((a) => a.variant).join(' / ')}`);
  const angleResults = await generateImages(first.url, anglePrompts.slice(0, 2), {});
  for (const r of angleResults) console.log(`  [${r.variant}] ${r.url.slice(0, 80)}...`);

  console.log('\n全部通过');
}

main().catch((err) => {
  console.error('冒烟脚本失败:', err);
  process.exit(1);
});
