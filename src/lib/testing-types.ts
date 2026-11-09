/**
 * 内容测试 SOP 共享类型（前后端通用）
 */

export type HookType = 'pain' | 'scene' | 'compare' | 'custom';

export interface TestVideo {
  id: string;
  hook: HookType;
  title: string;
}

/** 单视频单日投放数据 */
export interface DailyMetric {
  id: string;
  videoId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  completionRate: number; // 0-1
  ctr: number; // 0-1
  cpc: number; // 美元
  addToCartRate: number; // 0-1
  cpa: number; // 美元
  spend: number; // 美元
}

export type TestStatus = 'preparing' | 'running' | 'judging' | 'scaling' | 'done';
export type TestVerdict = 'scale' | 'optimize' | 'kill';

export interface TestTask {
  id: string;
  name: string;
  keyword1688?: string;
  source?: string;
  /** 盈亏平衡 CPA（美元），来自老K测算 */
  breakEvenCpa: number;
  /** 预算红线，默认 $300 */
  budgetCap: number;
  status: TestStatus;
  /** 重测轮次（最多 2 轮） */
  rounds: number;
  verdict?: TestVerdict;
  verdictReasons?: string[];
  diagnoses?: string[];
  judgedAt?: string;
  videos: TestVideo[];
  metrics: DailyMetric[];
  createdAt: string;
  startedAt?: string;
}

export const HOOK_META: Record<HookType, { label: string; hint: string }> = {
  pain: { label: '痛点型', hint: '直击用户痛点，如「还在用 X 吗？」' },
  scene: { label: '场景型', hint: '展示使用场景与氛围，让用户代入' },
  compare: { label: '对比型', hint: '前后对比 / 竞品对比，效果直给' },
  custom: { label: '自定义', hint: '其他钩子' },
};

/** SOP 判定门槛（美区 TikTok 参考基准） */
export const THRESHOLDS = {
  ctr: { excellent: 0.015, pass: 0.01, kill: 0.01 },
  completion: { excellent: 0.3, pass: 0.25, hardFail: 0.2 },
  cpc: { excellent: 0.3, pass: 0.5, fail: 0.8 },
  addToCart: { excellent: 0.1, pass: 0.08, fail: 0.05 },
  /** CPA ≤ 盈亏平衡 × 0.7 为安全区 */
  cpaSafeRatio: 0.7,
  maxRounds: 2,
  defaultBudgetCap: 300,
} as const;

export type MetricGrade = 'excellent' | 'pass' | 'fail';

export interface VideoReport {
  videoId: string;
  impressions: number;
  spend: number;
  avgCompletion: number;
  avgCtr: number;
  avgCpc: number;
  avgAddToCart: number;
  avgCpa: number;
  grades: {
    ctr: MetricGrade;
    completion: MetricGrade;
    cpc: MetricGrade;
    addToCart: MetricGrade;
    cpa: MetricGrade;
  };
  passed: boolean;
}

export interface JudgeResult {
  verdict: TestVerdict | 'continue';
  reasons: string[];
  diagnoses: string[];
}

export const SOP_STAGES = [
  { key: 'preparing', label: 'D0 准备', desc: '素材包 + 成本基线 + 埋词' },
  { key: 'running', label: 'D1-3 投放', desc: '3 条钩子同预算跑量，逐日录数' },
  { key: 'judging', label: 'D4 判定', desc: '按门槛出三选一结论' },
  { key: 'scaling', label: 'D5-7 放量', desc: '胜出钩子加预算 + 寄样达人' },
  { key: 'done', label: '复盘归档', desc: '结论卡存档，指导下一轮' },
] as const;

export const STATUS_META: Record<TestStatus, { label: string; cls: string }> = {
  preparing: { label: '准备中', cls: 'bg-zinc-100 text-zinc-600' },
  running: { label: '投放中', cls: 'bg-[#00b8b0]/10 text-[#00b8b0]' },
  judging: { label: '待判定', cls: 'bg-amber-500/10 text-amber-600' },
  scaling: { label: '放量中', cls: 'bg-[#fe2c55]/10 text-[#fe2c55]' },
  done: { label: '已归档', cls: 'bg-zinc-100 text-zinc-500' },
};

export const VERDICT_META: Record<TestVerdict, { label: string; cls: string }> = {
  scale: { label: '放量', cls: 'bg-[#fe2c55] text-white' },
  optimize: { label: '优化重测', cls: 'bg-amber-500 text-white' },
  kill: { label: '止损放弃', cls: 'bg-zinc-400 text-white' },
};
