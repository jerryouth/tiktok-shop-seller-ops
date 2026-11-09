// Apify 数据源：TikTok Creative Center 官方趋势榜 + Google Trends 搜索兴趣
// 通过 run-sync-get-dataset-items 同步运行 Actor，一次 HTTP 拿到数据集条目
// 配置：APIFY_TOKEN 必填；Actor ID 可用 APIFY_ACTOR_TT_CC / APIFY_ACTOR_GOOGLE_TRENDS 覆盖

const APIFY_BASE = 'https://api.apify.com/v2';

const DEFAULT_ACTOR_TT_CC = 'hyperbach~tiktok-creative-center-scraper';
const DEFAULT_ACTOR_GOOGLE_TRENDS = 'onepierre~google-trends-insights';

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

function apifyToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error('未配置 APIFY_TOKEN');
  return token;
}

function actorId(envKey: 'APIFY_ACTOR_TT_CC' | 'APIFY_ACTOR_GOOGLE_TRENDS', fallback: string): string {
  return process.env[envKey]?.trim() || fallback;
}

/** 同步运行 Actor 并返回数据集条目（超时秒数透传给 Apify 平台） */
async function runActorSync<T = Record<string, unknown>>(
  actor: string,
  input: Record<string, unknown>,
  timeoutSec = 60,
): Promise<T[]> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${apifyToken()}&timeout=${timeoutSec}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Apify Actor ${actor} 运行失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
  }
  const data: unknown = await resp.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

// ---------------------------------------------------------------------------
// TikTok Creative Center 官方榜（真实返回结构已验证）
// { rank, hashtag_name, hashtag_url, creative_center_url, posts, views,
//   industries[], trend_direction, trend_momentum_pct, trend_stage,
//   popularity_curve[{date,value}] }
// ---------------------------------------------------------------------------

export interface TikTokHashtagTrend {
  rank: number;
  hashtag: string;
  posts: number;
  views: number;
  industries: string[];
  trendStage: string;
  trendDirection: string;
  momentumPct: number;
  url: string;
  creativeCenterUrl: string;
}

interface RawTikTokItem {
  rank?: number;
  hashtag_name?: string;
  hashtag_url?: string;
  creative_center_url?: string;
  posts?: number;
  views?: number;
  industries?: string[];
  trend_direction?: string;
  trend_momentum_pct?: number;
  trend_stage?: string;
}

export async function fetchTikTokHashtagTrends(maxItems = 20): Promise<TikTokHashtagTrend[]> {
  const items = await runActorSync<RawTikTokItem>(
    actorId('APIFY_ACTOR_TT_CC', DEFAULT_ACTOR_TT_CC),
    {
      sections: ['hashtags'],
      hashtagCountries: ['US'],
      hashtagPeriods: ['7'],
      maxItems,
    },
    120,
  );
  return items
    .map((it) => ({
      rank: typeof it.rank === 'number' ? it.rank : 0,
      hashtag: typeof it.hashtag_name === 'string' ? it.hashtag_name : '',
      posts: typeof it.posts === 'number' ? it.posts : 0,
      views: typeof it.views === 'number' ? it.views : 0,
      industries: Array.isArray(it.industries) ? it.industries.filter((x): x is string => typeof x === 'string') : [],
      trendStage: typeof it.trend_stage === 'string' ? it.trend_stage : '',
      trendDirection: typeof it.trend_direction === 'string' ? it.trend_direction : '',
      momentumPct: typeof it.trend_momentum_pct === 'number' ? it.trend_momentum_pct : 0,
      url: typeof it.hashtag_url === 'string' ? it.hashtag_url : '',
      creativeCenterUrl: typeof it.creative_center_url === 'string' ? it.creative_center_url : '',
    }))
    .filter((t) => t.hashtag);
}

// ---------------------------------------------------------------------------
// Google Trends 搜索兴趣（真实返回结构已验证）
// { insights[{ term, hasData, direction, changePercent, momentumPercent,
//   latest, average, peak{value,date}, isNearPeak, topRisingQueries[],
//   topRegions[], summary }],
//   interestOverTime[{ date, values:{term:score} }] }
// ---------------------------------------------------------------------------

export interface GoogleTrendInsight {
  term: string;
  hasData: boolean;
  direction: string;
  changePercent: number;
  momentumPercent: number;
  latest: number;
  average: number;
  peakValue: number;
  peakDate: string;
  isNearPeak: boolean;
  topRisingQueries: string[];
  topRegions: string[];
  summary: string;
}

export interface GoogleTrendsResult {
  insights: GoogleTrendInsight[];
  interestOverTime: { date: string; values: Record<string, number> }[];
}

interface RawGoogleInsight {
  term?: string;
  hasData?: boolean;
  direction?: string;
  changePercent?: number;
  momentumPercent?: number;
  latest?: number;
  average?: number;
  peak?: { value?: number; date?: string };
  isNearPeak?: boolean;
  topRisingQueries?: unknown[];
  topRegions?: unknown[];
  summary?: string;
}

interface RawGoogleTrendsItem {
  insights?: RawGoogleInsight[];
  interestOverTime?: { date?: string; values?: Record<string, number> }[];
}

function asStringList(v: unknown[] | undefined, limit = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x !== null ? String(Object.values(x)[0] ?? '') : ''))
    .filter((x): x is string => Boolean(x))
    .slice(0, limit);
}

export async function fetchGoogleTrends(
  searchTerms: string[],
  timeRange = 'today 3-m',
  geo = 'US',
): Promise<GoogleTrendsResult> {
  const items = await runActorSync<RawGoogleTrendsItem>(
    actorId('APIFY_ACTOR_GOOGLE_TRENDS', DEFAULT_ACTOR_GOOGLE_TRENDS),
    { searchTerms, timeRange, geo },
    120,
  );
  const first = items[0] ?? {};
  const insights: GoogleTrendInsight[] = (first.insights ?? []).map((it) => ({
    term: typeof it.term === 'string' ? it.term : '',
    hasData: Boolean(it.hasData),
    direction: typeof it.direction === 'string' ? it.direction : '',
    changePercent: typeof it.changePercent === 'number' ? it.changePercent : 0,
    momentumPercent: typeof it.momentumPercent === 'number' ? it.momentumPercent : 0,
    latest: typeof it.latest === 'number' ? it.latest : 0,
    average: typeof it.average === 'number' ? it.average : 0,
    peakValue: typeof it.peak?.value === 'number' ? it.peak.value : 0,
    peakDate: typeof it.peak?.date === 'string' ? it.peak.date : '',
    isNearPeak: Boolean(it.isNearPeak),
    topRisingQueries: asStringList(it.topRisingQueries),
    topRegions: asStringList(it.topRegions),
    summary: typeof it.summary === 'string' ? it.summary : '',
  }));
  const interestOverTime = (first.interestOverTime ?? [])
    .map((p) => ({
      date: typeof p.date === 'string' ? p.date : '',
      values: typeof p.values === 'object' && p.values !== null ? p.values : {},
    }))
    .filter((p) => p.date);
  return { insights, interestOverTime };
}
