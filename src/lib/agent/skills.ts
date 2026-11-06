// 选品 Agent 的 Skill 集：薄封装 store / 趋势数据源
// 设计原则：输出紧凑（控制 token 消耗）、summary 用于前端步骤展示
import {
  getDashboardStats,
  getProductById,
  queryProducts,
} from '@/lib/store';
import {
  CATEGORIES,
  type Category,
  type ListQuery,
  type ProductWithScore,
} from '@/lib/types';
import { computeUnitEconomics } from '@/lib/unit-economics';
import { getUpcomingEvents } from './sources/calendar';
import { fetchTrendSignals } from './sources/trends';
import type { Skill, SkillContext } from './types';

const MAX_LIST = 8;

/** 列表场景的商品紧凑表示 */
function compact(p: ProductWithScore) {
  return {
    id: p.id,
    名称: p.name,
    类目: p.category,
    售价: p.price,
    利润率: `${Math.round(p.score.profitMargin * 100)}%`,
    销量: p.sales,
    评分: p.rating,
    综合评分: p.score.total,
    爆款: p.score.isHot,
    近7天增幅: `${Math.round(p.score.growthRate * 100)}%`,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}

const queryProductsSkill: Skill = {
  name: 'queryProducts',
  description: '从商品库按条件检索商品（类目/关键词/评分/价格/销量/排序），返回最多8条精简结果',
  argsDoc:
    '{ category?: 类目名, keyword?: 关键词, minScore?: 最低综合评分, minPrice?: number, maxPrice?: number, minSales?: number, sortBy?: score|sales|growth|price|rating, sortOrder?: asc|desc, limit?: number }（全部可选）',
  async run(args) {
    const query: ListQuery = {
      category: asString(args.category),
      keyword: asString(args.keyword),
      minScore: asNumber(args.minScore),
      minPrice: asNumber(args.minPrice),
      maxPrice: asNumber(args.maxPrice),
      minSales: asNumber(args.minSales),
      sortBy: (asString(args.sortBy) ?? 'score') as ListQuery['sortBy'],
      sortOrder: asString(args.sortOrder) === 'asc' ? 'asc' : 'desc',
      pageSize: 50,
    };
    const { items, total } = queryProducts(query);
    const limit = Math.min(
      MAX_LIST,
      Math.max(1, asNumber(args.limit) ?? MAX_LIST),
    );
    return {
      data: { 命中总数: total, 商品: items.slice(0, limit).map(compact) },
      summary: `命中 ${total} 款商品`,
    };
  },
};

const getProductDetailSkill: Skill = {
  name: 'getProductDetail',
  description: '获取单个商品完整详情：五维度得分、推荐理由、近14天日销、热度/竞争度等',
  argsDoc: '{ id: 商品ID（如 P0001，从 queryProducts 结果中获取） }',
  async run(args) {
    const id = asString(args.id);
    if (!id) throw new Error('缺少商品 id');
    const p = getProductById(id);
    if (!p) throw new Error(`商品 ${id} 不存在`);
    return {
      data: {
        id: p.id,
        名称: p.name,
        类目: p.category,
        店铺: p.seller,
        售价: p.price,
        成本: p.cost,
        利润率: `${Math.round(p.score.profitMargin * 100)}%`,
        累计销量: p.sales,
        评分: p.rating,
        评论数: p.reviews,
        上架时间: p.listedAt,
        平台热度: p.heat,
        竞争度: p.competition,
        综合评分: p.score.total,
        爆款: p.score.isHot,
        近7天增幅: `${Math.round(p.score.growthRate * 100)}%`,
        维度得分: {
          热度: p.score.dimensions.heat,
          竞争环境: p.score.dimensions.competition,
          利润: p.score.dimensions.profit,
          销量: p.score.dimensions.sales,
          增长: p.score.dimensions.growth,
        },
        近14天日销: p.dailySales,
        推荐理由: p.score.recommendation,
      },
      summary: p.name,
    };
  },
};

const getCategoryInsightsSkill: Skill = {
  name: 'getCategoryInsights',
  description: '分析某个类目整体情况：规模、总销量、平均评分/利润率/竞争度、头部商品、增长黑马',
  argsDoc: `{ category: 类目名，可选值：${CATEGORIES.join(' / ')} }`,
  async run(args) {
    const category = asString(args.category);
    if (!category || !CATEGORIES.includes(category as Category)) {
      throw new Error(`类目无效，可选：${CATEGORIES.join('、')}`);
    }
    const { items } = queryProducts({
      category,
      pageSize: 50,
      sortBy: 'score',
      sortOrder: 'desc',
    });
    if (items.length === 0) throw new Error(`类目「${category}」暂无商品`);

    const avg = (f: (p: ProductWithScore) => number): number =>
      items.reduce((s, p) => s + f(p), 0) / items.length;
    const growthLeader = [...items].sort(
      (a, b) => b.score.growthRate - a.score.growthRate,
    )[0];

    return {
      data: {
        类目: category,
        商品数: items.length,
        类目总销量: items.reduce((s, p) => s + p.sales, 0),
        平均综合评分: Math.round(avg((p) => p.score.total)),
        平均利润率: `${Math.round(avg((p) => p.score.profitMargin) * 100)}%`,
        平均竞争度: Math.round(avg((p) => p.competition)),
        平均热度: Math.round(avg((p) => p.heat)),
        头部商品: items.slice(0, 3).map(compact),
        增长最快: {
          id: growthLeader.id,
          名称: growthLeader.name,
          近7天增幅: `${Math.round(growthLeader.score.growthRate * 100)}%`,
        },
      },
      summary: `${category} · ${items.length} 款商品`,
    };
  },
};

const getMarketOverviewSkill: Skill = {
  name: 'getMarketOverview',
  description: '获取商品库大盘：总量、平均评分、爆款数、类目销量排行、飙升榜、评分分布',
  argsDoc: '{}（无参数）',
  async run() {
    const s = getDashboardStats();
    return {
      data: {
        总商品数: s.overview.totalProducts,
        平均综合评分: s.overview.avgScore,
        平均利润率: `${Math.round(s.overview.avgMargin * 100)}%`,
        潜力爆款数: s.overview.hotCount,
        销量冠军: s.overview.topSales
          ? {
              id: s.overview.topSales.id,
              名称: s.overview.topSales.name,
              销量: s.overview.topSales.sales,
            }
          : null,
        类目销量排行: s.categorySales.map((c) => ({
          类目: c.category,
          销量: c.sales,
          商品数: c.count,
        })),
        飙升榜TOP3: s.surging.slice(0, 3).map((p) => ({
          id: p.id,
          名称: p.name,
          近7天增幅: `${Math.round(p.growthRate * 100)}%`,
        })),
        评分分布: s.scoreDistribution.map((d) => `${d.range}:${d.count}`),
      },
      summary: `${s.overview.totalProducts} 款在售`,
    };
  },
};

const compareProductsSkill: Skill = {
  name: 'compareProducts',
  description: '横向对比多个商品的核心指标与五维度得分（2-4个）',
  argsDoc: '{ ids: 商品ID数组，如 ["P0001","P0006"] }',
  async run(args) {
    const ids = asStringArray(args.ids).slice(0, 4);
    if (ids.length < 2) throw new Error('至少需要 2 个商品ID');
    const found = ids
      .map((id) => getProductById(id))
      .filter((p): p is ProductWithScore => Boolean(p));
    if (found.length < 2) throw new Error('有效商品不足 2 个，请检查 ID');
    return {
      data: found.map((p) => ({
        id: p.id,
        名称: p.name,
        类目: p.category,
        售价: p.price,
        利润率: `${Math.round(p.score.profitMargin * 100)}%`,
        销量: p.sales,
        综合评分: p.score.total,
        爆款: p.score.isHot,
        近7天增幅: `${Math.round(p.score.growthRate * 100)}%`,
        维度: {
          热度: p.score.dimensions.heat,
          竞争: p.score.dimensions.competition,
          利润: p.score.dimensions.profit,
          销量: p.score.dimensions.sales,
          增长: p.score.dimensions.growth,
        },
      })),
      summary: `对比 ${found.length} 款商品`,
    };
  },
};

const getHotTrendsSkill: Skill = {
  name: 'getHotTrends',
  description:
    '联网检索 TikTok / TikTok Shop 全网实时趋势与热销信号（真实外部数据，含AI摘要）',
  argsDoc:
    '{ category?: 类目名, region?: 市场（如 美区/东南亚/英国）, keyword?: 自定义英文关键词 }（全部可选）',
  async run(args, ctx: SkillContext) {
    const result = await fetchTrendSignals({
      category: asString(args.category),
      region: asString(args.region),
      keyword: asString(args.keyword),
      headers: ctx.headers,
    });
    return {
      data: result,
      summary: `获取 ${result.信号.length} 条趋势信号`,
    };
  },
};

const calcUnitEconomicsSkill: Skill = {
  name: 'calcUnitEconomics',
  description: '测算单品利润模型（毛利/净利/ROI/盈亏平衡CPA）',
  argsDoc:
    '{ productId?: 商品ID（提供则自动取售价成本）, price?: 售价$, cost?: 采购成本$, weightKg?: 重量kg(默认0.3), adCpa?: 单均广告成本$(默认售价25%), returnRate?: 退货率0-1(默认0.08) }（productId 或 price+cost 至少给一组）',
  async run(args) {
    const pid = asString(args.productId);
    let price = asNumber(args.price);
    let cost = asNumber(args.cost);
    if (pid) {
      const p = getProductById(pid);
      if (!p) throw new Error(`商品 ${pid} 不存在`);
      price = price ?? p.price;
      cost = cost ?? p.cost;
    }
    if (price === undefined || cost === undefined) {
      throw new Error('需要提供 productId，或同时提供 price 与 cost');
    }
    const ue = computeUnitEconomics({
      price,
      cost,
      weightKg: asNumber(args.weightKg),
      adCpa: asNumber(args.adCpa),
      returnRate: asNumber(args.returnRate),
    });
    return {
      data: {
        商品: pid ?? '自定义测算',
        售价: `$${ue.price}`,
        采购成本: `$${ue.cost}`,
        物流费: `$${ue.shippingFee}`,
        平台佣金: `$${ue.platformFee}`,
        支付手续费: `$${ue.paymentFee}`,
        单均广告成本: `$${ue.adCost}`,
        退货损失: `$${ue.returnLoss}`,
        毛利润: `$${ue.grossProfit}`,
        毛利率: `${Math.round(ue.grossMargin * 100)}%`,
        净利润: `$${ue.netProfit}`,
        净利率: `${Math.round(ue.netMargin * 100)}%`,
        ROI: `${ue.roi}%`,
        盈亏平衡CPA: `$${ue.breakEvenCpa}`,
        评级: ue.verdict,
      },
      summary: `毛利${Math.round(ue.grossMargin * 100)}% · ROI ${ue.roi}%`,
    };
  },
};

const getSeasonalCalendarSkill: Skill = {
  name: 'getSeasonalCalendar',
  description: '查询美国营销日历（节日节点/备货周期/文化洞察）',
  argsDoc: '{ withinDays?: 天数范围(默认90，最大180) }（可选）',
  async run(args) {
    const days = Math.min(180, Math.max(7, asNumber(args.withinDays) ?? 90));
    const events = getUpcomingEvents(new Date(), days);
    return {
      data: {
        节点数: events.length,
        节点: events.map((e) => ({
          名称: e.name,
          日期: e.dateLabel,
          倒计时: e.daysUntil < 0 ? '进行中' : `${e.daysUntil}天后`,
          建议提前备货: `${e.leadDays}天`,
          备货紧迫: e.urgent,
          热门品类: e.categories,
          文化洞察: e.culture,
          选品方向: e.productIdeas,
        })),
      },
      summary: `未来${days}天 ${events.length} 个营销节点`,
    };
  },
};

/** Skill 注册表：新增工具只需在此登记，提示词文档自动同步 */
const registry = new Map<string, Skill>(
  [
    queryProductsSkill,
    getProductDetailSkill,
    getCategoryInsightsSkill,
    getMarketOverviewSkill,
    compareProductsSkill,
    getHotTrendsSkill,
    calcUnitEconomicsSkill,
    getSeasonalCalendarSkill,
  ].map((s) => [s.name, s]),
);

export function getSkill(name: string): Skill | undefined {
  return registry.get(name);
}

export function listSkills(): Skill[] {
  return [...registry.values()];
}
