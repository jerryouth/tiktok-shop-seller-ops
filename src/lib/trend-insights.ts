// 趋势 → 电商结论【LLM 层】：把量化后的趋势信号 + 营销日历推导成可落地的选品机会
// 规则层（trend-score.ts）负责打分排序，本层负责语义推导（话题→商品映射需要美国消费文化知识）

import { Config, LLMClient } from 'coze-coding-dev-sdk';
import type { GoogleTrendsResult } from '@/lib/agent/sources/apify';
import type { UpcomingEvent } from '@/lib/agent/sources/calendar';
import type {
  ScoredTrend,
  TrendInsightsPayload,
  TrendOpportunity,
  OpportunityProduct,
} from '@/lib/trend-types';

const MODEL = 'doubao-seed-2-0-pro-260215';

const INSIGHTS_PROMPT = `你是一位服务中国跨境卖家的美区选品数据分析师。给你一批已经量化打分的 TikTok 美区趋势话题、Google 搜索印证数据和美国营销日历，你的任务是把趋势信号推导成**可落地的选品机会**。

# 推导方法（严格遵守）
1. 只基于输入数据推导，禁止编造不存在的趋势信号；每个机会的 trendBasis 必须来自输入的话题名
2. 话题 → 商品的语义推导示例：
   - 礼物/节日场景话题（如 #stockingstuffers）→ $15 以内轻小礼品（新奇特小件、美妆小样、氛围小物）
   - 大家居话题（如 #diningchairs）→ 不做大件，降级为轻小周边（椅垫、椅套、桌面装饰）
   - 人群话题（如 #novemberbaby）→ 生日礼物、星座/月份定制周边
   - 宠物/母婴/美妆话题 → 对应类目的轻小快消品
3. 选品红线：轻小件（<2kg）、建议定价 $9.99-$29.99、按 1688 成本预估毛利 ≥55%；不满足的方向直接放弃
4. 时机：结合营销日历判断窗口——daysUntil 减去备货周期（空运 7-10 天）仍有余量才算"来得及"；错过节点的方向标注"顺延到下一节点"
5. Google 印证：优先选择 TikTok 与 Google 双升的方向；TikTok 独涨的标注"内容热点，窗口短"
6. 风险必须具体（同质化竞争/季节性回落/侵权元素/物流时效），禁止"市场竞争激烈"这类空话

# 输出格式（严格 JSON，不要输出任何其他内容）
{
  "marketSummary": "当前美区大盘风向总结，2-3 句，要点出最强的 1-2 条主线",
  "opportunities": [
    {
      "title": "机会标题（场景化，如：圣诞季小体积氛围礼品）",
      "trendBasis": ["#话题1", "#话题2"],
      "demandScore": 82,
      "window": "时机窗口一句话（上架节奏+达峰时间）",
      "eventName": "关联营销节点（无则空字符串）",
      "daysUntil": 51,
      "priceBand": "$9.99-16.99",
      "audience": "目标人群一句话",
      "products": [
        { "name": "具体商品名", "sellingPoint": "核心卖点一句话", "keyword1688": "中文找货词", "estCost": "¥8-15" }
      ],
      "risks": ["具体风险1"],
      "action": "本周该做的第一步动作"
    }
  ]
}
- opportunities 3-5 个，按 demandScore 降序；products 每个机会 2-4 个
- demandScore 参考输入的商机分，可结合语义理解上下微调 ±10`;

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM 未返回有效 JSON');
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

function sanitizeProduct(raw: unknown): OpportunityProduct | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  return {
    name: r.name.trim(),
    sellingPoint: typeof r.sellingPoint === 'string' ? r.sellingPoint : '',
    keyword1688: typeof r.keyword1688 === 'string' ? r.keyword1688 : '',
    estCost: typeof r.estCost === 'string' ? r.estCost : '',
  };
}

