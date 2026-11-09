import { NextResponse } from 'next/server';
import { deleteTask, getTask, updateTask } from '@/lib/test-store';
import type { TestStatus } from '@/lib/testing-types';

const STATUS_SET: ReadonlySet<string> = new Set(['preparing', 'running', 'judging', 'scaling', 'done']);

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const task = getTask(id);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    return NextResponse.json(task);
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.status === 'string' && STATUS_SET.has(body.status)) {
    patch.status = body.status as TestStatus;
    if (body.status === 'running') patch.startedAt = new Date().toISOString().slice(0, 10);
  }
  if (typeof body.rounds === 'number' && Number.isInteger(body.rounds) && body.rounds >= 0) {
    patch.rounds = body.rounds;
  }
  if (typeof body.breakEvenCpa === 'number' && body.breakEvenCpa > 0) {
    patch.breakEvenCpa = body.breakEvenCpa;
  }
  const task = updateTask(id, patch);
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  return NextResponse.json(task);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteTask(id)) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
