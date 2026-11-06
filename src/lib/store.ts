// 内存数据仓库：当前使用内置演示数据，后续可替换为数据库实现
// 通过 globalThis 挂载，避免开发环境 HMR 导致数据重复初始化
import { demoProducts } from './data';
import { computeScore, calcGrowthRate, HOT_THRESHOLD } from './scoring';
import {
  CATEGORIES,
  type Category,
  type DashboardStats,
  type ListQuery,
  type PagedResult,
  type Product,
  type ProductWithScore,
} from './types';

const globalRef = globalThis as unknown as {
  __ttShopProducts?: Product[];
  __ttShopSeq?: number;
};

function getProducts(): Product[] {
  if (!globalRef.__ttShopProducts) {
    globalRef.__ttShopProducts = demoProducts();
    globalRef.__ttShopSeq = globalRef.__ttShopProducts.length;
  }
  return globalRef.__ttShopProducts;
}

function nextId(): string {
  globalRef.__ttShopSeq = (globalRef.__ttShopSeq ?? 0) + 1;
  return `P${String(globalRef.__ttShopSeq).padStart(4, '0')}`;
}

function withScore(p: Product): ProductWithScore {
  return { ...p, score: computeScore(p) };
}

/** 查询商品列表：关键词、类目、价格/销量/评分/分数区间筛选 + 多字段排序 + 分页 */
export function queryProducts(query: ListQuery): PagedResult<ProductWithScore> {
  const {
    keyword = '',
    category = '',
    minPrice,
    maxPrice,
    minSales,
    maxSales,
    minRating,
    minScore,
    sortBy = 'listedAt',
    sortOrder = 'desc',
    page = 1,
    pageSize = 10,
  } = query;

  let items = getProducts().map(withScore);

  const kw = keyword.trim().toLowerCase();
  if (kw) {
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.category.toLowerCase().includes(kw) ||
        p.seller.toLowerCase().includes(kw),
    );
  }
  if (category && CATEGORIES.includes(category as Category)) {
    items = items.filter((p) => p.category === category);
  }
  if (typeof minPrice === 'number') items = items.filter((p) => p.price >= minPrice);
  if (typeof maxPrice === 'number') items = items.filter((p) => p.price <= maxPrice);
  if (typeof minSales === 'number') items = items.filter((p) => p.sales >= minSales);
  if (typeof maxSales === 'number') items = items.filter((p) => p.sales <= maxSales);
  if (typeof minRating === 'number') items = items.filter((p) => p.rating >= minRating);
  if (typeof minScore === 'number') {
    items = items.filter((p) => p.score.total >= minScore);
  }

  const dir = sortOrder === 'asc' ? 1 : -1;
  const valueOf = (p: ProductWithScore): number | string => {
    switch (sortBy) {
      case 'price':
        return p.price;
      case 'sales':
        return p.sales;
      case 'rating':
        return p.rating;
      case 'score':
        return p.score.total;
      case 'growth':
        return p.score.growthRate;
      case 'listedAt':
      default:
        return p.listedAt;
    }
  };
  items = [...items].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * dir;
    }
    return (va - vb) * dir;
  });

  const total = items.length;
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function getProductById(id: string): ProductWithScore | undefined {
  const found = getProducts().find((p) => p.id === id);
  return found ? withScore(found) : undefined;
}

export interface NewProductInput {
  name: string;
  category: string;
  price: number;
  cost: number;
  sales?: number;
  rating?: number;
  reviews?: number;
  listedAt?: string;
  competition?: number;
  heat?: number;
  seller?: string;
}

const CATEGORY_IMAGE: Record<Category, string> = {
  美妆个护: '/products/beauty-1.png',
  家居生活: '/products/home-1.png',
  服饰鞋包: '/products/fashion-1.png',
  数码电子: '/products/digital-1.png',
  母婴用品: '/products/baby-1.png',
  运动户外: '/products/sports-1.png',
};

const clampNum = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** 校验并规范化新商品入参，返回错误信息（null 表示通过） */
export function validateProductInput(input: NewProductInput): string | null {
  if (!input.name || !input.name.trim()) return '商品名称不能为空';
  if (input.name.trim().length > 60) return '商品名称不能超过 60 个字符';
  if (!CATEGORIES.includes(input.category as Category)) return '类目不合法';
  if (!Number.isFinite(input.price) || input.price <= 0) return '售价必须大于 0';
  if (!Number.isFinite(input.cost) || input.cost < 0) return '成本不能为负数';
  if (input.cost >= input.price) return '成本必须低于售价';
  if (input.rating !== undefined && (input.rating < 0 || input.rating > 5))
    return '评分需在 0-5 之间';
  if (input.competition !== undefined && (input.competition < 0 || input.competition > 100))
    return '竞争度需在 0-100 之间';
  if (input.heat !== undefined && (input.heat < 0 || input.heat > 100))
    return '热度指数需在 0-100 之间';
  return null;
}

