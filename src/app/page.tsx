'use client';

// 市场趋势看板（真实数据）：TikTok Creative Center 美区官方榜 + Google Trends + 美国营销日历
// 数据经 /api/trends 聚合（Apify 抓取，服务端 30 分钟缓存）

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  Hash,
  Lightbulb,
  Minus,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EChart } from '@/components/echart';
import { cn } from '@/lib/utils';
import { build1688SearchUrl } from '@/lib/url1688';
import type { TrendsDashboardPayload, TrendInsightsPayload, TrendOpportunity } from '@/lib/trend-types';
import type { GoogleTrendInsight, TikTokHashtagTrend } from '@/lib/agent/sources/apify';
import type { UpcomingEvent } from '@/lib/agent/sources/calendar';

const PALETTE = ['#00b8b0', '#fe2c55', '#6366f1', '#f59e0b', '#8b5cf6', '#94a3b8'];

/** 播放量格式化：1.2M / 345K（美区数据用国际单位） */
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/** 趋势阶段徽章配色（数据源为中英文混合：rising/peaking/declining/emerging） */
function stageClass(stage: string): string {
  if (/爆发|爆|peak/i.test(stage)) return 'bg-[#fe2c55]/10 text-[#fe2c55]';
  if (/上升|增长|ris/i.test(stage)) return 'bg-[#00b8b0]/10 text-[#00b8b0]';
  if (/新兴|萌芽|新|emerg/i.test(stage)) return 'bg-amber-500/10 text-amber-600';
  if (/衰退|下降|冷|declin/i.test(stage)) return 'bg-zinc-500/10 text-zinc-500';
  return 'bg-zinc-100 text-zinc-500';
}

function DirectionIcon({ direction, className }: { direction: string; className?: string }) {
  if (/上升|up|rising/i.test(direction)) return <TrendingUp className={className} />;
  if (/下降|down|falling/i.test(direction)) return <TrendingDown className={className} />;
  return <Minus className={className} />;
}

/** 商机分配色：≥70 洋红「强商机」/ ≥55 青「可关注」/ ≥40 琥珀「观察」/ 其余灰 */
function scoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-[#fe2c55]/10 text-[#fe2c55]';
  if (score >= 55) return 'bg-[#00b8b0]/10 text-[#00b8b0]';
  if (score >= 40) return 'bg-amber-500/10 text-amber-600';
  return 'bg-zinc-100 text-zinc-400';
}

const VERDICT_LABEL: Record<string, string> = {
  strong: '强商机',
  follow: '可关注',
  watch: '观察',
  avoid: '回避',
};

