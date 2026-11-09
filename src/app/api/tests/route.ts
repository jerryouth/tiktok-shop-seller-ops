import { NextResponse } from 'next/server';
import { createTask, listTasks } from '@/lib/test-store';
import type { HookType, TestVideo } from '@/lib/testing-types';

export function GET() {
  return NextResponse.json({ items: listTasks() });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const breakEvenCpa = Number(body.breakEvenCpa);
  if (!name) return NextResponse.json({ error: '品名必填' }, { status: 400 });
  if (!Number.isFinite(breakEvenCpa) || breakEvenCpa <= 0) {
    return NextResponse.json({ error: '盈亏平衡 CPA 必须为正数（可先用老K测算）' }, { status: 400 });
  }
  const rawVideos = Array.isArray(body.videos) ? body.videos : [];
  const videos: TestVideo[] = rawVideos
    .map((v, i) => {
      if (typeof v !== 'object' || v === null) return null;
      const r = v as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      if (!title) return null;
      const hook: HookType =
        r.hook === 'pain' || r.hook === 'scene' || r.hook === 'compare' ? r.hook : 'custom';
      return { id: `V${i + 1}`, hook, title };
    })
    .filter((v): v is TestVideo => v !== null);
  if (videos.length === 0) {
    return NextResponse.json({ error: '至少提供 1 条测试视频钩子' }, { status: 400 });
  }
  const budgetCap = Number(body.budgetCap);
  const task = createTask({
    name,
    keyword1688: typeof body.keyword1688 === 'string' ? body.keyword1688 : undefined,
    source: typeof body.source === 'string' ? body.source : undefined,
    breakEvenCpa,
    budgetCap: Number.isFinite(budgetCap) && budgetCap > 0 ? budgetCap : undefined,
    videos,
  });
  return NextResponse.json(task, { status: 201 });
}
