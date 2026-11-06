// 通用格式化工具（纯函数，客户端/服务端均可用）

/** 销量格式化：12345 -> 1.2万 */
export function formatSales(value: number): string {
  if (value >= 10000) {
    const v = value / 10000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}万`;
  }
  return value.toLocaleString('zh-CN');
}

/** 美元金额格式化：12.99 -> $12.99 */
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** 百分比格式化：0.356 -> +35.6% */
export function formatPercent(value: number, withSign = true): string {
  const pct = value * 100;
  const sign = withSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** 评分颜色档位 */
export function scoreBand(score: number): {
  text: string;
  badgeClass: string;
  hex: string;
} {
  if (score >= 85) {
    return { text: '潜力爆款', badgeClass: 'bg-[#ffe8ed] text-[#fe2c55]', hex: '#fe2c55' };
  }
  if (score >= 70) {
    return { text: '优质', badgeClass: 'bg-[#e0f7f6] text-[#089b94]', hex: '#00b8b0' };
  }
  if (score >= 55) {
    return { text: '一般', badgeClass: 'bg-amber-50 text-amber-600', hex: '#d97706' };
  }
  return { text: '待观察', badgeClass: 'bg-zinc-100 text-zinc-500', hex: '#6b7280' };
}
