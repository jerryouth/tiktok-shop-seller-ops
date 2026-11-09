// 选品机会洞察接口：规则层商机分 + LLM 话题→商品推导
// 依赖 trend-data 共享缓存（TikTok 榜未缓存时首次仍需 30~120s 抓取，之后 LLM 分析约 15~40s）
// 洞察结果按 TikTok 榜签名缓存 30 分钟；?refresh=1 强制全部重新生成

import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { getTrendsBundle } from '@/lib/trend-data';
import { scoreTrends } from '@/lib/trend-score';
import { generateTrendInsights } from '@/lib/trend-insights';
import type { TrendInsightsPayload } from '@/lib/trend-types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 30 * 60 * 1000;

const g = globalThis as unknown as {
  __trendInsightsCache?: { key: string; data: TrendInsightsPayload; expiresAt: number };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh') === '1';

  const bundle = await getTrendsBundle({ refresh });
  const scoredTrends = bundle.tiktok ? scoreTrends(bundle.tiktok.hashtags, bundle.google) : [];

  // 缓存键：榜单头部话题签名（榜单变了才重新调用 LLM）
  const cacheKey = scoredTrends
    .slice(0, 8)
    .map((t) => `${t.hashtag}:${Math.round(t.momentumPct)}`)
    .join('|');
  const cached = g.__trendInsightsCache;
  if (!refresh && cached && cached.key === cacheKey && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const errors = [...bundle.errors];
  let ai: { marketSummary: string; opportunities: TrendInsightsPayload['opportunities'] } | null = null;
  if (bundle.configured && scoredTrends.length > 0) {
    const headers = HeaderUtils.extractForwardHeaders(request.headers);
    ai = await generateTrendInsights(scoredTrends, bundle.google, bundle.calendar, headers);
    if (!ai) errors.push('AI 洞察生成失败，当前仅展示规则层商机分');
  } else if (!bundle.configured) {
    errors.push('未配置 APIFY_TOKEN，无法生成趋势洞察');
  }

  const payload: TrendInsightsPayload = {
    fetchedAt: new Date().toISOString(),
    marketSummary: ai?.marketSummary ?? '',
    opportunities: ai?.opportunities ?? [],
    scoredTrends,
    aiGenerated: ai !== null,
    errors,
  };
  g.__trendInsightsCache = { key: cacheKey, data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
  return NextResponse.json(payload);
}