/** 新增商品（人工录入），未填字段自动给出合理默认值 */
export function addProduct(input: NewProductInput): ProductWithScore {
  const category = input.category as Category;
  const sales = Math.max(0, Math.round(input.sales ?? 0));
  const dailyBase = Math.max(2, Math.round(sales / 200) || 5);
  const product: Product = {
    id: nextId(),
    name: input.name.trim(),
    category,
    image: CATEGORY_IMAGE[category],
    price: Number(input.price.toFixed(2)),
    cost: Number(input.cost.toFixed(2)),
    sales,
    rating: clampNum(input.rating ?? 4.5, 0, 5),
    reviews: Math.max(0, Math.round(input.reviews ?? 0)),
    listedAt: input.listedAt || new Date().toISOString().slice(0, 10),
    dailySales: Array.from({ length: 14 }, (_, i) =>
      Math.max(1, Math.round(dailyBase * (0.8 + ((i % 5) + 1) * 0.08))),
    ),
    competition: clampNum(Math.round(input.competition ?? 50), 0, 100),
    heat: clampNum(Math.round(input.heat ?? 60), 0, 100),
    seller: input.seller?.trim() || '自营店铺',
  };
  getProducts().unshift(product);
  return withScore(product);
}

/** 批量删除，返回删除数量 */
export function removeProducts(ids: string[]): number {
  const list = getProducts();
  const idSet = new Set(ids);
  const before = list.length;
  globalRef.__ttShopProducts = list.filter((p) => !idSet.has(p.id));
  return before - (globalRef.__ttShopProducts?.length ?? 0);
}

/** 简易 CSV 行解析（支持引号包裹与转义） */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
  items: ProductWithScore[];
}

/**
 * CSV 批量导入
 * 列顺序：名称,类目,售价,成本,销量,评分,评论数,上架时间,竞争度,热度,店铺
 */
export function importProductsFromCsv(csv: string): ImportResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: ImportResult = { imported: 0, failed: 0, errors: [], items: [] };
  if (lines.length === 0) {
    result.errors.push({ row: 0, message: 'CSV 内容为空' });
    return result;
  }

  const headerCells = parseCsvLine(lines[0]).map((c) => c.replace(/^﻿/, ''));
  const hasHeader = headerCells[0]?.includes('名称') || headerCells[1]?.includes('类目');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, index) => {
    const rowNo = hasHeader ? index + 2 : index + 1;
    const cells = parseCsvLine(line);
    if (cells.length < 4) {
      result.failed++;
      result.errors.push({ row: rowNo, message: '列数不足（至少需要名称、类目、售价、成本）' });
      return;
    }
    const num = (v: string | undefined): number | undefined => {
      if (v === undefined || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const input: NewProductInput = {
      name: cells[0] ?? '',
      category: cells[1] ?? '',
      price: num(cells[2]) ?? Number.NaN,
      cost: num(cells[3]) ?? Number.NaN,
      sales: num(cells[4]),
      rating: num(cells[5]),
      reviews: num(cells[6]),
      listedAt: cells[7] || undefined,
      competition: num(cells[8]),
      heat: num(cells[9]),
      seller: cells[10] || undefined,
    };
    const error = validateProductInput(input);
    if (error) {
      result.failed++;
      result.errors.push({ row: rowNo, message: error });
      return;
    }
    result.items.push(addProduct(input));
    result.imported++;
  });

  return result;
}

/** 市场趋势看板统计数据 */
export function getDashboardStats(): DashboardStats {
  const items = getProducts().map(withScore);

  const totalProducts = items.length;
  const avgScore =
    totalProducts === 0
      ? 0
      : Math.round(items.reduce((s, p) => s + p.score.total, 0) / totalProducts);
  const avgMargin =
    totalProducts === 0
      ? 0
      : items.reduce((s, p) => s + p.score.profitMargin, 0) / totalProducts;
  const hotCount = items.filter((p) => p.score.total >= HOT_THRESHOLD).length;
  const top = [...items].sort((a, b) => b.sales - a.sales)[0];

  const categoryMap = new Map<string, { sales: number; count: number }>();
  for (const p of items) {
    const entry = categoryMap.get(p.category) ?? { sales: 0, count: 0 };
    entry.sales += p.sales;
    entry.count += 1;
    categoryMap.set(p.category, entry);
  }
  const categorySales = [...categoryMap.entries()]
    .map(([category, v]) => ({ category, sales: v.sales, count: v.count }))
    .sort((a, b) => b.sales - a.sales);

  const days = 14;
  const salesTrend: { date: string; sales: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const idx = days - 1 - i;
    const sales = items.reduce((s, p) => s + (p.dailySales[idx] ?? 0), 0);
    salesTrend.push({ date: label, sales });
  }

  const surging = items
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      image: p.image,
      growthRate: calcGrowthRate(p.dailySales),
      recent7Sales: p.dailySales.slice(-7).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.growthRate - a.growthRate)
    .slice(0, 6);

  const bands = [
    { range: '潜力爆款（85-100）', test: (s: number) => s >= 85 },
    { range: '优质（70-84）', test: (s: number) => s >= 70 && s < 85 },
    { range: '一般（55-69）', test: (s: number) => s >= 55 && s < 70 },
    { range: '待观察（0-54）', test: (s: number) => s < 55 },
  ];
  const scoreDistribution = bands.map((b) => ({
    range: b.range,
    count: items.filter((p) => b.test(p.score.total)).length,
  }));

  return {
    overview: {
      totalProducts,
      avgScore,
      avgMargin,
      hotCount,
      topSales: top
        ? { id: top.id, name: top.name, sales: top.sales, image: top.image }
        : { id: '', name: '-', sales: 0, image: '' },
    },
    categorySales,
    salesTrend,
    surging,
    scoreDistribution,
  };
}
