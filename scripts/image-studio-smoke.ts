// 主图工作台端到端冒烟：复刻用户真实链路——HTTP 上传真实图片 → 公网可达性校验 → HTTP 结构解析 → 以上传图公网 URL 做图生图
// 用法：pnpm tsx scripts/image-studio-smoke.ts
import { promises as fs } from 'fs';
import path from 'path';
import { buildRemixPrompts, remixImage } from '../src/lib/image-studio';
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

  // 4. 重排 prompt + 图生图（参考图 = 上传图的公网 URL，复刻用户失败场景）
  console.log('\n========== 4. 图生图（上传图回源）==========');
  const shuffled = { ...structure, elements: [...structure.elements].reverse() };
  const prompts = buildRemixPrompts(shuffled);
  console.log(`变体数：${prompts.length}，参考图：${publicUrl.slice(0, 80)}...`);
  const results: RemixResult[] = await remixImage(publicUrl, shuffled, undefined, {});
  for (const r of results) console.log(`  [${r.variant}] ${r.url.slice(0, 90)}...`);

  console.log('\n全部通过');
}

main().catch((err) => {
  console.error('冒烟脚本失败:', err);
  process.exit(1);
});
