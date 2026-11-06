'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Star, TrendingUp } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { EChart } from '@/components/echart';
import { ScoreBadge } from '@/components/score-badge';
import { DIMENSION_META } from '@/lib/scoring';
import { formatCurrency, formatPercent, formatSales, scoreBand } from '@/lib/format';
import type { ProductWithScore } from '@/lib/types';

interface ProductDetailDrawerProps {
  productId: string | null;
  onClose: () => void;
}

export function ProductDetailDrawer({ productId, onClose }: ProductDetailDrawerProps) {
  const [product, setProduct] = useState<ProductWithScore | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    setProduct(null);
    fetch(`/api/products/${productId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProductWithScore | null) => {
        if (!cancelled) setProduct(data);
      })
      .catch(() => {
        if (!cancelled) setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const radarOption = product
    ? {
        radar: {
          indicator: DIMENSION_META.map((m) => ({ name: m.label, max: 100 })),
          radius: '68%',
          axisName: { color: '#52525b', fontSize: 12 },
          splitArea: {
            areaStyle: { color: ['#fafafa', '#f4f5f7'] },
          },
          splitLine: { lineStyle: { color: '#e4e4e7' } },
          axisLine: { lineStyle: { color: '#e4e4e7' } },
        },
        series: [
          {
            type: 'radar' as const,
            data: [
              {
                value: DIMENSION_META.map(
                  (m) => product.score.dimensions[m.key],
                ),
                name: '维度得分',
                areaStyle: { color: 'rgba(0, 184, 176, 0.25)' },
                lineStyle: { color: '#00b8b0', width: 2 },
                itemStyle: { color: '#00b8b0' },
                symbolSize: 5,
              },
            ],
          },
        ],
      }
    : null;

  const salesOption = product
    ? {
        grid: { left: 40, right: 12, top: 16, bottom: 24 },
        xAxis: {
          type: 'category' as const,
          data: product.dailySales.map((_, i) => `${i + 1}`),
          axisLabel: { color: '#a1a1aa', fontSize: 10 },
          axisLine: { lineStyle: { color: '#e4e4e7' } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: { color: '#a1a1aa', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f4f4f5' } },
        },
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: unknown) => {
            const list = params as { dataIndex: number; value: number }[];
            const p = list[0];
            return `近第 ${p.dataIndex + 1} 天：${p.value} 单`;
          },
        },
        series: [
          {
            type: 'bar' as const,
            data: product.dailySales,
            barWidth: '55%',
            itemStyle: { color: '#00b8b0', borderRadius: [3, 3, 0, 0] },
          },
        ],
      }
    : null;

  return (
    <Sheet open={productId !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        {loading && (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {!loading && product && (
          <>
            <SheetHeader className="pb-0">
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-left text-base leading-snug">
                    {product.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-left">
                    {product.seller} · 货号 {product.id}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{product.category}</Badge>
                    <ScoreBadge
                      score={product.score.total}
                      isHot={product.score.isHot}
                    />
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* 核心指标 */}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <Metric label="售价" value={formatCurrency(product.price)} />
              <Metric label="成本" value={formatCurrency(product.cost)} />
              <Metric
                label="利润率"
                value={formatPercent(product.score.profitMargin, false)}
              />
              <Metric label="累计销量" value={formatSales(product.sales)} />
              <Metric
                label="商品评分"
                value={`${product.rating.toFixed(1)} 分`}
                icon={<Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
              />
              <Metric
                label="7日增幅"
                value={formatPercent(product.score.growthRate)}
                icon={
                  <TrendingUp
                    className={
                      product.score.growthRate >= 0
                        ? 'h-3 w-3 text-[#fe2c55]'
                        : 'h-3 w-3 text-zinc-400'
                    }
                  />
                }
              />
            </div>

            <Separator className="my-5" />

            {/* 评分雷达 */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">
                  智能评分维度
                </h3>
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: scoreBand(product.score.total).hex }}
                >
                  综合 {product.score.total} 分
                </span>
              </div>
              {radarOption && <EChart option={radarOption} height={240} />}
              <ul className="mt-1 space-y-1.5">
                {DIMENSION_META.map((m) => (
                  <li
                    key={m.key}
                    className="flex items-center gap-2 text-xs text-zinc-600"
                  >
                    <span className="w-16 shrink-0">{m.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <span
                        className="block h-full rounded-full bg-[#00b8b0]"
                        style={{
                          width: `${product.score.dimensions[m.key]}%`,
                        }}
                      />
                    </span>
                    <span className="w-8 text-right font-medium tabular-nums text-zinc-800">
                      {product.score.dimensions[m.key]}
                    </span>
                    <span className="w-14 text-right text-[11px] text-zinc-400">
                      权重 {(m.weight * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <Separator className="my-5" />

            {/* 推荐理由 */}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                智能推荐理由
              </h3>
              <div className="rounded-xl border border-[#00b8b0]/20 bg-[#e0f7f6]/50 p-3.5 text-[13px] leading-relaxed text-zinc-700">
                {product.score.recommendation}
              </div>
            </section>

            <Separator className="my-5" />

            {/* 近 14 天销量 */}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                近 14 天日销量
              </h3>
              {salesOption && <EChart option={salesOption} height={180} />}
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
                <Metric label="评论数" value={formatSales(product.reviews)} />
                <Metric label="上架时间" value={product.listedAt} />
              </div>
            </section>
          </>
        )}

        {!loading && !product && (
          <p className="pt-10 text-center text-sm text-zinc-500">
            商品信息加载失败
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums text-zinc-900">
        {icon}
        {value}
      </p>
    </div>
  );
}
