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

// ---------- 趋势 → 电商结论：商机评分与选品机会洞察 ----------

/** 商机分各维度拆解（0-100，便于解释结论来源） */
export interface TrendScoreBreakdown {
  /** 规模分：7 日播放量量级（log 刻度） */
  scale: number;
  /** 动能分：环比涨跌 + 趋势方向 */
  momentum: number;
  /** 互动深度分：播放/发帖比（高 = 内容供不应求） */
  engagement: number;
  /** 电商相关度分：行业标签是否落在可变现品类 */
  commerce: number;
  /** Google 印证加分：搜索需求同步上升（0-15） */
  googleBoost: number;
  /** 阶段系数（rising 1.15 / emerging 1.1 / peaking 1.0 / declining 0.45） */
  stageMultiplier: number;
}

/** 打完分的趋势话题 */
export interface ScoredTrend {
  hashtag: string;
  rank: number;
  views: number;
  posts: number;
  momentumPct: number;
  trendDirection: string;
  trendStage: string;
  industries: string[];
  /** 综合商机分 0-100 */
  score: number;
  breakdown: TrendScoreBreakdown;
  /** 分档：强商机 / 可关注 / 观察 / 回避 */
  verdict: 'strong' | 'follow' | 'watch' | 'avoid';
}

/** 单个可落地商品点子 */
export interface OpportunityProduct {
  name: string;
  sellingPoint: string;
  /** 1688 找货中文关键词 */
  keyword1688: string;
  /** 参考成本（人民币区间，如 "¥8-15"） */
  estCost: string;
}

/** LLM 推导的选品机会 */
export interface TrendOpportunity {
  /** 机会标题（场景化，如 "圣诞季小体积氛围礼品"） */
  title: string;
  /** 支撑该机会的趋势话题（来自真实榜单） */
  trendBasis: string[];
  /** 需求强度分 0-100 */
  demandScore: number;
  /** 时机窗口描述（上架/达峰节奏） */
  window: string;
  /** 关联营销节点名称（可为空） */
  eventName: string;
  daysUntil: number;
  /** 建议定价带（美元） */
  priceBand: string;
  /** 目标人群 */
  audience: string;
  products: OpportunityProduct[];
  risks: string[];
  /** 下一步动作建议 */
  action: string;
}

export interface TrendInsightsPayload {
  fetchedAt: string;
  /** 美区大盘风向总结（2-3 句） */
  marketSummary: string;
  opportunities: TrendOpportunity[];
  /** 规则层商机分榜单（解释结论的量化依据） */
  scoredTrends: ScoredTrend[];
  /** LLM 洞察是否生成成功（失败时仅返回 scoredTrends） */
  aiGenerated: boolean;
  errors: string[];
}
