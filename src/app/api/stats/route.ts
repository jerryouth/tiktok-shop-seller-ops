// 市场趋势看板统计 API
import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/store';

export async function GET() {
  return NextResponse.json(getDashboardStats());
}
