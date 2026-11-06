// 单品经济模型（Unit Economics）：跨境 T+T 模式的毛利/净利/ROI 测算
// 费率为行业经验估算基准，调用方可按实际货代/类目费率传参覆盖

export interface UnitEconomicsInput {
  /** 售价（USD） */
  price: number;
  /** 采购成本（USD） */
  cost: number;
  /** 重量 kg，默认 0.3（轻小件） */
  weightKg?: number;
  /** 预期单均广告成本 CPA（USD），默认售价的 25% */
  adCpa?: number;
  /** 退货率（0-1），默认 0.08 */
  returnRate?: number;
}

export interface UnitEconomics {
  price: number;
  cost: number;
  /** 头程海运 + 尾程派送合计 */
  shippingFee: number;
  /** 平台佣金（8%） */
  platformFee: number;
  /** 支付手续费（2.9% + $0.30） */
  paymentFee: number;
  /** 单均广告成本 */
  adCost: number;
  /** 退货损失（退货率 × 售价 × 40% 不可回收比例） */
  returnLoss: number;
  /** 毛利润 = 售价 - 成本 - 物流 */
  grossProfit: number;
  /** 毛利率（0-1） */
  grossMargin: number;
  /** 净利润 = 毛利 - 佣金 - 支付 - 广告 - 退货损失 */
  netProfit: number;
  /** 净利率（0-1） */
  netMargin: number;
  /** 投入产出比 = 净利 /（成本 + 物流 + 广告）× 100% */
  roi: number;
  /** 盈亏平衡 CPA：广告最多能花多少钱不亏本；≤0 表示不打广告都亏 */
  breakEvenCpa: number;
  /** 中文评级结论 */
  verdict: string;
}

/** 费率基准常量（可随业务调整） */
export const FEE_BENCHMARKS = {
  头程海运每公斤: 2.2,
  尾程派送每单: 3.8,
  平台佣金率: 0.08,
  支付费率: 0.029,
  支付固定费: 0.3,
  默认退货率: 0.08,
  退货不可回收比例: 0.4,
  默认广告占比: 0.25,
} as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeUnitEconomics(input: UnitEconomicsInput): UnitEconomics {
  const { price, cost } = input;
  const weightKg = input.weightKg ?? 0.3;
  const returnRate = input.returnRate ?? FEE_BENCHMARKS.默认退货率;
  const adCost = input.adCpa ?? price * FEE_BENCHMARKS.默认广告占比;

  const shippingFee =
    weightKg * FEE_BENCHMARKS.头程海运每公斤 + FEE_BENCHMARKS.尾程派送每单;
  const platformFee = price * FEE_BENCHMARKS.平台佣金率;
  const paymentFee =
    price * FEE_BENCHMARKS.支付费率 + FEE_BENCHMARKS.支付固定费;
  const returnLoss = price * returnRate * FEE_BENCHMARKS.退货不可回收比例;

  const grossProfit = price - cost - shippingFee;
  const grossMargin = grossProfit / price;
  const netProfit = grossProfit - platformFee - paymentFee - adCost - returnLoss;
  const netMargin = netProfit / price;
  const roi = (netProfit / (cost + shippingFee + adCost)) * 100;
  const breakEvenCpa = grossProfit - platformFee - paymentFee - returnLoss;

  let verdict: string;
  if (grossMargin >= 0.55 && netProfit > 0) {
    verdict = '健康：毛利充足，有广告投放空间，可以打';
  } else if (grossMargin >= 0.45 && netProfit > 0) {
    verdict = '及格：能做，但广告预算必须克制，优先自然流';
  } else if (grossMargin >= 0.45) {
    verdict = '偏紧：不打广告有毛利，一投广告就亏，只适合自然流测品';
  } else {
    verdict = '危险：定价毛利不足 45%，广告和退货没有腾挪空间，不建议入场';
  }

  return {
    price: round2(price),
    cost: round2(cost),
    shippingFee: round2(shippingFee),
    platformFee: round2(platformFee),
    paymentFee: round2(paymentFee),
    adCost: round2(adCost),
    returnLoss: round2(returnLoss),
    grossProfit: round2(grossProfit),
    grossMargin: round2(grossMargin * 1000) / 1000,
    netProfit: round2(netProfit),
    netMargin: round2(netMargin * 1000) / 1000,
    roi: round2(roi),
    breakEvenCpa: round2(breakEvenCpa),
    verdict,
  };
}
