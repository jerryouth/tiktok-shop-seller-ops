// 商品列表 API：GET 筛选/排序/分页，POST 新增，DELETE 批量删除
import { NextRequest, NextResponse } from 'next/server';
import {
  addProduct,
  queryProducts,
  removeProducts,
  validateProductInput,
  type NewProductInput,
} from '@/lib/store';
import type { SortField } from '@/lib/types';

const SORT_FIELDS: SortField[] = ['price', 'sales', 'rating', 'listedAt', 'score', 'growth'];

function numParam(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sortByRaw = sp.get('sortBy') ?? 'listedAt';
  const result = queryProducts({
    keyword: sp.get('keyword') ?? undefined,
    category: sp.get('category') ?? undefined,
    minPrice: numParam(sp.get('minPrice')),
    maxPrice: numParam(sp.get('maxPrice')),
    minSales: numParam(sp.get('minSales')),
    maxSales: numParam(sp.get('maxSales')),
    minRating: numParam(sp.get('minRating')),
    minScore: numParam(sp.get('minScore')),
    sortBy: SORT_FIELDS.includes(sortByRaw as SortField)
      ? (sortByRaw as SortField)
      : 'listedAt',
    sortOrder: sp.get('sortOrder') === 'asc' ? 'asc' : 'desc',
    page: numParam(sp.get('page')) ?? 1,
    pageSize: numParam(sp.get('pageSize')) ?? 10,
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  let body: NewProductInput;
  try {
    body = (await request.json()) as NewProductInput;
  } catch {
    return NextResponse.json({ error: '请求体不是合法的 JSON' }, { status: 400 });
  }
  const error = validateProductInput(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  const product = addProduct(body);
  return NextResponse.json(product, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let body: { ids?: string[] };
  try {
    body = (await request.json()) as { ids?: string[] };
  } catch {
    return NextResponse.json({ error: '请求体不是合法的 JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids 不能为空' }, { status: 400 });
  }
  const removed = removeProducts(body.ids.map(String));
  return NextResponse.json({ removed });
}
