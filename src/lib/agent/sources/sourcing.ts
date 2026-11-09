/**
 * 货源数据源适配器层（1688）
 *
 * 设计思路与 TrendDataSource 相同：定义统一接口，当前提供基于环境变量的
 * HTTP 实现（Http1688SourcingSource），未配置时优雅降级为「直达搜索链接」。
 *
 * 【接口配置】在环境变量中配置后即可启用真实数据：
 *   SOURCING_1688_API_URL - 1688 数据服务地址（POST）
 *   SOURCING_1688_API_KEY - 鉴权 Key（Bearer 头）
 *
 * 请求体：{ "query": "中文关键词", "limit": 5 }
 * 期望响应（容忍常见字段别名，见 normalizeOffer）：
 *   { "offers": [{ "title": "...", "price": 12.5, "moq": 2, "supplier": "...",
 *                  "location": "...", "sales": "...", "repurchaseRate": "...",
 *                  "url": "https://detail.1688.com/..." }] }
 */

export interface SourcingOffer {
  /** 商品标题 */
  title: string;
  /** 单价（人民币元） */
  price: number;
  /** 起订量（件），0 = 未知（列表接口不返回时可调详情接口查） */
  moq: number;
  /** 供应商名 */
  supplier: string;
  /** 发货地/产业带 */
  location: string;
  /** 成交量描述（如「月销 3000+」） */
  sales: string;
  /** 回头率描述（如「32%」） */
  repurchaseRate: string;
  /** 1688 详情页链接 */
  url: string;
  /** 1688 商品 ID（用于 getSourcingDetail 查阶梯价/起订量） */
  numIid?: string;
  /** 商品主图 */
  picUrl?: string;
}

export interface SourcingResult {
  keyword: string;
  searchUrl: string;
  offers: SourcingOffer[];
  /** 在售商品总数（竞争环境信号），仅真实接口提供 */
  totalResults?: number;
  /** 数据是否来自实时接口（true=A 级证据；false=降级直达链接） */
  realtime: boolean;
}

export interface SourcingDataSource {
  name: string;
  /** 接口是否已配置可用 */
  available(): boolean;
  search(keyword: string, limit?: number): Promise<SourcingOffer[]>;
}

/** 1688 找货链接统一走 GBK 编码实现（1688 搜索接口按 GBK 解码，UTF-8 会乱码） */
import { build1688SearchUrl } from '../../url1688';
import {
  isOneboundConfigured,
  oneboundItemDetail,
  oneboundSearch,
  oneboundSearchByImage,
  type OneboundItemDetail,
} from './onebound';

export { build1688SearchUrl };

/** 数字解析：兼容 "12.5"、"¥12.5起"、"12.50-15.00"（取最低档） */
function parsePrice(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

function parseIntSafe(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === 'string') {
    const m = raw.replace(/,/g, '').match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** 字段归一化：容忍不同 1688 数据服务的字段命名差异 */
function normalizeOffer(raw: unknown): SourcingOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(pick(o, ['title', 'subject', 'offerTitle', 'name']) ?? '').trim();
  if (!title) return null;
  const url = String(pick(o, ['url', 'detailUrl', 'offerUrl', 'link']) ?? '');
  return {
    title: title.slice(0, 80),
    price: parsePrice(pick(o, ['price', 'priceRange', 'consignPrice', 'offerPrice'])),
    moq: parseIntSafe(pick(o, ['moq', 'minOrder', 'beginAmount', 'quantityBegin'])),
    supplier: String(pick(o, ['supplier', 'companyName', 'sellerName', 'shopName']) ?? ''),
    location: String(pick(o, ['location', 'sendGoodsAddress', 'area', 'province']) ?? ''),
    sales: String(pick(o, ['sales', 'saleQuantity', 'tradeCount', 'monthSold']) ?? ''),
    repurchaseRate: String(pick(o, ['repurchaseRate', 'repeatPurchaseRate', 'buyAgainRate']) ?? ''),
    url: url || build1688SearchUrl(title.slice(0, 20)),
  };
}

/** 基于环境变量配置的 1688 HTTP 数据源 */
class Http1688SourcingSource implements SourcingDataSource {
  name = '1688';

  available(): boolean {
    return Boolean(process.env.SOURCING_1688_API_URL && process.env.SOURCING_1688_API_KEY);
  }

  async search(keyword: string, limit = 5): Promise<SourcingOffer[]> {
    const base = process.env.SOURCING_1688_API_URL as string;
    const key = process.env.SOURCING_1688_API_KEY as string;
    const resp = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query: keyword, limit }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      throw new Error(`1688 接口返回 HTTP ${resp.status}`);
    }
    const json: unknown = await resp.json();
    const list = Array.isArray(json)
      ? json
      : ((json as Record<string, unknown>).offers ??
        (json as Record<string, unknown>).data ??
        (json as Record<string, unknown>).items ??
        []);
    if (!Array.isArray(list)) return [];
    return list
      .map(normalizeOffer)
      .filter((o): o is SourcingOffer => o !== null)
      .slice(0, limit);
  }
}

const source = new Http1688SourcingSource();

/** 数据源优先级：Onebound（真实接口）> 通用 HTTP 数据源 > 降级直达链接 */
export function isSourcingConfigured(): boolean {
  return isOneboundConfigured() || source.available();
}

/** 聚合入口：检索 1688 货源 */
export async function searchSourcing(keyword: string, limit = 5): Promise<SourcingResult> {
  const searchUrl = build1688SearchUrl(keyword);
  if (isOneboundConfigured()) {
    const r = await oneboundSearch(keyword, limit);
    return {
      keyword,
      searchUrl,
      offers: r.offers.map((o) => ({
        title: o.title,
        price: o.price,
        moq: 0,
        supplier: '',
        location: '',
        sales: o.sales > 0 ? `已售 ${o.sales}` : '',
        repurchaseRate: o.tagPercent,
        url: o.detailUrl,
        numIid: o.numIid,
        picUrl: o.picUrl,
      })),
      totalResults: r.totalResults,
      realtime: true,
    };
  }
  if (!source.available()) {
    return { keyword, searchUrl, offers: [], realtime: false };
  }
  const offers = await source.search(keyword, limit);
  return { keyword, searchUrl, offers, realtime: true };
}

/** 商品详情：阶梯价/起订量/产业带/供应商（仅 Onebound 配置时可用） */
export async function getSourcingDetail(numIid: string): Promise<OneboundItemDetail | null> {
  if (!isOneboundConfigured()) return null;
  return oneboundItemDetail(numIid);
}

/** 以图搜款：base64 图片 → 相似货源（img_upload 未开通时抛友好错误，调用方降级） */
export async function searchSourcingByImage(
  imageBase64: string,
  limit = 5,
): Promise<SourcingResult> {
  const r = await oneboundSearchByImage(imageBase64, limit);
  return {
    keyword: '(以图搜款)',
    searchUrl: '',
    offers: r.offers.map((o) => ({
      title: o.title,
      price: o.price,
      moq: 0,
      supplier: '',
      location: '',
      sales: o.sales > 0 ? `已售 ${o.sales}` : '',
      repurchaseRate: o.tagPercent,
      url: o.detailUrl,
      numIid: o.numIid,
      picUrl: o.picUrl,
    })),
    totalResults: r.totalResults,
    realtime: true,
  };
}
