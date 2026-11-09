// Apify 数据源直连冒烟：验证两个 Actor 真实返回（不经过 Next 服务）
// 运行：pnpm tsx scripts/apify-smoke.ts
import { fetchGoogleTrends, fetchTikTokHashtagTrends, isApifyConfigured } from '../src/lib/agent/sources/apify';

async function main() {
  if (!isApifyConfigured()) {
    console.error('FAIL: 未配置 APIFY_TOKEN（.env.local）');
    process.exit(1);
  }
  console.log('[1/2] TikTok Creative Center 美区 7 日话题榜…');
  const trends = await fetchTikTokHashtagTrends(5);
  if (trends.length === 0) throw new Error('TikTok 榜为空');
  for (const t of trends.slice(0, 5)) {
    console.log(
      `  #${t.rank} ${t.hashtag} | 播放${(t.views / 1e6).toFixed(1)}M | ${t.trendStage}/${t.trendDirection} ${t.momentumPct >= 0 ? '+' : ''}${t.momentumPct.toFixed(1)}%`,
    );
  }

  console.log('[2/2] Google Trends：magnetic lashes / pet cooling mat…');
  const gt = await fetchGoogleTrends(['magnetic lashes', 'pet cooling mat']);
  for (const it of gt.insights) {
    console.log(
      `  ${it.term} | hasData=${it.hasData} | latest=${it.latest} | momentum=${it.momentumPercent >= 0 ? '+' : ''}${it.momentumPercent}% | peak=${it.peakValue}(${it.peakDate})`,
    );
    if (it.topRisingQueries.length) console.log(`    飙升关联词: ${it.topRisingQueries.join(', ')}`);
  }
  console.log(`  兴趣时序点数: ${gt.interestOverTime.length}`);
  console.log('\nPASS: Apify 双数据源直连正常');
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
