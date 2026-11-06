// 主图工作台端到端冒烟：HTTP 上传/读取 → HTTP 结构解析 → 布局重排 prompt → 图生图
// 用法：pnpm tsx scripts/image-studio-smoke.ts
import { buildRemixPrompts, remixImage } from '../src/lib/image-studio';
import type { ImageStructure, RemixResult } from '../src/lib/image-types';

const PORT = process.env.DEPLOY_RUN_PORT ?? '5000';
const BASE = `http://localhost:${PORT}`;

// 1x1 红色 PNG
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main(): Promise<void> {
  // 1. 上传 + 公网读取
  console.log('========== 1. POST /api/image/file + GET 读取 ==========');
  const upRes = await fetch(`${BASE}/api/image/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: TINY_PNG }),
  });
  const upJson = (await upRes.json()) as { id?: string; url?: string; error?: string };
  if (!upRes.ok || !upJson.url) throw new Error(`上传失败: ${upJson.error ?? upRes.status}`);
  console.log(`上传成功: id=${upJson.id} url=${upJson.url}`);
  const getRes = await fetch(`${BASE}${upJson.url}`);
  if (!getRes.ok) throw new Error(`读取失败: ${getRes.status}`);
  console.log(`读取成功: ${getRes.status} ${getRes.headers.get('content-type')}`);

  // 2. HTTP 结构解析（走 resolveToDataUri 的 fs 读取路径）
  console.log('\n========== 2. POST /api/image/analyze ==========');
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

  // 3. 重排 prompt 构建（lib 层）
  console.log('\n========== 3. 重排 prompt 构建 ==========');
  const shuffled = { ...structure, elements: [...structure.elements].reverse() };
  const prompts = buildRemixPrompts(shuffled);
  console.log(`变体数：${prompts.length}（${prompts.map((p) => p.variant).join(' / ')}）`);

  // 4. 图生图（lib 层，参考图用公网 URL）
  console.log('\n========== 4. 图生图 ==========');
  const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT ?? '';
  const origin = domain.startsWith('http') ? domain : `https://${domain}`;
  const referenceUrl = `${origin}/products/beauty-1.png`;
  console.log(`参考图：${referenceUrl}`);
  const results: RemixResult[] = await remixImage(referenceUrl, shuffled, undefined, {});
  for (const r of results) console.log(`  [${r.variant}] ${r.url.slice(0, 90)}...`);

  console.log('\n全部通过');
}

main().catch((err) => {
  console.error('冒烟脚本失败:', err);
  process.exit(1);
});
