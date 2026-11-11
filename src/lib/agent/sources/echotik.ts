/**
 * EchoTik 数据平台适配器（官方 Data API）
 * 文档：https://opendocs.echotik.live/
 * 认证：Basic Auth（username:password → Base64）
 * 能力：商品榜单（热销/热推 × 日/周/月）、商品经营详情（1/7/30/90 天销量/GMV/带货结构）
 * 注意：榜单数据为离线收录有延迟——本周/当月榜单可能未生成，自动向前回退周期取数；
 *       全球共享账号配额，结果经 globalThis 24h 缓存。
 */

export interface EchotikRankedProduct {
  productId: string;
  name: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  /** 佣金率 0-1 */
  commissionRate: number;
  /** 榜单周期内销量增量 */
  periodSales: number;
  /** 榜单周期内销售额增量（美元） */
  periodGmv: number;
  /** 周期内总带货达人数 */
  influencerCnt: number;
  videoCnt: number;
  liveCnt: number;
  coverUrl: string | null;
  categoryId: string;
}

export interface EchotikProductDetail {
  productId: string;
  name: string;
  region: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  commissionRate: number;
  rating: number;
  reviewCount: number;
  sellerId: string;
  /** 近 1/7/30 天销量 */
  sales1d: number;
  sales7d: number;
  sales30d: number;
  gmv7d: number;
  gmv30d: number;
  totalSales: number;
  totalGmv: number;
  /** 近 30 天带货结构 */
  videoCnt30d: number;
  liveCnt30d: number;
  influencerVideoCnt30d: number;
  influencerLiveCnt30d: number;
  views30d: number;
  coverUrl: string | null;
}

export interface RankingsResult {
  items: EchotikRankedProduct[];
  /** 实际命中的榜单日期（yyyy-MM-dd） */
  date: string;
  rankType: 1 | 2 | 3;
  rankField: 1 | 2;
}

// ---------- 缓存（globalThis，HMR 安全） ----------
const BASE = 'https://open.echotik.live/api/v3/echotik';

interface CacheEntry<T> {
  data: T;
  expires: number;
}
const g = globalThis as unknown as { __echotikCache?: Map<string, CacheEntry<unknown>> };
function cacheGet<T>(key: string): T | null {
  const hit = g.__echotikCache?.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  return null;
}
function cacheSet<T>(key: string, data: T, ttlMs = 24 * 60 * 60 * 1000): void {
  if (!g.__echotikCache) g.__echotikCache = new Map();
  if (g.__echotikCache.size > 200) {
    const oldest = g.__echotikCache.keys().next().value;
    if (oldest) g.__echotikCache.delete(oldest);
  }
  g.__echotikCache.set(key, { data, expires: Date.now() + ttlMs });
}

export function isEchotikConfigured(): boolean {
  return Boolean(process.env.ECHOTIK_USERNAME && process.env.ECHOTIK_PASSWORD);
}

async function callApi<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const username = process.env.ECHOTIK_USERNAME;
  const password = process.env.ECHOTIK_PASSWORD;
  if (!username || !password) throw new Error('未配置 ECHOTIK_USERNAME / ECHOTIK_PASSWORD');

  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const resp = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(25000),
    cache: 'no-store',
  });
  if (resp.status === 401) throw new Error('EchoTik 认证失败（401）：请检查 username/password');
  if (!resp.ok) throw new Error(`EchoTik 接口 HTTP ${resp.status}`);

  const json = (await resp.json().catch(() => null)) as
    | { code?: number; message?: string; data?: T }
    | null;
  if (!json || typeof json !== 'object') throw new Error('EchoTik 返回体解析失败');
  if (json.code !== 0) {
    throw new Error(`EchoTik 接口错误[${json.code}]：${json.message || '未知错误'}`);
  }
  return json.data as T;
}

// ---------- 榜单日期推算 ----------
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** 生成候选榜单日期（从新到旧，最多 4 个周期） */
function candidateDates(rankType: 1 | 2 | 3): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let back = 0; back < 4; back++) {
    const d = new Date(now);
    if (rankType === 2) {
      // 周榜：周一
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - (day - 1) - 7 * back);
    } else if (rankType === 3) {
      // 月榜：每月 1 号
      d.setMonth(d.getMonth() - back, 1);
    } else {
      // 天榜
      d.setDate(d.getDate() - back);
    }
    dates.push(fmt(d));
  }
  return dates;
}

interface RawRankItem {
  product_id?: string;
  product_name?: string;
  spu_avg_price?: number;
  min_price?: number;
  max_price?: number;
  product_commission_rate?: number;
  total_sale_cnt?: number;
  total_sale_gmv_amt?: number;
  total_ifl_cnt?: number;
  total_video_cnt?: number;
  total_live_cnt?: number;
  original_cover_url?: string;
  category_id?: string;
}

/**
 * 拉取商品榜单；自动向前回退周期直到有数据。
 */
