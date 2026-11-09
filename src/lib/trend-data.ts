// 趋势数据共享层：/api/trends 与 /api/trends/insights 共用的抓取 + 30 分钟内存缓存
// 缓存放 globalThis，保证 Next dev HMR 后缓存不丢

import {
  fetchGoogleTrends,
  fetchTikTokHashtagTrends,
  isApifyConfigured,
  type GoogleTrendsResult,
  type TikTokHashtagTrend,
} from '@/lib/agent/sources/apify';
import { getUpcomingEvents } from '@/lib/agent/sources/calendar';
import type { IndustryAgg } from '@/lib/trend-types';
import type { UpcomingEvent } from '@/lib/agent/sources/calendar';

const CACHE_TTL_MS = 30 * 60 * 1000;

export interface TikTokBlock {
  hashtags: TikTokHashtagTrend[];
  industryAgg: IndustryAgg[];
}

export interface TrendsBundle {
  configured: boolean;
  tiktok: TikTokBlock | null;
  google: GoogleTrendsResult | null;
  googleTerms: string[];
  calendar: UpcomingEvent[];
  errors: string[];
}

const g = globalThis as unknown as {
  __ttTrendsCache?: { data: TikTokBlock; expiresAt: number };
  __googleTrendsCache?: Map<string, { data: GoogleTrendsResult; expiresAt: number }>;
};

function googleCache(): Map<string, { data: GoogleTrendsResult; expiresAt: number }> {
  if (!g.__googleTrendsCache) g.__googleTrendsCache = new Map();
  return g.__googleTrendsCache;
}

/** 电商相关行业（Google 默认查询词优先取这些行业的话题，过滤政治/新闻类噪音） */
const COMMERCE_INDUSTRY_RE =
  /beauty|fashion|apparel|home|food|tech|electronic|sport|fitness|toy|pet|baby|health|lifestyle|automotive|garden|accessor|jewel|travel|outdoor/i;

/** 从榜单话题推导 Google 查询词：优先电商相关行业，去 #、拆驼峰，取前 4 个 */
export function deriveGoogleTerms(trends: TikTokHashtagTrend[]): string[] {
  const normalize = (h: string) =>
    h
      .replace(/^#/, '')
      .trim()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();
  const valid = (t: string) => /^[a-z0-9 ]{3,40}$/.test(t);
  const commerce = trends
    .filter((t) => t.industries.some((i) => COMMERCE_INDUSTRY_RE.test(i)))
    .map((t) => normalize(t.hashtag))
    .filter(valid);
  const rest = trends.map((t) => normalize(t.hashtag)).filter(valid);
  const merged = [...commerce, ...rest].filter((t, i, arr) => arr.indexOf(t) === i);
  return merged.slice(0, 4);
}

async function loadTikTok(refresh: boolean, errors: string[]): Promise<TikTokBlock | null> {
  const cached = g.__ttTrendsCache;
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const hashtags = await fetchTikTokHashtagTrends(20);
    const industryMap = new Map<string, { views: number; count: number }>();
    for (const h of hashtags) {
      for (const ind of h.industries) {
        const cur = industryMap.get(ind) ?? { views: 0, count: 0 };
        cur.views += h.views;
        cur.count += 1;
        industryMap.set(ind, cur);
      }
    }
    const industryAgg = [...industryMap.entries()]
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.views - a.views);
    const data: TikTokBlock = { hashtags, industryAgg };
    g.__ttTrendsCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (e) {
    errors.push(`TikTok Creative Center 抓取失败：${e instanceof Error ? e.message : String(e)}`);
    return cached?.data ?? null;
  }
}

async function loadGoogle(
  terms: string[],
  refresh: boolean,
  errors: string[],
): Promise<GoogleTrendsResult | null> {
  if (terms.length === 0) return null;
  const key = terms.join(',').toLowerCase();
  const cached = googleCache().get(key);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const data = await fetchGoogleTrends(terms);
    googleCache().set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (e) {
    errors.push(`Google Trends 抓取失败：${e instanceof Error ? e.message : String(e)}`);
    return cached?.data ?? null;
  }
}

/** 聚合抓取：TikTok 榜与 Google 并行，日历本地生成；各自独立缓存、独立容错 */
export async function getTrendsBundle(options?: {
  refresh?: boolean;
  terms?: string[];
}): Promise<TrendsBundle> {
  const refresh = options?.refresh === true;
  const errors: string[] = [];
  const calendar = getUpcomingEvents(new Date(), 120).slice(0, 4);

  if (!isApifyConfigured()) {
    return {
      configured: false,
      tiktok: null,
      google: null,
      googleTerms: [],
      calendar,
      errors: ['未配置 APIFY_TOKEN，无法抓取 TikTok / Google 真实趋势数据'],
    };
  }

  const tiktok = await loadTikTok(refresh, errors);
  const googleTerms =
    options?.terms && options.terms.length > 0 ? options.terms : deriveGoogleTerms(tiktok?.hashtags ?? []);
  const google = await loadGoogle(googleTerms, refresh, errors);

  return { configured: true, tiktok, google, googleTerms, calendar, errors };
}
