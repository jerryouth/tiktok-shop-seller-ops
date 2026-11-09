// Onebound 1688 数据源直连冒烟：验证文搜 + 详情聚合层（不经过 Next 服务）
// 注意：账号每日配额极低（约 10 次/日），本脚本消耗 2 次（搜索 1 + 详情 1）
// 运行：pnpm tsx scripts/onebound-smoke.ts
import { readFileSync } from 'node:fs';

// 独立脚本不经过 Next，手动加载 .env.local
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local 不存在时忽略
}

import {
  getSourcingDetail,
  isSourcingConfigured,
  searchSourcing,
} from '../src/lib/agent/sources/sourcing';

async function main() {
  if (!isSourcingConfigured()) {
    console.error('FAIL: 未配置 ONEBOUND_KEY / ONEBOUND_SECRET（.env.local）');
    process.exit(1);
  }

  // 1. 文字搜索
  console.log('========== 1. searchSourcing（文字搜索）==========');
  const r = await searchSourcing('宠物自洁梳', 5);
  console.log(`实时数据: ${r.realtime} ｜ 在售总数: ${r.totalResults} ｜ 货源数: ${r.offers.length}`);
  if (!r.realtime || r.offers.length === 0) throw new Error('搜索未返回实时货源');
  for (const o of r.offers) {
    console.log(`  ¥${o.price} ｜ ${o.sales} ｜ 回头率${o.repurchaseRate || '—'} ｜ ${o.title.slice(0, 30)}`);
    console.log(`    numIid=${o.numIid} ｜ ${o.url}`);
  }
  if (r.totalResults === undefined || r.totalResults <= 0) throw new Error('缺少在售总数（竞争信号）');
  if (r.offers.some((o) => !o.numIid || o.price <= 0)) throw new Error('货源缺 numIid 或价格异常');

  // 2. 商品详情（取第一个货源）
  console.log('\n========== 2. getSourcingDetail（商品详情）==========');
  const d = await getSourcingDetail(r.offers[0].numIid as string);
  if (!d) throw new Error('详情返回为空');
  console.log(`标题: ${d.title}`);
  console.log(`单价: ¥${d.price} ｜ 起订: ${d.moq}${d.unit} ｜ 已售: ${d.sales}`);
  console.log(`阶梯价: ${d.priceLadder.map((t) => `≥${t.minQty}→¥${t.price}`).join(' / ') || '无'}`);
  console.log(`产业带: ${d.location} ｜ 供应商: ${d.supplier} ｜ SKU数: ${d.skuCount}`);
  if (d.price <= 0) throw new Error('详情价格异常');

  console.log('\n全部通过');
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