/** 选品机会卡片 */
function OpportunityCard({ opp, rank }: { opp: TrendOpportunity; rank: number }) {
  return (
    <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-semibold text-white">
            {rank}
          </span>
          <h3 className="text-sm font-semibold text-zinc-900">{opp.title}</h3>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', scoreBadgeClass(opp.demandScore))}>
          需求 {opp.demandScore}
        </span>
      </div>
      {/* 证据链：该机会挂在哪些真实趋势上 */}
      <div className="mt-2 flex flex-wrap gap-1">
        {opp.trendBasis.map((t) => (
          <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            #{t.replace(/^#/, '')}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-y border-zinc-100 py-2 text-[11px]">
        <div>
          <p className="text-zinc-400">建议定价</p>
          <p className="mt-0.5 font-medium tabular-nums text-zinc-800">{opp.priceBand || '—'}</p>
        </div>
        <div>
          <p className="text-zinc-400">关联节点</p>
          <p className="mt-0.5 font-medium text-zinc-800">
            {opp.eventName ? `${opp.eventName}${opp.daysUntil > 0 ? ` · ${opp.daysUntil}天` : ''}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-zinc-400">目标人群</p>
          <p className="mt-0.5 truncate font-medium text-zinc-800" title={opp.audience}>
            {opp.audience || '—'}
          </p>
        </div>
      </div>
      {/* 可落地商品点子 */}
      <ul className="mt-3 space-y-2">
        {opp.products.map((p) => (
          <li key={p.name} className="rounded-lg bg-zinc-50 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-800">{p.name}</p>
              <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">成本 {p.estCost}</span>
            </div>
            {p.sellingPoint && <p className="mt-0.5 text-[11px] text-zinc-500">{p.sellingPoint}</p>}
            {p.keyword1688 && (
              <a
                href={build1688SearchUrl(p.keyword1688)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 rounded bg-[#00b8b0]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#00b8b0] hover:bg-[#00b8b0]/20"
              >
                1688 找货：{p.keyword1688}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </li>
        ))}
      </ul>
      {opp.window && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-zinc-500">
          <Clock className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
          {opp.window}
        </p>
      )}
      {opp.risks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {opp.risks.map((r) => (
            <span key={r} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
              {r}
            </span>
          ))}
        </div>
      )}
      {opp.action && (
        <p className="mt-auto flex items-start gap-1.5 border-t border-zinc-100 pt-2.5 text-[11px] font-medium text-[#00b8b0]">
          <Rocket className="mt-0.5 h-3 w-3 shrink-0" />
          {opp.action}
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  iconClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  iconClass?: string;
}) {
  return (
    <Card className="rounded-xl border-zinc-200 shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconClass ?? 'bg-[#00b8b0]/10 text-[#00b8b0]')}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums text-zinc-900">{value}</p>
          {sub && <p className="truncate text-[11px] text-zinc-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrendsDashboardPage() {
  const [data, setData] = useState<TrendsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termsInput, setTermsInput] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [insights, setInsights] = useState<TrendInsightsPayload | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const fetchTrends = useCallback(
    async (opts?: { refresh?: boolean; terms?: string[] }): Promise<TrendsDashboardPayload> => {
      const params = new URLSearchParams();
      if (opts?.refresh) params.set('refresh', '1');
      if (opts?.terms?.length) params.set('terms', opts.terms.join(','));
      const res = await fetch(`/api/trends?${params.toString()}`);
      if (!res.ok) throw new Error(`趋势数据加载失败（HTTP ${res.status}）`);
      return (await res.json()) as TrendsDashboardPayload;
    },
    [],
  );

  /** 拉取选品机会洞察（LLM 分析，不阻塞主看板渲染） */
  const fetchInsights = useCallback(async (refresh = false) => {
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/trends/insights${refresh ? '?refresh=1' : ''}`);
      if (res.ok) setInsights((await res.json()) as TrendInsightsPayload);
    } catch {
      // 洞察失败不影响看板基础数据
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTrends()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setTermsInput(d.googleTerms.join(', '));
        if (d.configured && d.tiktok) void fetchInsights();
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '趋势数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchTrends, fetchInsights]);

  const refreshAll = async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchTrends({ refresh: true });
      setData(d);
      setTermsInput(d.googleTerms.join(', '));
      if (d.configured && d.tiktok) void fetchInsights(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshGoogle = async () => {
    const terms = termsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (terms.length === 0) return;
    setGoogleLoading(true);
    try {
      const d = await fetchTrends({ refresh: true, terms });
      setData(d);
    } catch {
      // 保留旧数据
    } finally {
      setGoogleLoading(false);
    }
  };

  const tiktok = data?.tiktok ?? null;
  const google = data?.google ?? null;

  const risingCount = useMemo(
    () => tiktok?.hashtags.filter((h) => h.momentumPct > 0).length ?? 0,
    [tiktok],
  );
  const totalViews = useMemo(
    () => tiktok?.hashtags.reduce((s, h) => s + h.views, 0) ?? 0,
    [tiktok],
  );
  const surging = useMemo(
    () => [...(tiktok?.hashtags ?? [])].sort((a, b) => b.momentumPct - a.momentumPct).slice(0, 5),
    [tiktok],
  );
  const nextEvent: UpcomingEvent | undefined = data?.calendar[0];

  /** 商机分查找表（话题 → 分数/档位），洞察加载后回填热榜表格 */
  const scoreMap = useMemo(() => {
    const m = new Map<string, { score: number; verdict: string }>();
    insights?.scoredTrends.forEach((t) => m.set(t.hashtag, { score: t.score, verdict: t.verdict }));
    return m;
  }, [insights]);

  const industryBarOption = useMemo(() => {
    if (!tiktok || tiktok.industryAgg.length === 0) return null;
    const top = tiktok.industryAgg.slice(0, 8);
    return {
      grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: '#a1a1aa', fontSize: 10, formatter: (v: number) => formatViews(v) },
        splitLine: { lineStyle: { color: '#f4f4f5' } },
      },
      yAxis: {
        type: 'category' as const,
        data: top.map((i) => i.industry).reverse(),
        axisLabel: { color: '#3f3f46', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[];
          const item = [...top].reverse()[list[0].dataIndex];
          return `${item.industry}<br/>关联话题播放量：${formatViews(item.views)}<br/>上榜话题：${item.count} 个`;
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: top.map((i) => i.views).reverse(),
          barWidth: 12,
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: '#00b8b0' },
                { offset: 1, color: '#25d9d2' },
              ],
            },
          },
          label: {
            show: true,
            position: 'right' as const,
            color: '#71717a',
            fontSize: 10,
            formatter: (p: unknown) => formatViews((p as { value: number }).value),
          },
        },
      ],
    };
  }, [tiktok]);

  const googleLineOption = useMemo(() => {
    if (!google || google.interestOverTime.length === 0) return null;
    const terms = google.insights.filter((i) => i.hasData).map((i) => i.term);
    if (terms.length === 0) return null;
    const dates = google.interestOverTime.map((p) => p.date.slice(5));
    return {
      color: PALETTE,
      tooltip: { trigger: 'axis' as const },
      legend: terms.length > 1 ? { top: 0, textStyle: { fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 3 } : undefined,
      grid: { left: 8, right: 12, top: terms.length > 1 ? 30 : 16, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: { fontSize: 10, color: '#a1a1aa' },
        axisLine: { lineStyle: { color: '#e4e4e7' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        max: 100,
        axisLabel: { fontSize: 10, color: '#a1a1aa' },
        splitLine: { lineStyle: { color: '#f4f4f5' } },
      },
      series: terms.map((term) => ({
        name: term,
        type: 'line' as const,
        smooth: true,
        symbolSize: 4,
        lineStyle: { width: 2 },
        data: google.interestOverTime.map((p) => p.values[term] ?? 0),
      })),
    };
  }, [google]);

  const fetchedAtLabel = data
    ? new Date(data.fetchedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">市场趋势看板</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            TikTok Creative Center 美区官方榜 · Google Trends 搜索兴趣 · 美国营销日历
            {fetchedAtLabel && <span className="ml-2">抓取于 {fetchedAtLabel}</span>}
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          重新抓取
        </button>
      </div>

      {/* 加载态 */}
      {loading && (
        <Card className="rounded-xl border-zinc-200 shadow-none">
          <CardContent className="space-y-3 p-6">
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <RefreshCw className="h-4 w-4 animate-spin text-[#00b8b0]" />
              正在抓取 TikTok 官方榜单与 Google 趋势，首次约需 1-2 分钟…
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </CardContent>
        </Card>
      )}

      {/* 错误态 */}
      {!loading && error && (
        <Card className="rounded-xl border-red-200 bg-red-50 shadow-none">
          <CardContent className="flex items-center justify-between p-4">
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
            <button onClick={refreshAll} className="rounded-lg bg-white px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-100">
              重试
            </button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {/* 未配置提示 */}
          {!data.configured && (
            <Card className="rounded-xl border-amber-200 bg-amber-50 shadow-none">
              <CardContent className="flex items-center gap-2 p-4 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                未配置 APIFY_TOKEN，趋势数据不可用。请在 .env.local 中配置后重启服务。
              </CardContent>
            </Card>
          )}

          {/* 部分数据源失败提示 */}
          {data.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {data.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<Hash className="h-5 w-5" />}
              label="美区在榜话题（7日）"
              value={tiktok ? String(tiktok.hashtags.length) : '—'}
              sub="TikTok Creative Center"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="上升期话题"
              value={tiktok ? String(risingCount) : '—'}
              sub={tiktok ? `占比 ${Math.round((risingCount / Math.max(tiktok.hashtags.length, 1)) * 100)}%` : undefined}
              iconClass="bg-[#fe2c55]/10 text-[#fe2c55]"
            />
            <StatCard
              icon={<Flame className="h-5 w-5" />}
              label="上榜话题总播放"
              value={tiktok ? formatViews(totalViews) : '—'}
              sub="近 7 天累计"
              iconClass="bg-[#6366f1]/10 text-[#6366f1]"
            />
            <StatCard
              icon={<Calendar className="h-5 w-5" />}
              label="下一营销节点"
              value={nextEvent ? `${nextEvent.daysUntil} 天` : '—'}
              sub={nextEvent ? `${nextEvent.name} · ${nextEvent.dateLabel}` : undefined}
              iconClass={nextEvent?.urgent ? 'bg-[#fe2c55]/10 text-[#fe2c55]' : 'bg-amber-500/10 text-amber-600'}
            />
          </div>

          {/* 选品机会洞察（趋势 → 电商结论） */}
          {data.configured && (
            <Card className="rounded-xl border-zinc-200 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                    <Sparkles className="h-4 w-4 text-[#fe2c55]" />
                    选品机会洞察
                    <span className="text-[11px] font-normal text-zinc-400">商机分量化 × AI 趋势推导</span>
                  </CardTitle>
                  {insights && (
                    <button
                      onClick={() => void fetchInsights(true)}
                      disabled={insightsLoading}
                      className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-[#00b8b0] disabled:opacity-50"
                    >
                      <RefreshCw className={cn('h-3 w-3', insightsLoading && 'animate-spin')} />
                      重新分析
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {insightsLoading && !insights ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-xs text-zinc-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#fe2c55]" />
                      AI 正在把趋势信号推导成选品机会，约需 15-40 秒…
                    </p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-56 rounded-xl" />
                      ))}
                    </div>
                  </div>
                ) : insights && insights.opportunities.length > 0 ? (
                  <div className={cn(insightsLoading && 'opacity-60 transition-opacity')}>
                    {insights.marketSummary && (
                      <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        {insights.marketSummary}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                      {insights.opportunities.map((opp, i) => (
                        <OpportunityCard key={opp.title} opp={opp} rank={i + 1} />
                      ))}
                    </div>
                  </div>
                ) : insights && !insights.aiGenerated ? (
                  <p className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    AI 洞察暂时不可用，可先参考热榜中的商机分列（规则层量化结果）。
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* 热榜 + 行业分布 + 飙升榜 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* TikTok 热榜 */}
            <Card className="rounded-xl border-zinc-200 shadow-none xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                  <Hash className="h-4 w-4 text-[#00b8b0]" />
                  TikTok 美区热门话题榜（近 7 天）
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {tiktok ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-[11px] text-zinc-400">
                          <th className="w-10 px-2 py-2 font-medium">#</th>
                          <th className="px-2 py-2 font-medium">话题</th>
                          <th className="px-2 py-2 text-right font-medium">播放量</th>
                          <th className="px-2 py-2 text-right font-medium">发帖量</th>
                          <th className="px-2 py-2 text-right font-medium">动能</th>
                          <th className="px-2 py-2 font-medium">阶段</th>
                          <th className="px-2 py-2 text-right font-medium">商机分</th>
                          <th className="px-2 py-2 font-medium">行业</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiktok.hashtags.slice(0, 15).map((h: TikTokHashtagTrend, idx: number) => (
                          <tr key={h.hashtag} className="border-b border-zinc-50 transition-colors last:border-0 hover:bg-zinc-50">
                            <td className="px-2 py-2.5 tabular-nums text-zinc-400">{idx + 1}</td>
                            <td className="px-2 py-2.5">
                              {h.creativeCenterUrl ? (
                                <a
                                  href={h.creativeCenterUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group inline-flex items-center gap-1 font-medium text-zinc-800 hover:text-[#00b8b0]"
                                >
                                  #{h.hashtag}
                                  <ExternalLink className="h-3 w-3 text-zinc-300 group-hover:text-[#00b8b0]" />
                                </a>
                              ) : (
                                <span className="font-medium text-zinc-800">#{h.hashtag}</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{formatViews(h.views)}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-zinc-500">{formatViews(h.posts)}</td>
                            <td
                              className={cn(
                                'px-2 py-2.5 text-right tabular-nums font-medium',
                                h.momentumPct > 0 ? 'text-[#fe2c55]' : 'text-zinc-400',
                              )}
                            >
                              <span className="inline-flex items-center justify-end gap-0.5">
                                <DirectionIcon direction={h.trendDirection} className="h-3 w-3" />
                                {formatPct(h.momentumPct)}
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              {h.trendStage && (
                                <span className={cn('rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap', stageClass(h.trendStage))}>
                                  {h.trendStage}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              {(() => {
                                const s = scoreMap.get(h.hashtag);
                                if (!s) return <span className="text-[11px] text-zinc-300">…</span>;
                                return (
                                  <span
                                    title={`${VERDICT_LABEL[s.verdict]}：规模/动能/互动/电商相关度 × 阶段系数 + Google印证`}
                                    className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', scoreBadgeClass(s.score))}
                                  >
                                    {s.score}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="max-w-[140px] truncate px-2 py-2.5 text-[11px] text-zinc-400">
                              {h.industries.slice(0, 2).join(' / ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-zinc-400">TikTok 榜单数据不可用</p>
                )}
              </CardContent>
            </Card>

            {/* 右侧：行业分布 + 飙升榜 */}
            <div className="space-y-4">
              <Card className="rounded-xl border-zinc-200 shadow-none">
                <CardHeader className="pb-0">
                  <CardTitle className="text-[15px] font-semibold">行业热度分布</CardTitle>
                </CardHeader>
                <CardContent>
                  {industryBarOption ? (
                    <EChart option={industryBarOption} height={220} />
                  ) : (
                    <p className="py-10 text-center text-sm text-zinc-400">暂无数据</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-xl border-zinc-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                    <Flame className="h-4 w-4 text-[#fe2c55]" />
                    飙升话题 TOP5
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 px-4 pb-4">
                  {surging.map((h, i) => (
                    <div key={h.hashtag} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-50">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white',
                          i === 0 ? 'bg-[#fe2c55]' : i <= 2 ? 'bg-[#fe2c55]/60' : 'bg-zinc-300',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-800">#{h.hashtag}</span>
                      <span className="tabular-nums text-[12px] font-semibold text-[#fe2c55]">{formatPct(h.momentumPct)}</span>
                    </div>
                  ))}
                  {surging.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">暂无数据</p>}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Google Trends */}
          <Card className="rounded-xl border-zinc-200 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                  <Globe className="h-4 w-4 text-[#6366f1]" />
                  Google 搜索兴趣（美国 · 近 3 个月）
                </CardTitle>
                <div className="flex items-center gap-2">
                  <input
                    value={termsInput}
                    onChange={(e) => setTermsInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && refreshGoogle()}
                    placeholder="英文关键词，逗号分隔，最多 5 个"
                    className="h-8 w-64 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 placeholder:text-zinc-300 focus:border-[#00b8b0] focus:outline-none"
                  />
                  <button
                    onClick={refreshGoogle}
                    disabled={googleLoading}
                    className="flex h-8 items-center gap-1 rounded-lg bg-[#00b8b0] px-3 text-xs font-medium text-white transition-colors hover:bg-[#00a29b] disabled:opacity-50"
                  >
                    {googleLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    查询
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {google ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    {googleLineOption ? (
                      <EChart option={googleLineOption} height={240} />
                    ) : (
                      <p className="py-16 text-center text-sm text-zinc-400">当前关键词暂无搜索数据，试试更通用的英文词（如 christmas decorations）</p>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {google.insights.map((ins: GoogleTrendInsight) => (
                      <div key={ins.term} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-zinc-800">{ins.term}</p>
                          {ins.hasData ? (
                            <span className="tabular-nums text-lg font-bold text-zinc-900">
                              {ins.latest}
                              <span className="text-[10px] font-normal text-zinc-400"> /100</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-400">无数据</span>
                          )}
                        </div>
                        {ins.hasData && (
                          <>
                            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                              <span className={cn('tabular-nums font-medium', ins.changePercent > 0 ? 'text-[#fe2c55]' : 'text-zinc-400')}>
                                环比 {formatPct(ins.changePercent)}
                              </span>
                              {ins.isNearPeak && <span className="rounded bg-[#fe2c55]/10 px-1.5 py-0.5 text-[10px] text-[#fe2c55]">接近峰值</span>}
                            </p>
                            {ins.topRisingQueries.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {ins.topRisingQueries.slice(0, 4).map((q) => (
                                  <span key={q} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500 border border-zinc-100">
                                    {q}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-zinc-400">
                  {googleLoading ? '正在查询 Google Trends…' : 'Google Trends 数据不可用'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 营销日历 */}
          <Card className="rounded-xl border-zinc-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <Clock className="h-4 w-4 text-amber-500" />
                美国营销节点倒计时
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.calendar.map((ev) => (
                <div key={ev.name} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-zinc-800">{ev.name}</p>
                    {ev.urgent && (
                      <span className="rounded-full bg-[#fe2c55]/10 px-2 py-0.5 text-[10px] font-medium text-[#fe2c55]">备货紧张</span>
                    )}
                  </div>
                  <p className="mt-1.5">
                    <span className={cn('tabular-nums text-2xl font-bold', ev.urgent ? 'text-[#fe2c55]' : 'text-zinc-900')}>
                      {ev.daysUntil}
                    </span>
                    <span className="ml-1 text-[11px] text-zinc-400">天后 · {ev.dateLabel}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ev.categories.map((c) => (
                      <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500 border border-zinc-100">
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{ev.culture}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 数据来源脚注 */}
          <p className="pb-2 text-[11px] text-zinc-400">
            数据来源：TikTok Creative Center 美区 7 日榜（经 Apify，{fetchedAtLabel} 抓取）· Google Trends 搜索兴趣（经 Apify）· 美国营销日历（内置知识库）。榜单数据缓存 30 分钟。
          </p>
        </>
      )}
    </div>
  );
}
