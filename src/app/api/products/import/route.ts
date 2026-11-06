// CSV 批量导入 API
import { NextRequest, NextResponse } from 'next/server';
import { importProductsFromCsv } from '@/lib/store';

export async function POST(request: NextRequest) {
  let body: { csv?: string };
  try {
    body = (await request.json()) as { csv?: string };
  } catch {
    return NextResponse.json({ error: '请求体不是合法的 JSON' }, { status: 400 });
  }
  if (!body.csv || !body.csv.trim()) {
    return NextResponse.json({ error: 'CSV 内容不能为空' }, { status: 400 });
  }
  const result = importProductsFromCsv(body.csv);
  return NextResponse.json(result);
}
