// 市场趋势看板共享类型（前后端通用）
// 数据来源：TikTok Creative Center 美区官方榜 + Google Trends（均经 Apify）

import type {
  GoogleTrendsResult,
  TikTokHashtagTrend,
} from '@/lib/agent/sources/apify';
import type { UpcomingEvent } from '@/lib/agent/sources/calendar';

export interface IndustryAgg {
  industry: string;
  views: number;
  count: number;
}

export interface TrendsDashboardPayload {
  /** 是否配置了 APIFY_TOKEN（未配置时 tiktok/google 为 null） */
  configured: boolean;
  /** 数据抓取时间（ISO） */
  fetchedAt: string;
  tiktok: {
    hashtags: TikTokHashtagTrend[];
    industryAgg: IndustryAgg[];
  } | null;
  google: GoogleTrendsResult | null;
  /** 本次 Google Trends 实际使用的查询词 */
  googleTerms: string[];
  calendar: UpcomingEvent[];
  /** 各数据源的错误信息（部分失败时仍返回可用数据） */
  errors: string[];
}
