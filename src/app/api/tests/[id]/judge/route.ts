import { NextResponse } from 'next/server';
import { judgeTask } from '@/lib/testing-sop';
import { getTask, updateTask } from '@/lib/test-store';

/** 执行 SOP 判定：把结论与依据写回任务 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  const result = judgeTask(task);
  if (result.verdict === 'continue') {
    return NextResponse.json({ task, verdict: null, reasons: result.reasons, diagnoses: result.diagnoses });
  }
  const updated = updateTask(id, {
    verdict: result.verdict,
    verdictReasons: result.reasons,
    diagnoses: result.diagnoses,
    judgedAt: new Date().toISOString(),
    status: result.verdict === 'scale' ? 'scaling' : result.verdict === 'kill' ? 'done' : task.status,
  });
  return NextResponse.json({
    task: updated,
    verdict: result.verdict,
    reasons: result.reasons,
    diagnoses: result.diagnoses,
  });
}
