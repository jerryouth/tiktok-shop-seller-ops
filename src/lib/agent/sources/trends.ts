// 趋势数据源适配器层：Agent 不感知来源，后续可插拔 Kalodata / EchoTik 等付费数据源
// 优先级：Apify（TikTok Creative Center 官方榜，需 APIFY_TOKEN）> WebSearch（无需凭据兜底）
import { SearchClient, Config } from 'coze-coding-dev-sdk';
import { fetchTikTokHashtagTrends, isApifyConfigured } from './apify';

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

/** Apify 趋势数据源：TikTok Creative Center 美区官方 7 日话题榜（真实榜单数据） */
export class ApifyTrendSource implements TrendDataSource {
  readonly name = 'tiktok-creative-center(apify)';

  available(): boolean {
    return isApifyConfigured();
  }

  async fetchTrends(query: TrendQuery): Promise<TrendResult> {
    const trends = await fetchTikTokHashtagTrends(20);
    if (trends.length === 0) throw new Error('TikTok Creative Center 榜单为空');

    // 按关键词/类目相关性加权排序，取前 12 条
    const kw = `${query.keyword ?? ''} ${query.category ?? ''}`.toLowerCase();
    const scored = trends
      .map((t) => {
        const haystack = `${t.hashtag} ${t.industries.join(' ')}`.toLowerCase();
        const relevance = kw
          ? kw.split(/\s+/).reduce((acc, w) => acc + (w && haystack.includes(w) ? 2 : 0), 0)
          : 0;
        return { t, weight: relevance * 100 + t.momentumPct };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12)
      .map((x) => x.t)
      .sort((a, b) => a.rank - b.rank);

    const viewsYi = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}亿` : v >= 1e4 ? `${(v / 1e4).toFixed(0)}万` : String(v));

    return {
      AI摘要: `TikTok Creative Center 美区近7日话题榜 TOP${scored.length}（官方数据）`,
      信号: scored.map((t) => ({
        标题: `#${t.hashtag}（榜单第${t.rank}位）`,
        摘要: `7日播放 ${viewsYi(t.views)}，发帖 ${viewsYi(t.posts)}；阶段：${t.trendStage || '未知'}，方向：${t.trendDirection || '未知'}，动能 ${t.momentumPct >= 0 ? '+' : ''}${t.momentumPct.toFixed(1)}%${t.industries.length ? `；行业：${t.industries.slice(0, 3).join('/')}` : ''}`,
        来源: 'TikTok Creative Center',
        时间: new Date().toISOString().slice(0, 10),
      })),
    };
  }
}

/** 已注册数据源（按优先级排列），未来在此追加 Kalodata / EchoTik 适配器 */
const sources: TrendDataSource[] = [new ApifyTrendSource(), new WebSearchTrendSource()];

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
