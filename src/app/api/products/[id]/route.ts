// 单个商品 API：GET 详情（含评分明细与推荐理由），DELETE 删除
import { NextRequest, NextResponse } from 'next/server';
import { getProductById, removeProducts } from '@/lib/store';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const product = getProductById(id);
  if (!product) {
    return NextResponse.json({ error: '商品不存在' }, { status: 404 });
  }
  return NextResponse.json(product);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const removed = removeProducts([id]);
  if (removed === 0) {
    return NextResponse.json({ error: '商品不存在' }, { status: 404 });
  }
  return NextResponse.json({ removed });
}
