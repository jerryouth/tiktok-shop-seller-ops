// 趋势数据源适配器层：Agent 不感知来源，后续可插拔 Kalodata / EchoTik 等付费数据源
// 当前默认实现：WebSearch（无需外部凭据，立即可用）
import { SearchClient, Config } from 'coze-coding-dev-sdk';

export interface TrendQuery {
  category?: string;
  region?: string;
  keyword?: string;
  headers?: Record<string, string>;
}

export interface TrendSignal {
  标题: string;
  摘要: string;
  来源: string;
  时间?: string;
}

export interface TrendResult {
  AI摘要: string;
  信号: TrendSignal[];
}

/** 统一趋势数据源接口：任何新数据源实现它即可接入 Agent */
export interface TrendDataSource {
  readonly name: string;
  available(): boolean;
  fetchTrends(query: TrendQuery): Promise<TrendResult>;
}

const CATEGORY_EN: Record<string, string> = {
  美妆个护: 'beauty personal care',
  家居生活: 'home living',
  服饰鞋包: 'fashion clothing',
  数码电子: 'electronics gadgets',
  母婴用品: 'baby products',
  运动户外: 'sports fitness',
};

const REGION_EN: Record<string, string> = {
  美区: 'US',
  美国: 'US',
  北美: 'US',
  东南亚: 'Southeast Asia',
  英国: 'UK',
  欧洲: 'Europe',
};

/** WebSearch 趋势数据源：检索近一个月 TikTok Shop 相关热销/趋势内容 */
export class WebSearchTrendSource implements TrendDataSource {
  readonly name = 'web-search';

  available(): boolean {
    return true;
  }

  async fetchTrends(query: TrendQuery): Promise<TrendResult> {
    const catEN = query.category
      ? (CATEGORY_EN[query.category] ?? query.category)
      : '';
    const regionEN = query.region
      ? (REGION_EN[query.region] ?? query.region)
      : '';
    const parts = [
      query.keyword ?? '',
      'TikTok Shop',
      catEN,
      'trending viral hot products',
      regionEN,
    ].filter(Boolean);

    const client = new SearchClient(new Config(), query.headers);
    const resp = await client.advancedSearch(parts.join(' '), {
      count: 8,
      timeRange: '1m',
      needSummary: true,
    });

    const items = resp.web_items ?? [];
    return {
      AI摘要: resp.summary ?? '',
      信号: items.slice(0, 8).map((it) => ({
        标题: it.title,
        摘要: (it.snippet ?? '').slice(0, 180),
        来源: it.site_name ?? '',
        时间: it.publish_time,
      })),
    };
  }
}

/** 已注册数据源（按优先级排列），未来在此追加 Kalodata / EchoTik 适配器 */
const sources: TrendDataSource[] = [new WebSearchTrendSource()];

/** 聚合入口：遍历可用数据源，首个成功即返回 */
export async function fetchTrendSignals(
  query: TrendQuery,
): Promise<TrendResult & { 数据源: string }> {
  let lastError: unknown = null;
  for (const source of sources) {
    if (!source.available()) continue;
    try {
      const result = await source.fetchTrends(query);
      return { ...result, 数据源: source.name };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('趋势数据源暂不可用');
}
