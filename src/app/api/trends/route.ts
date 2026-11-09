// 市场趋势看板聚合接口：TikTok Creative Center 官方榜 + Google Trends + 营销日历
// Apify 抓取耗时 30~120s，TikTok 榜与 Google 结果分别内存缓存 30 分钟
// ?terms=a,b 自定义 Google 查询词（复用 TikTok 榜缓存）；?refresh=1 强制刷新全部

import { NextRequest, NextResponse } from 'next/server';
import { getTrendsBundle } from '@/lib/trend-data';
import type { TrendsDashboardPayload } from '@/lib/trend-types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh') === '1';
  const terms = searchParams
    .get('terms')
    ?.split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  const bundle = await getTrendsBundle({ refresh, terms });

  const payload: TrendsDashboardPayload = {
    configured: bundle.configured,
    fetchedAt: new Date().toISOString(),
    tiktok: bundle.tiktok,
    google: bundle.google,
    googleTerms: bundle.googleTerms,
    calendar: bundle.calendar,
    errors: bundle.errors,
  };
  return NextResponse.json(payload);
}
