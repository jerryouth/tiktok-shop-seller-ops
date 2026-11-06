'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Flame,
  Package,
  PiggyBank,
  Star,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EChart } from '@/components/echart';
import { formatPercent, formatSales, scoreBand } from '@/lib/format';
import type { DashboardStats } from '@/lib/types';

const PIE_COLORS = ['#fe2c55', '#00b8b0', '#f59e0b', '#94a3b8'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((res) => {
        if (!res.ok) throw new Error('stats fetch failed');
        return res.json();
      })
      .then((data: DashboardStats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryBarOption = useMemo(() => {
    if (!stats) return null;
    return {
      grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: {
          color: '#a1a1aa',
          fontSize: 11,
          formatter: (v: number) => formatSales(v),
        },
        splitLine: { lineStyle: { color: '#f4f4f5' } },
      },
      yAxis: {
        type: 'category' as const,
        data: stats.categorySales.map((c) => c.category).reverse(),
        axisLabel: { color: '#3f3f46', fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; value: number }[];
          const idx = list[0].dataIndex;
          const item = [...stats.categorySales].reverse()[idx];
          return `${item.category}<br/>累计销量：${formatSales(item.sales)} 单<br/>在售商品：${item.count} 个`;
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: stats.categorySales.map((c) => c.sales).reverse(),
          barWidth: 18,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
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
            fontSize: 11,
            formatter: (p: unknown) => formatSales((p as { value: number }).value),
          },
        },
      ],
    };
  }, [stats]);

  const salesTrendOption = useMemo(() => {
    if (!stats) return null;
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: stats.salesTrend.map((d) => d.date),
        boundaryGap: false,
        axisLabel: { color: '#a1a1aa', fontSize: 11 },
        axisLine: { lineStyle: { color: '#e4e4e7' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: '#a1a1aa', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f4f4f5' } },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const list = params as { axisValue: string; value: number }[];
          return `${list[0].axisValue}<br/>全店销量：${formatSales(list[0].value)} 单`;
        },
      },
      series: [
        {
          type: 'line' as const,
          data: stats.salesTrend.map((d) => d.sales),
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#00b8b0', width: 2.5 },
          itemStyle: { color: '#00b8b0' },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,184,176,0.22)' },
                { offset: 1, color: 'rgba(0,184,176,0.01)' },
              ],
            },
          },
        },
      ],
    };
  }, [stats]);

  const scorePieOption = useMemo(() => {
    if (!stats) return null;
    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: unknown) => {
          const d = p as { name: string; value: number; percent: number };
          return `${d.name}<br/>${d.value} 个商品（${d.percent}%）`;
        },
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#71717a', fontSize: 11 },
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
          label: {
            fontSize: 11,
            color: '#52525b',
            formatter: '{c} 个',
          },
          data: stats.scoreDistribution.map((d, i) => ({
            name: d.range,
            value: d.count,
            itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
          })),
        },
      ],
    };
  }, [stats]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">市场趋势看板</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          基于选品库实时数据的市场概览与机会洞察
        </p>
      </div>

      {/* 统计概览卡片 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          loading={!stats}
          icon={<Package className="h-4 w-4 text-[#089b94]" />}
          label="总商品数"
          value={stats ? `${stats.overview.totalProducts} 个` : '-'}
          sub={stats ? `潜力爆款 ${stats.overview.hotCount} 个` : ''}
        />
        <StatCard
          loading={!stats}
          icon={<Star className="h-4 w-4 text-[#089b94]" />}
          label="平均选品评分"
          value={stats ? `${stats.overview.avgScore} 分` : '-'}
          sub={
            stats
              ? `分数档位：${scoreBand(stats.overview.avgScore).text}`
              : ''
          }
        />
        <StatCard
          loading={!stats}
          icon={<Trophy className="h-4 w-4 text-[#fe2c55]" />}
          label="最高销量商品"
          value={stats ? formatSales(stats.overview.topSales.sales) : '-'}
          sub={stats ? stats.overview.topSales.name : ''}
          highlight
        />
        <StatCard
          loading={!stats}
          icon={<PiggyBank className="h-4 w-4 text-[#089b94]" />}
          label="平均利润率"
          value={
            stats ? formatPercent(stats.overview.avgMargin, false) : '-'
          }
          sub="（售价 - 成本）/ 售价"
        />
      </div>

      {/* 中部图表区 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="border-zinc-200 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">近 14 天全店销量趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {salesTrendOption ? (
              <EChart option={salesTrendOption} height={280} />
            ) : (
              <Skeleton className="h-[280px] w-full" />
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">热销品类排行</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBarOption ? (
              <EChart option={categoryBarOption} height={280} />
            ) : (
              <Skeleton className="h-[280px] w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 底部：飙升榜 + 评分分布 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="border-zinc-200 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-[15px]">
              <Flame className="h-4 w-4 text-[#fe2c55]" />
              飙升商品榜
              <span className="ml-1 text-xs font-normal text-zinc-400">
                近 7 天销量增幅 TOP 6
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}
            {stats && (
              <ul className="divide-y divide-zinc-100">
                {stats.surging.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={
                        index < 3
                          ? 'w-6 text-center text-sm font-bold text-[#fe2c55] tabular-nums'
                          : 'w-6 text-center text-sm font-medium text-zinc-400 tabular-nums'
                      }
                    >
                      {index + 1}
                    </span>
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-100">
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-900">
                        {item.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {item.category} · 近 7 天 {formatSales(item.recent7Sales)} 单
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-[#ffe8ed] px-2 py-1 text-xs font-semibold text-[#fe2c55] tabular-nums">
                      <TrendingUp className="h-3 w-3" />
                      {formatPercent(item.growthRate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p className="py-8 text-center text-sm text-zinc-500">
                数据加载失败，请刷新重试
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">选品评分分布</CardTitle>
          </CardHeader>
          <CardContent>
            {scorePieOption ? (
              <EChart option={scorePieOption} height={300} />
            ) : (
              <Skeleton className="h-[300px] w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  loading,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className="border-zinc-200">
      <CardContent className="pt-1 pb-5">
        {loading ? (
          <>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              {icon}
              {label}
            </div>
            <p
              className={
                highlight
                  ? 'mt-2 text-2xl font-bold text-[#fe2c55] tabular-nums'
                  : 'mt-2 text-2xl font-bold text-zinc-900 tabular-nums'
              }
            >
              {value}
            </p>
            {sub && (
              <p className="mt-1 truncate text-xs text-zinc-400" title={sub}>
                {sub}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
