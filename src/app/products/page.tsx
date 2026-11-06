'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileUp,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/score-badge';
import { ProductFormDialog } from '@/components/product-form-dialog';
import { ImportDialog } from '@/components/import-dialog';
import { ProductDetailDrawer } from '@/components/product-detail-drawer';
import { formatCurrency, formatPercent, formatSales } from '@/lib/format';
import { CATEGORIES, type PagedResult, type ProductWithScore, type SortField } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const SORTABLE_COLUMNS: { key: SortField; label: string }[] = [
  { key: 'price', label: '售价' },
  { key: 'sales', label: '销量' },
  { key: 'rating', label: '评分' },
  { key: 'growth', label: '7日增幅' },
  { key: 'listedAt', label: '上架时间' },
  { key: 'score', label: '选品评分' },
];

export default function ProductsPage() {
  // 筛选状态
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minSales, setMinSales] = useState('');
  const [minRating, setMinRating] = useState('all');
  const [minScore, setMinScore] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('listedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // 数据状态
  const [data, setData] = useState<PagedResult<ProductWithScore> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 弹层状态
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 关键词防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const fetchList = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (category !== 'all') params.set('category', category);
      if (minPrice !== '') params.set('minPrice', minPrice);
      if (maxPrice !== '') params.set('maxPrice', maxPrice);
      if (minSales !== '') params.set('minSales', minSales);
      if (minRating !== 'all') params.set('minRating', minRating);
      if (minScore !== 'all') params.set('minScore', minScore);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));

      const res = await fetch(`/api/products?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('list fetch failed');
      const json = (await res.json()) as PagedResult<ProductWithScore>;
      setData(json);
      setSelected(new Set());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('商品列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [keyword, category, minPrice, maxPrice, minSales, minRating, minScore, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setCategory('all');
    setMinPrice('');
    setMaxPrice('');
    setMinSales('');
    setMinRating('all');
    setMinScore('all');
    setSortBy('listedAt');
    setSortOrder('desc');
    setPage(1);
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const allChecked = items.length > 0 && items.every((p) => selected.has(p.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allChecked) return new Set<string>();
      return new Set(items.map((p) => p.id));
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const json = (await res.json()) as { removed?: number; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? '删除失败');
        return;
      }
      toast.success(`已删除 ${json.removed ?? 0} 个商品`);
      setConfirmOpen(false);
      setSelected(new Set());
      fetchList();
    } catch {
      toast.error('网络异常，请稍后重试');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">选品库</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            共 {data?.total ?? '-'} 个商品，支持关键词搜索、组合筛选与多维排序
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              className="border-[#fe2c55]/30 text-[#fe2c55] hover:bg-[#ffe8ed] hover:text-[#fe2c55]"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              批量删除（{selected.size}）
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-1.5 h-4 w-4" />
            CSV 导入
          </Button>
          <Button
            className="bg-[#00b8b0] text-white hover:bg-[#089b94]"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            新增商品
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="pl-8"
              placeholder="搜索商品 / 店铺…"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
          </div>

          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="全部类目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类目</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              placeholder="最低价 $"
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setPage(1);
              }}
            />
            <span className="text-zinc-400">-</span>
            <Input
              type="number"
              min="0"
              placeholder="最高价 $"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <Input
            type="number"
            min="0"
            placeholder="最低销量，如 10000"
            value={minSales}
            onChange={(e) => {
              setMinSales(e.target.value);
              setPage(1);
            }}
          />

          <Select
            value={minRating}
            onValueChange={(v) => {
              setMinRating(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="评分不限" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">评分不限</SelectItem>
              <SelectItem value="4.5">4.5 分以上</SelectItem>
              <SelectItem value="4">4.0 分以上</SelectItem>
              <SelectItem value="3.5">3.5 分以上</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Select
              value={minScore}
              onValueChange={(v) => {
                setMinScore(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选品评分" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">评分不限</SelectItem>
                <SelectItem value="85">85+ 潜力爆款</SelectItem>
                <SelectItem value="70">70+ 优质</SelectItem>
                <SelectItem value="55">55+ 一般以上</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="重置筛选"
              onClick={resetFilters}
            >
              <RotateCcw className="h-4 w-4 text-zinc-500" />
            </Button>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    aria-label="全选"
                  />
                </TableHead>
                <TableHead className="min-w-[260px]">商品</TableHead>
                <TableHead>类目</TableHead>
                {SORTABLE_COLUMNS.map((col) => (
                  <TableHead key={col.key} className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 font-medium transition-colors hover:text-zinc-900',
                        sortBy === col.key ? 'text-[#089b94]' : 'text-zinc-600',
                      )}
                    >
                      {col.label}
                      {sortBy === col.key ? (
                        sortOrder === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-zinc-300" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={10} className="px-4 py-3">
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-16 text-center">
                    <p className="text-sm text-zinc-500">
                      没有符合条件的商品，试试调整筛选条件
                    </p>
                    <Button
                      variant="link"
                      className="mt-1 text-[#089b94]"
                      onClick={resetFilters}
                    >
                      清空筛选条件
                    </Button>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                items.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(p.id)}
                  >
                    <TableCell
                      className="pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                        aria-label={`选择 ${p.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-zinc-100">
                          <Image
                            src={p.image}
                            alt={p.name}
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate text-[13px] font-medium text-zinc-900">
                            {p.name}
                          </p>
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-zinc-400">
                            {p.seller}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {p.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatCurrency(p.price)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatSales(p.sales)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {p.rating.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums',
                          p.score.growthRate >= 0
                            ? 'text-[#fe2c55]'
                            : 'text-zinc-400',
                        )}
                      >
                        {p.score.growthRate >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {formatPercent(p.score.growthRate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-500 tabular-nums">
                      {p.listedAt}
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={p.score.total} isHot={p.score.isHot} />
                    </TableCell>
                    <TableCell
                      className="pr-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#089b94] hover:bg-[#e0f7f6] hover:text-[#089b94]"
                        onClick={() => setDetailId(p.id)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {data && data.totalPages > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
            <p className="text-xs text-zinc-500">
              第 {data.page} / {data.totalPages} 页，共 {data.total} 条
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                aria-label="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers(data.page, data.totalPages).map((n, idx) =>
                n === -1 ? (
                  <span key={`e${idx}`} className="px-1 text-xs text-zinc-400">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    size="icon-sm"
                    variant={n === data.page ? 'default' : 'outline'}
                    className={cn(
                      n === data.page &&
                        'bg-[#00b8b0] text-white hover:bg-[#089b94]',
                    )}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((v) => v + 1)}
                aria-label="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 弹层 */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchList}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={fetchList}
      />
      <ProductDetailDrawer
        productId={detailId}
        onClose={() => setDetailId(null)}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除已选中的 {selected.size} 个商品，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={deleting}
              className="bg-[#fe2c55] text-white hover:bg-[#e0264b]"
            >
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 分页页码窗口：当前页前后各 1 页，首尾省略 */
function pageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const result: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && list[i] - list[i - 1] > 1) result.push(-1);
    result.push(list[i]);
  }
  return result;
}
