// 全局类型定义：商品、评分、查询、统计

export const CATEGORIES = [
  '美妆个护',
  '家居生活',
  '服饰鞋包',
  '数码电子',
  '母婴用品',
  '运动户外',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Product {
  id: string;
  name: string;
  category: Category;
  image: string;
  /** 售价（美元） */
  price: number;
  /** 成本（美元） */
  cost: number;
  /** 累计销量 */
  sales: number;
  /** 评分 0-5 */
  rating: number;
  /** 评论数 */
  reviews: number;
  /** 上架时间 ISO 日期 */
  listedAt: string;
  /** 近 14 天日销量（旧 -> 新） */
  dailySales: number[];
  /** 竞争度 0-100（越高竞争越激烈） */
  competition: number;
  /** 平台热度指数 0-100 */
  heat: number;
  /** 店铺名称 */
  seller: string;
}

/** 评分维度（各项 0-100） */
export interface ScoreDimensions {
  /** 热度指数 */
  heat: number;
  /** 竞争环境（竞争度越低得分越高） */
  competition: number;
  /** 利润空间 */
  profit: number;
  /** 销量表现 */
  sales: number;
  /** 增长势头（近 7 天增幅） */
  growth: number;
}

export interface ScoreResult {
  /** 综合评分 0-100 */
  total: number;
  dimensions: ScoreDimensions;
  /** 近 7 天销量增幅（小数，如 0.35 表示 +35%） */
  growthRate: number;
  /** 利润率（小数） */
  profitMargin: number;
  /** 是否潜力爆款 */
  isHot: boolean;
  /** 推荐理由文案 */
  recommendation: string;
}

export interface ProductWithScore extends Product {
  score: ScoreResult;
}

export type SortField =
  | 'price'
  | 'sales'
  | 'rating'
  | 'listedAt'
  | 'score'
  | 'growth';

export interface ListQuery {
  keyword?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minSales?: number;
  maxSales?: number;
  minRating?: number;
  minScore?: number;
  sortBy?: SortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  overview: {
    totalProducts: number;
    avgScore: number;
    avgMargin: number;
    hotCount: number;
    topSales: { id: string; name: string; sales: number; image: string };
  };
  categorySales: { category: string; sales: number; count: number }[];
  salesTrend: { date: string; sales: number }[];
  surging: {
    id: string;
    name: string;
    category: string;
    image: string;
    growthRate: number;
    recent7Sales: number;
  }[];
  scoreDistribution: { range: string; count: number }[];
}
