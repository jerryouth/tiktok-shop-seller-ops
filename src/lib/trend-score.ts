// 趋势 → 电商结论【规则层】：把 TikTok/CC 原始榜单量化成 0-100 商机分
// 纯函数、无服务端依赖，前后端共用（看板表格列 + 洞察接口共用同一套分数）

import type { GoogleTrendsResult } from '@/lib/agent/sources/apify';
import type { TikTokHashtagTrend } from '@/lib/agent/sources/apify';
import type { ScoredTrend, TrendScoreBreakdown } from '@/lib/trend-types';

/** 电商可变现行业（命中加分，政治/新闻类话题天然落在区间外） */
const COMMERCE_INDUSTRY_RE =
  /beauty|fashion|apparel|home|food|tech|electronic|sport|fitness|toy|pet|baby|health|lifestyle|automotive|garden|accessor|jewel|travel|outdoor/i;

/** 明显不可变现的政治/选举/新闻噪音词（直接压分，避免占据商机榜头部） */
const NOISE_RE =
  /vote|election|politic|congress|senate|trump|biden|democrat|republican|maga|bluewave|redwave|news|protest|war\b|policy|border|immigration|sema20|sema_show/i;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** 阶段系数：上升期追趋势正当时，衰退期进场即接盘 */
function stageMultiplier(stage: string, direction: string): number {
  const s = stage.toLowerCase();
  if (s.includes('rising') || s.includes('上升')) return 1.15;
  if (s.includes('emerging') || s.includes('新兴') || s.includes('new')) return 1.1;
  if (s.includes('peak') || s.includes('爆发') || s.includes('top')) return 1.0;
  if (s.includes('declin') || s.includes('fall') || s.includes('衰退') || direction === 'down') return 0.45;
  return 0.9;
}

/** 规模分：7 日播放量 log 刻度。10 万→20 / 100 万→40 / 1000 万→60 / 1 亿→80 / 10 亿→100 */
function scaleScore(views: number): number {
  return clamp(Math.round((Math.log10(Math.max(views, 1)) - 5) * 20 + 20), 0, 100);
}

/** 动能分：环比百分比映射到 0-100，+100% 以上即满分；下降趋势封顶 45 */
function momentumScore(momentumPct: number, direction: string): number {
  const base = clamp(Math.round(50 + momentumPct * 0.5), 0, 100);
  return direction === 'down' ? Math.min(base, 45) : base;
}

/** 互动深度分：播放/发帖比越高，说明消费端需求大于内容供给（蓝海信号） */
function engagementScore(views: number, posts: number): number {
  if (posts <= 0) return 30;
  const vpp = views / posts;
  return clamp(Math.round(Math.log10(Math.max(vpp, 1)) * 20), 10, 100);
}

/** 电商相关度：行业标签命中可变现品类得满分，纯政治/新闻话题重罚 */
function commerceScore(hashtag: string, industries: string[]): number {
  if (NOISE_RE.test(hashtag)) return 5;
  return industries.some((i) => COMMERCE_INDUSTRY_RE.test(i)) ? 100 : 30;
}

/** Google 印证：搜索需求同步上升才加分（TikTok 独涨多为内容热点，来得快去得快） */
function googleBoostScore(hashtag: string, google: GoogleTrendsResult | null): number {
  if (!google) return 0;
  const key = hashtag.replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const compact = key.replace(/\s+/g, '');
  const insight = google.insights.find((i) => {
    const term = i.term.toLowerCase();
    return term === key || term.replace(/\s+/g, '') === compact;
  });
  if (!insight || !insight.hasData) return 0;
  let boost = 0;
  if (insight.direction === 'up') boost += 10;
  if (insight.direction === 'flat' && (insight.momentumPercent ?? 0) > 0) boost += 5;
  if (insight.isNearPeak) boost += 4;
  if ((insight.momentumPercent ?? 0) >= 30) boost += 3;
  return clamp(boost, 0, 15);
}

/**
 * 综合商机分 = (规模 25% + 动能 30% + 互动 15% + 电商相关度 20%) × 阶段系数 + Google 印证
 * 权重取向：动能 > 规模（追增长而非追存量），电商相关度用于过滤噪音榜
 */
export function scoreTrend(
  h: TikTokHashtagTrend,
  rank: number,
  google: GoogleTrendsResult | null,
): ScoredTrend {
  const breakdown: TrendScoreBreakdown = {
    scale: scaleScore(h.views),
    momentum: momentumScore(h.momentumPct, h.trendDirection),
    engagement: engagementScore(h.views, h.posts),
    commerce: commerceScore(h.hashtag, h.industries),
    googleBoost: googleBoostScore(h.hashtag, google),
    stageMultiplier: stageMultiplier(h.trendStage, h.trendDirection),
  };
  const base =
    breakdown.scale * 0.25 +
    breakdown.momentum * 0.3 +
    breakdown.engagement * 0.15 +
    breakdown.commerce * 0.2;
  const score = clamp(Math.round(base * breakdown.stageMultiplier + breakdown.googleBoost), 0, 100);
  const verdict: ScoredTrend['verdict'] =
    score >= 70 ? 'strong' : score >= 55 ? 'follow' : score >= 40 ? 'watch' : 'avoid';
  return {
    hashtag: h.hashtag,
    rank,
    views: h.views,
    posts: h.posts,
    momentumPct: h.momentumPct,
    trendDirection: h.trendDirection,
    trendStage: h.trendStage,
    industries: h.industries,
    score,
    breakdown,
    verdict,
  };
}

export function scoreTrends(
  hashtags: TikTokHashtagTrend[],
  google: GoogleTrendsResult | null,
): ScoredTrend[] {
  return hashtags
    .map((h, i) => scoreTrend(h, i + 1, google))
    .sort((a, b) => b.score - a.score);
}
