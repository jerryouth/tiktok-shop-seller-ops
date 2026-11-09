import { NextResponse } from 'next/server';
import { addMetrics } from '@/lib/test-store';
import type { DailyMetric } from '@/lib/testing-types';

const NUM_FIELDS = ['impressions', 'completionRate', 'ctr', 'cpc', 'addToCartRate', 'cpa', 'spend'] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const raw = Array.isArray(body.entries) ? body.entries : [];
  const entries: Array<Omit<DailyMetric, 'id'>> = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.videoId !== 'string' || typeof r.date !== 'string') continue;
    const nums: Record<string, number> = {};
    let valid = true;
    for (const f of NUM_FIELDS) {
      const n = Number(r[f]);
      if (!Number.isFinite(n) || n < 0) {
        valid = false;
        break;
      }
      nums[f] = n;
    }
    if (!valid) continue;
    entries.push({
      videoId: r.videoId,
      date: r.date,
      impressions: nums.impressions,
      completionRate: nums.completionRate,
      ctr: nums.ctr,
      cpc: nums.cpc,
      addToCartRate: nums.addToCartRate,
      cpa: nums.cpa,
      spend: nums.spend,
    });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: '没有有效数据条目（需要 videoId/date + 7 项数值指标）' }, { status: 400 });
  }
  const task = addMetrics(id, entries);
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  return NextResponse.json(task);
}