export async function getProductRankings(opts: {
  rankField?: 1 | 2;
  rankType?: 1 | 2 | 3;
  categoryId?: string;
  fromFlag?: 1 | 2;
  limit?: number;
}): Promise<RankingsResult> {
  const rankField = opts.rankField ?? 1;
  const rankType = opts.rankType ?? 2;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 10);

  for (const date of candidateDates(rankType)) {
    const cacheKey = `rank:${rankType}:${rankField}:${date}:${opts.categoryId ?? ''}:${opts.fromFlag ?? ''}:${limit}`;
    const cached = cacheGet<RankingsResult>(cacheKey);
    if (cached) return cached;

    const params: Record<string, string | number> = {
      date,
      region: 'US',
      product_rank_field: rankField,
      rank_type: rankType,
      page_num: 1,
      page_size: limit,
    };
    if (opts.categoryId) params.category_id = opts.categoryId;
    if (opts.fromFlag) params.from_flag = opts.fromFlag;

    const data = await callApi<RawRankItem[]>('/product/ranklist', params);
    if (!Array.isArray(data) || data.length === 0) continue; // 该周期未收录，回退上一周期

    const result: RankingsResult = {
      date,
      rankType,
      rankField,
      items: data.slice(0, limit).map((r) => ({
        productId: r.product_id ?? '',
        name: r.product_name ?? '',
        avgPrice: r.spu_avg_price ?? 0,
        minPrice: r.min_price ?? 0,
        maxPrice: r.max_price ?? 0,
        commissionRate: r.product_commission_rate ?? 0,
        periodSales: r.total_sale_cnt ?? 0,
        periodGmv: r.total_sale_gmv_amt ?? 0,
        influencerCnt: r.total_ifl_cnt ?? 0,
        videoCnt: r.total_video_cnt ?? 0,
        liveCnt: r.total_live_cnt ?? 0,
        coverUrl: r.original_cover_url ?? null,
        categoryId: r.category_id ?? '',
      })),
    };
    cacheSet(cacheKey, result);
    return result;
  }
  throw new Error('近 4 个周期榜单均无数据（EchoTik 未收录）');
}

interface RawDetail {
  product_id?: string;
  product_name?: string;
  region?: string;
  spu_avg_price?: number;
  min_price?: number;
  max_price?: number;
  product_commission_rate?: number;
  product_rating?: number;
  review_count?: number;
  seller_id?: string;
  total_sale_1d_cnt?: number;
  total_sale_7d_cnt?: number;
  total_sale_30d_cnt?: number;
  total_sale_gmv_7d_amt?: number;
  total_sale_gmv_30d_amt?: number;
  total_sale_cnt?: number;
  total_sale_gmv_amt?: number;
  total_video_30d_cnt?: number;
  total_live_30d_cnt?: number;
  total_ifl_video_30d_cnt?: number;
  total_ifl_live_30d_cnt?: number;
  total_views_30d_cnt?: number;
  cover_url?: string;
}

/** 商品经营详情（单品深度验证） */
export async function getProductDetail(
  productId: string,
): Promise<EchotikProductDetail | null> {
  const cacheKey = `pd:${productId}`;
  const cached = cacheGet<EchotikProductDetail>(cacheKey);
  if (cached) return cached;

  const data = await callApi<RawDetail[]>('/product/detail', {
    product_ids: productId,
  });
  const r = Array.isArray(data) ? data[0] : undefined;
  if (!r) return null;

  // cover_url 是 JSON 字符串数组：[{"url":"...","index":0},...]
  let coverUrl: string | null = null;
  if (r.cover_url) {
    try {
      const arr = JSON.parse(r.cover_url) as { url?: string }[];
      coverUrl = arr[0]?.url ?? null;
    } catch {
      coverUrl = null;
    }
  }

  const detail: EchotikProductDetail = {
    productId: r.product_id ?? productId,
    name: r.product_name ?? '',
    region: r.region ?? 'US',
    avgPrice: r.spu_avg_price ?? 0,
    minPrice: r.min_price ?? 0,
    maxPrice: r.max_price ?? 0,
    commissionRate: r.product_commission_rate ?? 0,
    rating: r.product_rating ?? 0,
    reviewCount: r.review_count ?? 0,
    sellerId: r.seller_id ?? '',
    sales1d: r.total_sale_1d_cnt ?? 0,
    sales7d: r.total_sale_7d_cnt ?? 0,
    sales30d: r.total_sale_30d_cnt ?? 0,
    gmv7d: r.total_sale_gmv_7d_amt ?? 0,
    gmv30d: r.total_sale_gmv_30d_amt ?? 0,
    totalSales: r.total_sale_cnt ?? 0,
    totalGmv: r.total_sale_gmv_amt ?? 0,
    videoCnt30d: r.total_video_30d_cnt ?? 0,
    liveCnt30d: r.total_live_30d_cnt ?? 0,
    influencerVideoCnt30d: r.total_ifl_video_30d_cnt ?? 0,
    influencerLiveCnt30d: r.total_ifl_live_30d_cnt ?? 0,
    views30d: r.total_views_30d_cnt ?? 0,
    coverUrl,
  };
  cacheSet(cacheKey, detail);
  return detail;
}
