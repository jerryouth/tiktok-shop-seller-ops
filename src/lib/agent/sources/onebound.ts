/**
 * Onebound（万邦）1688 开放接口适配器
 *
 * 三个能力：
 * - item_search     文字搜索：标题/价格/销量/回头率/详情链接 + real_total_results（在售商品数=竞争信号）
 * - item_get        商品详情：阶梯价/起订量/产业带/供应商/SKU 数（用于精细经济测算与供应商尽调）
 * - item_search_img 以图搜款：需先 img_upload 换 imgid（注意：该能力需供应商为账号单独开通，
 *                  未开通时抛出友好错误，调用方降级处理）
 *
 * 【配额保护】账号每日调用上限极低（api_info 返回 max:10/日），因此：
 * - 所有成功响应写入 globalThis 缓存（搜索 24h / 详情 24h），HMR 与重启内安全
 * - 调用方应把"每个关键词只查一次"作为纪律
 *
 * 环境变量：ONEBOUND_KEY / ONEBOUND_SECRET
 */

const BASE_URL = 'https://api-gw.onebound.cn/1688';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export interface OneboundOffer {
  numIid: string;
  title: string;
  /** 最低单价（人民币元） */
  price: number;
  /** 已售件数（1688 前台口径） */
  sales: number;
  /** 回头率（如 "25%"），可能为空 */
  tagPercent: string;
  picUrl: string;
  detailUrl: string;
}

export interface OneboundSearchResult {
  offers: OneboundOffer[];
  /** 在售商品总数（竞争环境信号：供过于求=红海） */
  totalResults: number;
}

export interface OneboundPriceTier {
  minQty: number;
  price: number;
}

export interface OneboundItemDetail {
  numIid: string;
  title: string;
  /** 当前最低单价 */
  price: number;
  /** 阶梯价（起批量 → 单价），测试期/放量期成本分开算的依据 */
  priceLadder: OneboundPriceTier[];
  /** 起订量 */
  moq: number;
  unit: string;
  /** 发货地/产业带（如"广东省中山市"） */
  location: string;
  sales: number;
  supplier: string;
  shopUrl: string;
  detailUrl: string;
  /** SKU 数量（规格丰富度） */
  skuCount: number;
  /** 规格属性样例（如"灯光颜色:圣诞3片装"） */
  propsSample: string[];
  itemWeight: string | null;
}

interface CacheEntry {
  data: unknown;
  expires: number;
}

const g = globalThis as unknown as { __oneboundCache?: Map<string, CacheEntry> };

function cacheStore(): Map<string, CacheEntry> {
  if (!g.__oneboundCache) g.__oneboundCache = new Map();
  return g.__oneboundCache;
}

