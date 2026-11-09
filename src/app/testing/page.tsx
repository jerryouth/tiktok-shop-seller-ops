'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Gavel,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { buildVideoReport } from '@/lib/testing-sop';
import {
  HOOK_META,
  SOP_STAGES,
  STATUS_META,
  THRESHOLDS,
  VERDICT_META,
  type HookType,
  type MetricGrade,
  type TestTask,
  type TestVideo,
} from '@/lib/testing-types';
import { cn } from '@/lib/utils';

const GRADE_CLS: Record<MetricGrade, string> = {
  excellent: 'text-[#00b8b0]',
  pass: 'text-zinc-700',
  fail: 'text-[#fe2c55]',
};

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/* ---------------- 新建任务对话框 ---------------- */

interface VideoDraft {
  hook: HookType;
  title: string;
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [cpa, setCpa] = useState('');
  const [videos, setVideos] = useState<VideoDraft[]>([
    { hook: 'pain', title: '' },
    { hook: 'scene', title: '' },
    { hook: 'compare', title: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = async () => {
    setError('');
    const cpaNum = Number(cpa);
    if (!name.trim()) return setError('请填写品名');
    if (!Number.isFinite(cpaNum) || cpaNum <= 0) return setError('盈亏平衡 CPA 必须为正数（先让老K测算）');
    const validVideos = videos.filter((v) => v.title.trim());
    if (validVideos.length === 0) return setError('至少填写 1 条视频钩子');
    setSaving(true);
    try {
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          keyword1688: keyword.trim() || undefined,
          source: source.trim() || undefined,
          breakEvenCpa: cpaNum,
          videos: validVideos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-900">新建内容测试</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">品名 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：圣诞可收纳迷你灯串"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#00b8b0] focus:ring-2 focus:ring-[#00b8b0]/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">1688 找货词</label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="圣诞灯串 可收纳"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#00b8b0] focus:ring-2 focus:ring-[#00b8b0]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">盈亏平衡 CPA ($) *</label>
              <input value={cpa} onChange={(e) => setCpa(e.target.value)} placeholder="如 4.7" type="number" step="0.1"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#00b8b0] focus:ring-2 focus:ring-[#00b8b0]/20" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">机会来源</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="如：趋势洞察 #holidays / 老K推荐"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#00b8b0] focus:ring-2 focus:ring-[#00b8b0]/20" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">测试钩子（同品不同钩子，单变量原则）</label>
            <div className="space-y-2">
              {videos.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <select value={v.hook}
                    onChange={(e) => {
                      const next = [...videos];
                      next[i] = { ...next[i], hook: e.target.value as HookType };
                      setVideos(next);
                    }}
                    className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2 py-2 text-xs outline-none">
                    {Object.entries(HOOK_META).map(([k, m]) => (
                      <option key={k} value={k}>{m.label}</option>
                    ))}
                  </select>
                  <input value={v.title}
                    onChange={(e) => {
                      const next = [...videos];
                      next[i] = { ...next[i], title: e.target.value };
                      setVideos(next);
                    }}
                    placeholder={HOOK_META[v.hook].hint}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#00b8b0] focus:ring-2 focus:ring-[#00b8b0]/20" />
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-[#fe2c55]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">取消</button>
            <button onClick={() => void submit()} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-[#00b8b0] px-4 py-2 text-sm font-medium text-white hover:bg-[#00a09a] disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}创建测试
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 任务详情 ---------------- */

function TaskDetail({ task, onBack, onRefresh }: { task: TestTask; onRefresh: () => void; onBack: () => void }) {
  const [judging, setJudging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [entryDate, setEntryDate] = useState('');
  const [entry, setEntry] = useState<Record<string, Record<string, string>>>({});
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [entryError, setEntryError] = useState('');

  useEffect(() => {
    setEntryDate(new Date().toISOString().slice(0, 10));
  }, []);

  const reports = useMemo(
    () => task.videos.map((v: TestVideo) => buildVideoReport(v.id, task.metrics, task.breakEvenCpa)),
    [task],
  );
  const totalSpend = reports.reduce((s, r) => s + r.spend, 0);
  const stageIdx = SOP_STAGES.findIndex((s) => s.key === task.status);

  const judge = async () => {
    setJudging(true);
    try {
      await fetch(`/api/tests/${task.id}/judge`, { method: 'POST' });
      onRefresh();
    } finally {
      setJudging(false);
    }
  };

  const setStatus = async (status: string) => {
    await fetch(`/api/tests/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/tests/${task.id}`, { method: 'DELETE' });
      onBack();
    } finally {
      setDeleting(false);
    }
  };

  const retryRound = async () => {
    await fetch(`/api/tests/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rounds: task.rounds + 1, status: 'running' }),
    });
    onRefresh();
  };

  const setCell = (videoId: string, field: string, value: string) => {
    setEntry((prev) => ({ ...prev, [videoId]: { ...prev[videoId], [field]: value } }));
  };

  const submitMetrics = async () => {
    setEntryError('');
    if (!entryDate) return setEntryError('请选择日期');
    const entries: Array<Record<string, unknown>> = [];
    for (const v of task.videos) {
      const row = entry[v.id];
      if (!row || !row.impressions) continue;
      entries.push({
        videoId: v.id,
        date: entryDate,
        impressions: Number(row.impressions),
        completionRate: Number(row.completionRate) / 100,
        ctr: Number(row.ctr) / 100,
        cpc: Number(row.cpc),
        addToCartRate: Number(row.addToCartRate) / 100,
        cpa: Number(row.cpa),
        spend: Number(row.spend),
      });
    }
    if (entries.length === 0) return setEntryError('至少填写一条视频的展示量');
    setSavingMetrics(true);
    try {
      const res = await fetch(`/api/tests/${task.id}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');
      setEntry({});
      onRefresh();
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingMetrics(false);
    }
  };

  const metricFields = [
    { key: 'impressions', label: '播放', ph: '6800' },
    { key: 'completionRate', label: '完播%', ph: '34' },
    { key: 'ctr', label: 'CTR%', ph: '2.1' },
    { key: 'cpc', label: 'CPC$', ph: '0.28' },
    { key: 'addToCartRate', label: '加购%', ph: '12' },
    { key: 'cpa', label: 'CPA$', ph: '3.1' },
    { key: 'spend', label: '消耗$', ph: '45' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-1.5 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600">
            <ArrowLeft className="h-3 w-3" />返回列表
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-zinc-900">
            {task.name}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_META[task.status].cls)}>
              {STATUS_META[task.status].label}
            </span>
            {task.verdict && (
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VERDICT_META[task.verdict].cls)}>
                {VERDICT_META[task.verdict].label}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            盈亏平衡 CPA ${task.breakEvenCpa} · 第 {task.rounds} 轮{task.keyword1688 ? ` · 找货词：${task.keyword1688}` : ''}{task.source ? ` · 来源：${task.source}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => void judge()} disabled={judging}
            className="flex items-center gap-1.5 rounded-lg bg-[#00b8b0] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#00a09a] disabled:opacity-50">
            {judging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
            执行 SOP 判定
          </button>
          <button onClick={() => void remove()} disabled={deleting}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-[#fe2c55]/30 hover:text-[#fe2c55]">
            <Trash2 className="h-3.5 w-3.5" />删除
          </button>
        </div>
      </div>

      {/* SOP 阶段条 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center">
          {SOP_STAGES.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1 text-center">
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                  i < stageIdx ? 'border-[#00b8b0] bg-[#00b8b0] text-white'
                    : i === stageIdx ? 'border-[#00b8b0] bg-white text-[#00b8b0]'
                      : 'border-zinc-200 bg-white text-zinc-300',
                )}>
                  {i < stageIdx ? <CheckCircle2 className="h-4 w-4" /> : i}
                </div>
                <div>
                  <p className={cn('text-[11px] font-medium', i <= stageIdx ? 'text-zinc-800' : 'text-zinc-300')}>{s.label}</p>
                  <p className="hidden text-[10px] text-zinc-400 lg:block">{s.desc}</p>
                </div>
              </div>
              {i < SOP_STAGES.length - 1 && (
                <div className={cn('mx-2 mb-6 h-0.5 flex-1', i < stageIdx ? 'bg-[#00b8b0]' : 'bg-zinc-100')} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
          <span className="text-[11px] text-zinc-400">阶段流转：</span>
          {(['preparing', 'running', 'judging', 'scaling', 'done'] as const).map((s) => (
            <button key={s} onClick={() => void setStatus(s)}
              className={cn('rounded-full border px-2.5 py-1 text-[11px]',
                task.status === s ? 'border-[#00b8b0] bg-[#00b8b0]/5 text-[#00b8b0]' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300')}>
              {STATUS_META[s].label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-zinc-400">
            消耗 <span className={cn('font-semibold', totalSpend > task.budgetCap ? 'text-[#fe2c55]' : 'text-zinc-800')}>${totalSpend.toFixed(0)}</span> / 红线 ${task.budgetCap}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className={cn('h-full rounded-full', totalSpend > task.budgetCap ? 'bg-[#fe2c55]' : 'bg-[#00b8b0]')}
            style={{ width: `${Math.min(100, (totalSpend / task.budgetCap) * 100)}%` }} />
        </div>
      </div>

      {/* 判定结论卡 */}
      {task.verdict && task.verdictReasons && (
        <div className={cn('rounded-xl border p-5',
          task.verdict === 'scale' ? 'border-[#fe2c55]/30 bg-[#fe2c55]/5'
            : task.verdict === 'optimize' ? 'border-amber-300 bg-amber-50' : 'border-zinc-200 bg-zinc-50')}>
          <div className="mb-2 flex items-center gap-2">
            <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', VERDICT_META[task.verdict].cls)}>
              {VERDICT_META[task.verdict].label}
            </span>
            <span className="text-xs text-zinc-400">判定依据（SOP 决策矩阵）</span>
          </div>
          <ul className="space-y-1">
            {task.verdictReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-700">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />{r}
              </li>
            ))}
          </ul>
          {task.diagnoses && task.diagnoses.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              {task.diagnoses.map((d, i) => (
                <p key={i} className="text-xs text-amber-700">⚠ {d}</p>
              ))}
            </div>
          )}
          {task.verdict === 'optimize' && (
            <button onClick={() => void retryRound()}
              className="mt-3 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              开启第 {task.rounds + 1} 轮重测
            </button>
          )}
        </div>
      )}

      {/* 视频指标表 */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-zinc-900">钩子表现（按展示量加权聚合）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500">
                <th className="px-5 py-2.5 font-medium">视频钩子</th>
                <th className="px-3 py-2.5 text-right font-medium">播放</th>
                <th className="px-3 py-2.5 text-right font-medium">完播率</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="px-3 py-2.5 text-right font-medium">CPC</th>
                <th className="px-3 py-2.5 text-right font-medium">加购率</th>
                <th className="px-3 py-2.5 text-right font-medium">CPA</th>
                <th className="px-3 py-2.5 text-right font-medium">消耗</th>
                <th className="px-5 py-2.5 text-right font-medium">判定</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const v = task.videos.find((x) => x.id === r.videoId);
                return (
                  <tr key={r.videoId} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-800">{v?.title}</p>
                      <p className="text-[11px] text-zinc-400">{HOOK_META[v?.hook ?? 'custom'].label}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{r.impressions.toLocaleString()}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums font-medium', GRADE_CLS[r.grades.completion])}>{pct(r.avgCompletion)}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums font-medium', GRADE_CLS[r.grades.ctr])}>{pct(r.avgCtr)}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', GRADE_CLS[r.grades.cpc])}>${r.avgCpc.toFixed(2)}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums font-medium', GRADE_CLS[r.grades.addToCart])}>{pct(r.avgAddToCart)}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums font-medium', GRADE_CLS[r.grades.cpa])}>${r.avgCpa.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-600">${r.spend.toFixed(0)}</td>
                    <td className="px-5 py-3 text-right">
                      {r.impressions === 0 ? (
                        <span className="text-xs text-zinc-300">未投放</span>
                      ) : r.passed ? (
                        <span className="rounded-full bg-[#00b8b0]/10 px-2 py-0.5 text-[11px] font-medium text-[#00b8b0]">达标</span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">未达标</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 逐日数据录入 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-zinc-900">逐日数据录入</h3>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#00b8b0]" />
        </div>
        <div className="space-y-2.5">
          {task.videos.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-40 shrink-0 truncate text-xs text-zinc-600" title={v.title}>{v.title}</span>
              {metricFields.map((f) => (
                <input key={f.key} value={entry[v.id]?.[f.key] ?? ''}
                  onChange={(e) => setCell(v.id, f.key, e.target.value)}
                  placeholder={f.label} type="number" step="any"
                  className="w-[72px] rounded-lg border border-zinc-200 px-2 py-1.5 text-xs tabular-nums outline-none focus:border-[#00b8b0]" />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => void submitMetrics()} disabled={savingMetrics}
            className="flex items-center gap-1.5 rounded-lg bg-[#00b8b0] px-4 py-2 text-xs font-medium text-white hover:bg-[#00a09a] disabled:opacity-50">
            {savingMetrics && <Loader2 className="h-3 w-3 animate-spin" />}保存当日数据
          </button>
          {entryError && <p className="text-xs text-[#fe2c55]">{entryError}</p>}
          <span className="ml-auto text-[11px] text-zinc-400">已录 {task.metrics.length} 条日数据</span>
        </div>
      </div>

      {/* 门槛速查 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-2 text-[13px] font-semibold text-zinc-900">SOP 判定门槛（美区 TikTok 基准）</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-500 md:grid-cols-5">
          <p>CTR 优秀 ≥{pct(THRESHOLDS.ctr.excellent)} / 及格 ≥{pct(THRESHOLDS.ctr.pass)}</p>
          <p>完播 ≥{pct(THRESHOLDS.completion.excellent)} / ≥{pct(THRESHOLDS.completion.pass)}</p>
          <p>CPC ≤${THRESHOLDS.cpc.excellent} / ≤${THRESHOLDS.cpc.pass}</p>
          <p>加购 ≥{pct(THRESHOLDS.addToCart.excellent)} / ≥{pct(THRESHOLDS.addToCart.pass)}</p>
          <p>CPA 安全线 ≤ 盈亏平衡 ×{THRESHOLDS.cpaSafeRatio}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 页面主体 ---------------- */

export default function TestingPage() {
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tests');
      const data = await res.json();
      setTasks(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = tasks.find((t) => t.id === selectedId);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6">
      {!selected && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">内容测试工作台</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                7 天单品单轮 SOP：D0 准备 → D1-3 投放 → D4 判定 → D5-7 放量 · 单变量原则 · 预算红线 $300
              </p>
            </div>
            <button onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#00b8b0] px-4 py-2 text-sm font-medium text-white hover:bg-[#00a09a]">
              <Plus className="h-4 w-4" />新建测试
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-10 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />加载中…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-white p-14 text-center">
              <FlaskConical className="h-8 w-8 text-zinc-300" />
              <p className="text-sm text-zinc-500">还没有测试任务</p>
              <p className="text-xs text-zinc-400">从趋势洞察或老K那里选一个方向，建一个 7 天内容测试</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((t) => {
                const spend = t.metrics.reduce((s, m) => s + m.spend, 0);
                const days = new Set(t.metrics.map((m) => m.date)).size;
                return (
                  <button key={t.id} onClick={() => setSelectedId(t.id)}
                    className="group rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:border-[#00b8b0]/40 hover:shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_META[t.status].cls)}>
                        {STATUS_META[t.status].label}
                      </span>
                      {t.verdict && (
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VERDICT_META[t.verdict].cls)}>
                          {VERDICT_META[t.verdict].label}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-zinc-300">{t.id}</span>
                    </div>
                    <p className="mb-1 text-[15px] font-semibold text-zinc-900 group-hover:text-[#00b8b0]">{t.name}</p>
                    <p className="mb-3 text-xs text-zinc-400">{t.videos.length} 条钩子 · 已投 {days} 天 · 第 {t.rounds} 轮</p>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>消耗 ${spend.toFixed(0)} / ${t.budgetCap}</span>
                      <span className="tabular-nums">CPA 基线 ${t.breakEvenCpa}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn('h-full rounded-full', spend > t.budgetCap ? 'bg-[#fe2c55]' : 'bg-[#00b8b0]')}
                        style={{ width: `${Math.min(100, (spend / t.budgetCap) * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-white px-4 py-3 text-[11px] text-zinc-400">
            <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              SOP 要点：同品、同预算、不同钩子（单变量）；每条钩子 $30-50/天连投 3 天；判定三选一——≥2 条达标放量 / 单项短板优化重测（≤2 轮）/ CTR 持续 &lt;1% 止损。素材可先在「主图工作台」生成，盈亏平衡 CPA 先让老K测算。
            </span>
          </div>
        </>
      )}

      {selected && (
        <TaskDetail task={selected} onBack={() => setSelectedId(null)} onRefresh={() => void load()} />
      )}

      <CreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={() => void load()} />
    </div>
  );
}
