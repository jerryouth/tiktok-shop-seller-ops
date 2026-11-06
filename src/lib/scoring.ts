// 智能选品评分引擎：多维度加权计算综合评分并生成推荐理由
import type { Product, ScoreDimensions, ScoreResult } from './types';

export const DIMENSION_META: {
  key: keyof ScoreDimensions;
  label: string;
  weight: number;
}[] = [
  { key: 'heat', label: '热度指数', weight: 0.25 },
  { key: 'profit', label: '利润空间', weight: 0.25 },
  { key: 'sales', label: '销量表现', weight: 0.2 },
  { key: 'competition', label: '竞争环境', weight: 0.15 },
  { key: 'growth', label: '增长势头', weight: 0.15 },
];

/** 潜力爆款分数线 */
export const HOT_THRESHOLD = 85;

const clamp = (v: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, Math.round(v)));

/** 近 7 天销量增幅（相对前一个 7 天周期） */
export function calcGrowthRate(dailySales: number[]): number {
  const last7 = dailySales.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = dailySales.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (prev7 <= 0) return last7 > 0 ? 1 : 0;
  return (last7 - prev7) / prev7;
}

/** 利润率（小数） */
export function calcProfitMargin(price: number, cost: number): number {
  if (price <= 0) return 0;
  return (price - cost) / price;
}

/**
 * 计算商品综合评分（0-100）
 * - 热度指数：直接使用平台热度
 * - 竞争环境：竞争度反向计分（竞争越低得分越高）
 * - 利润空间：利润率 65% 映射为满分
 * - 销量表现：对数刻度，累计 6 万单为满分
 * - 增长势头：近 7 天增幅，+42% 左右映射为满分
 */
export function computeScore(product: Product): ScoreResult {
  const profitMargin = calcProfitMargin(product.price, product.cost);
  const growthRate = calcGrowthRate(product.dailySales);

  const dimensions: ScoreDimensions = {
    heat: clamp(product.heat),
    competition: clamp(100 - product.competition),
    profit: clamp((profitMargin / 0.65) * 100),
    sales: clamp(
      (Math.log10(Math.max(1, product.sales) + 1) / Math.log10(60000)) * 100,
    ),
    growth: clamp(50 + growthRate * 120),
  };

  const total = clamp(
    DIMENSION_META.reduce(
      (sum, meta) => sum + dimensions[meta.key] * meta.weight,
      0,
    ),
  );

  return {
    total,
    dimensions,
    growthRate,
    profitMargin,
    isHot: total >= HOT_THRESHOLD,
    recommendation: buildRecommendation(product, dimensions, total, {
      profitMargin,
      growthRate,
    }),
  };
}

interface ExtraMetrics {
  profitMargin: number;
  growthRate: number;
}

/** 基于维度得分自动生成中文推荐理由 */
function buildRecommendation(
  product: Product,
  dims: ScoreDimensions,
  total: number,
  extra: ExtraMetrics,
): string {
  const parts: string[] = [];

  // 1) 综合评级开场
  if (total >= HOT_THRESHOLD) {
    parts.push(
      `综合评分 ${total} 分，各项表现突出，具备明显的爆款潜质，建议优先投入资源。`,
    );
  } else if (total >= 70) {
    parts.push(
      `综合评分 ${total} 分，整体表现良好，属于值得跟进的优质潜力款。`,
    );
  } else if (total >= 55) {
    parts.push(
      `综合评分 ${total} 分，表现中规中矩，建议小批量测试后再决定是否加大投入。`,
    );
  } else {
    parts.push(
      `综合评分 ${total} 分，当前风险偏高，建议谨慎入场或继续观察市场变化。`,
    );
  }

  // 2) 亮点维度
  const sorted = DIMENSION_META.map((m) => ({
    ...m,
    value: dims[m.key],
  })).sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const strengthText: Record<keyof ScoreDimensions, string> = {
    heat: `平台热度指数高达 ${dims.heat}，正处于流量红利期，内容曝光机会大`,
    profit: `利润率达 ${(extra.profitMargin * 100).toFixed(0)}%，盈利空间充足，可支撑达人佣金与投流成本`,
    sales: `累计销量 ${formatSales(product.sales)} 单，市场验证充分，用户接受度高`,
    competition: `当前竞争度较低（${product.competition}/100），同类卖家较少，切入窗口期良好`,
    growth: `近 7 天销量增幅 ${(extra.growthRate * 100).toFixed(0)}%，正处于快速上升通道`,
  };
  parts.push(`核心优势：${strengthText[best.key]}。`);

  // 3) 风险维度提示
  const riskText: Record<keyof ScoreDimensions, string> = {
    heat: '平台热度偏低，需要依靠优质短视频内容撬动自然流量',
    profit: '利润率偏薄，建议优化供应链成本或组合销售提升客单价',
    sales: '销量尚未起量，建议先以小额投放验证转化链路',
    competition: '类目竞争激烈，需通过差异化卖点或内容创意突围',
    growth: '近期增长放缓，注意判断是否为季节性回落或需求见顶',
  };
  if (worst.value < 60) {
    parts.push(`风险提示：${riskText[worst.key]}。`);
  }

  // 4) 行动建议
  if (total >= HOT_THRESHOLD) {
    parts.push('运营建议：立即铺货并绑定达人联盟，同步布局短视频矩阵抢占流量高峰。');
  } else if (total >= 70) {
    parts.push('运营建议：建议上架测试，搭配 3-5 条短视频素材验证点击率与转化率。');
  } else if (total >= 55) {
    parts.push('运营建议：可列入观察清单，关注竞品动向与热度变化后再做决策。');
  } else {
    parts.push('运营建议：暂不推荐入场，建议寻找同赛道更具竞争力的替代品。');
  }

  return parts.join('');
}

function formatSales(sales: number): string {
  if (sales >= 10000) return `${(sales / 10000).toFixed(1)} 万`;
  return String(sales);
}
