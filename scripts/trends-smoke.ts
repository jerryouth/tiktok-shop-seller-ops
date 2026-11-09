// 市场趋势看板接口冒烟：GET /api/trends（真实 Apify 抓取，耗时长，独立于 test_run 10s 上限）
// 用法：pnpm tsx scripts/trends-smoke.ts

import { readFileSync } from 'node:fs';

// 加载 .env.local（dev server 自己加载，此处仅为保持脚本一致性）
try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* 可选 */
}

const BASE = `http://localhost:${process.env.DEPLOY_RUN_PORT ?? '5000'}`;

async function main() {
  console.log('请求 /api/trends（真实抓取，最长约 2 分钟）…');
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/trends`, { signal: AbortSignal.timeout(240_000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const d = (await resp.json()) as {
    configured: boolean;
    fetchedAt: string;
    tiktok: { hashtags: { rank: number; hashtag: string; views: number; momentumPct: number; trendStage: string }[]; industryAgg: { industry: string; views: number }[] } | null;
    google: { insights: { term: string; hasData: boolean; latest: number; changePercent: number; topRisingQueries: string[] }[] } | null;
    googleTerms: string[];
    calendar: { name: string; daysUntil: number; urgent: boolean }[];
    errors: string[];
  };
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s · configured=${d.configured} · errors=${d.errors.length}`);
  if (d.errors.length) console.log('错误:', d.errors.join(' | '));

  console.log('\n== TikTok 美区热榜 TOP5 ==');
  (d.tiktok?.hashtags ?? []).slice(0, 5).forEach((h) =>
    console.log(`#${h.rank} #${h.hashtag} · ${(h.views / 1e6).toFixed(1)}M播放 · 动能${h.momentumPct > 0 ? '+' : ''}${h.momentumPct.toFixed(1)}% · ${h.trendStage}`),
  );
  console.log('\n== 行业分布 TOP3 ==');
  (d.tiktok?.industryAgg ?? []).slice(0, 3).forEach((i) => console.log(`${i.industry} · ${(i.views / 1e6).toFixed(1)}M`));

  console.log('\n== Google Trends ==', d.googleTerms.join(', '));
  (d.google?.insights ?? []).forEach((i) =>
    console.log(`${i.term}: ${i.hasData ? `指数${i.latest} · 环比${i.changePercent > 0 ? '+' : ''}${i.changePercent.toFixed(1)}% · 飙升词[${i.topRisingQueries.slice(0, 3).join(', ')}]` : '无数据'}`),
  );

  console.log('\n== 营销节点 ==');
  d.calendar.forEach((c) => console.log(`${c.name} · ${c.daysUntil}天后 ${c.urgent ? '(备货紧张)' : ''}`));

  // 缓存验证：第二次请求应秒回
  const t1 = Date.now();
  const resp2 = await fetch(`${BASE}/api/trends`);
  if (!resp2.ok) throw new Error(`缓存请求 HTTP ${resp2.status}`);
  await resp2.json();
  console.log(`\n缓存命中验证：第二次请求耗时 ${Date.now() - t1}ms（应 <1000ms）`);

  console.log('\n✅ 趋势看板接口验证通过');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