function cacheGet<T>(key: string): T | null {
  const hit = cacheStore().get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cacheStore().delete(key);
    return null;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown): void {
  const store = cacheStore();
  if (store.size >= CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

export function isOneboundConfigured(): boolean {
  return Boolean(process.env.ONEBOUND_KEY && process.env.ONEBOUND_SECRET);
}

function credentials(): { key: string; secret: string } {
  const key = process.env.ONEBOUND_KEY;
  const secret = process.env.ONEBOUND_SECRET;
  if (!key || !secret) throw new Error('未配置 ONEBOUND_KEY / ONEBOUND_SECRET');
  return { key, secret };
}

interface OneboundEnvelope {
  error_code?: string;
  error?: string;
  reason?: string;
  [k: string]: unknown;
}

/** 统一调用：GET 拼接参数，校验 error_code=0000 */
async function callApi(path: string, params: Record<string, string>): Promise<OneboundEnvelope> {
  const { key, secret } = credentials();
  const qs = new URLSearchParams({ key, secret, lang: 'zh-CN', ...params });
  const resp = await fetch(`${BASE_URL}/${path}/?${qs.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`Onebound 接口 HTTP ${resp.status}`);
  const json = (await resp.json()) as OneboundEnvelope;
  const code = json.error_code ?? '';
  if (code && code !== '0000') {
    const msg = String(json.error || json.reason || `error_code=${code}`);
    // 无权访问（如 img_upload 未开通）单独给出可操作的提示
    if (code === '4005' || msg.includes('无权访问')) {
      throw new Error(`Onebound 接口能力未开通（${path}），需联系供应商开通后使用`);
    }
    throw new Error(`Onebound 接口错误：${msg.slice(0, 120)}`);
  }
  return json;
}

function parseNum(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

function normalizeOffer(raw: unknown): OneboundOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? '').trim();
  const numIid = String(o.num_iid ?? '').trim();
  if (!title || !numIid) return null;
  return {
    numIid,
    title: title.slice(0, 80),
    price: parseNum(o.promotion_price ?? o.price),
    sales: parseNum(o.sales),
    tagPercent: String(o.tag_percent ?? ''),
    picUrl: String(o.pic_url ?? ''),
    detailUrl: String(o.detail_url ?? `https://detail.1688.com/offer/${numIid}.html`),
  };
}

function normalizeSearch(json: OneboundEnvelope, limit: number): OneboundSearchResult {
  const items = (json.items ?? {}) as Record<string, unknown>;
  const list = Array.isArray(items.item) ? items.item : [];
  return {
    offers: list
      .map(normalizeOffer)
      .filter((o): o is OneboundOffer => o !== null)
      .slice(0, limit),
    totalResults: parseNum(items.real_total_results ?? items.total_results),
  };
}

/** 文字搜索 1688 货源（24h 缓存，配额保护） */
export async function oneboundSearch(keyword: string, limit = 5): Promise<OneboundSearchResult> {
  const cacheKey = `search:${keyword}:${limit}`;
  const cached = cacheGet<OneboundSearchResult>(cacheKey);
  if (cached) return cached;
  const json = await callApi('item_search', {
    q: keyword,
    page: '1',
    page_size: String(Math.min(40, Math.max(1, limit))),
  });
  const result = normalizeSearch(json, limit);
  cacheSet(cacheKey, result);
  return result;
}

/** 商品详情：阶梯价/起订量/产业带/供应商（24h 缓存，配额保护） */
export async function oneboundItemDetail(numIid: string): Promise<OneboundItemDetail> {
  const cacheKey = `detail:${numIid}`;
  const cached = cacheGet<OneboundItemDetail>(cacheKey);
  if (cached) return cached;
  const json = await callApi('item_get', { num_iid: numIid });
  const item = (json.item ?? {}) as Record<string, unknown>;

  const ladder: OneboundPriceTier[] = [];
  if (Array.isArray(item.priceRange)) {
    for (const tier of item.priceRange) {
      if (Array.isArray(tier) && tier.length >= 2) {
        ladder.push({ minQty: parseNum(tier[0]), price: parseNum(tier[1]) });
      }
    }
  }
  const seller = (item.seller_info ?? {}) as Record<string, unknown>;
  const skus = (item.skus ?? {}) as Record<string, unknown>;
  const skuList = Array.isArray(skus.sku) ? skus.sku : [];
  const propsList = (item.props_list ?? {}) as Record<string, unknown>;
  const propsSample = Object.values(propsList)
    .slice(0, 6)
    .map((v) => String(v));

  const detail: OneboundItemDetail = {
    numIid,
    title: String(item.title ?? '').slice(0, 80),
    price: parseNum(item.price),
    priceLadder: ladder,
    moq: parseNum(item.min_num),
    unit: String(item.unit ?? '件'),
    location: String(item.location ?? ''),
    sales: parseNum(item.sales ?? item.total_sold),
    supplier: String(seller.nick ?? seller.title ?? ''),
    shopUrl: String(seller.zhuy ?? ''),
    detailUrl: String(item.detail_url ?? `https://detail.1688.com/offer/${numIid}.html`),
    skuCount: skuList.length,
    propsSample,
    itemWeight: item.item_weight ? String(item.item_weight) : null,
  };
  cacheSet(cacheKey, detail);
  return detail;
}

/** base64（可带 data: 前缀）→ img_upload 换 imgid */
async function uploadImage(base64: string): Promise<string> {
  const { key, secret } = credentials();
  const body = new URLSearchParams({ key, secret, img: base64 });
  const resp = await fetch(`${BASE_URL}/img_upload/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`图片上传 HTTP ${resp.status}`);
  const json = (await resp.json()) as OneboundEnvelope & { imgid?: string };
  const code = json.error_code ?? '';
  if (code && code !== '0000') {
    const msg = String(json.error || json.reason || '');
    if (code === '4005' || msg.includes('无权访问')) {
      throw new Error('以图搜款能力未开通：账号的 img_upload 接口无权访问，需联系 Onebound 供应商开通（开通后本功能自动生效）');
    }
    throw new Error(`图片上传失败：${msg.slice(0, 120)}`);
  }
  const imgid = String(json.imgid ?? '');
  if (!imgid) throw new Error('图片上传未返回 imgid');
  return imgid;
}

/** 以图搜款：base64 图片 → 相似货源（img_upload 未开通时抛友好错误，由调用方降级） */
export async function oneboundSearchByImage(
  imageBase64: string,
  limit = 5,
): Promise<OneboundSearchResult> {
  const base64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const imgid = await uploadImage(base64);
  const json = await callApi('item_search_img', { imgid });
  return normalizeSearch(json, limit);
}