function sanitizeOpportunity(raw: unknown, validHashtags: Set<string>): TrendOpportunity | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || !r.title.trim()) return null;
  const products = (Array.isArray(r.products) ? r.products : [])
    .map(sanitizeProduct)
    .filter((p): p is OpportunityProduct => p !== null);
  if (products.length === 0) return null;
  return {
    title: r.title.trim(),
    // 只保留真实存在于榜单的话题引用，防止模型编造证据
    trendBasis: toStringArray(r.trendBasis).filter((t) => validHashtags.has(t)),
    demandScore:
      typeof r.demandScore === 'number' && Number.isFinite(r.demandScore)
        ? Math.min(100, Math.max(0, Math.round(r.demandScore)))
        : 50,
    window: typeof r.window === 'string' ? r.window : '',
    eventName: typeof r.eventName === 'string' ? r.eventName : '',
    daysUntil: typeof r.daysUntil === 'number' && Number.isFinite(r.daysUntil) ? Math.round(r.daysUntil) : 0,
    priceBand: typeof r.priceBand === 'string' ? r.priceBand : '',
    audience: typeof r.audience === 'string' ? r.audience : '',
    products,
    risks: toStringArray(r.risks),
    action: typeof r.action === 'string' ? r.action : '',
  };
}

/** 生成选品机会洞察；失败返回 null（调用方降级为仅展示规则层商机分） */
export async function generateTrendInsights(
  scoredTrends: ScoredTrend[],
  google: GoogleTrendsResult | null,
  calendar: UpcomingEvent[],
  headers?: Record<string, string>,
): Promise<{ marketSummary: string; opportunities: TrendOpportunity[] } | null> {
  const top = scoredTrends.slice(0, 12);
  if (top.length === 0) return null;

  const trendLines = top
    .map(
      (t) =>
        `${t.hashtag} | 商机分${t.score} | 7日播放${t.views} | 发帖${t.posts} | 动能${t.momentumPct >= 0 ? '+' : ''}${t.momentumPct}% | 阶段${t.trendStage || '未知'} | 行业${t.industries.join('/') || '未标注'} | 拆分(规模${t.breakdown.scale}/动能${t.breakdown.momentum}/互动${t.breakdown.engagement}/电商相关${t.breakdown.commerce}/Google+${t.breakdown.googleBoost})`,
    )
    .join('\n');

  const googleLines =
    google?.insights
      .map(
        (i) =>
          `${i.term}: ${i.hasData ? `指数${i.latest ?? '-'}，环比${(i.changePercent ?? 0) >= 0 ? '+' : ''}${i.changePercent ?? 0}%，方向${i.direction}${i.isNearPeak ? '，接近峰值' : ''}，飙升关联词[${i.topRisingQueries.slice(0, 3).join(', ')}]` : '无数据'}`,
      )
      .join('\n') ?? '（无 Google 数据）';

  const calendarLines =
    calendar
      .map((e) => `${e.name}（${e.dateLabel}，倒计时${e.daysUntil}天，建议提前${e.leadDays}天备货，热门品类：${e.categories.join('/')}）: ${e.culture}`)
      .join('\n') || '（近期无节点）';

  const userContent = `【TikTok 美区 7 日榜（已按商机分排序）】\n${trendLines}\n\n【Google Trends 搜索印证】\n${googleLines}\n\n【美国营销日历】\n${calendarLines}\n\n请按系统提示词的方法输出 JSON。`;

  try {
    const client = new LLMClient(new Config(), headers);
    const response = await client.invoke(
      [
        { role: 'system', content: INSIGHTS_PROMPT },
        { role: 'user', content: userContent },
      ],
      { model: MODEL, temperature: 0.4 },
    );
    const parsed = extractJson(response.content);
    const validHashtags = new Set(scoredTrends.map((t) => t.hashtag));
    const opportunities = (Array.isArray(parsed.opportunities) ? parsed.opportunities : [])
      .map((o) => sanitizeOpportunity(o, validHashtags))
      .filter((o): o is TrendOpportunity => o !== null)
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 5);
    if (opportunities.length === 0) return null;
    return {
      marketSummary: typeof parsed.marketSummary === 'string' ? parsed.marketSummary : '',
      opportunities,
    };
  } catch {
    return null;
  }
}
