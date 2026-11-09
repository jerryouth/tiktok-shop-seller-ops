/**
 * 内容测试 SOP 引擎：指标聚合 → 分级 → 三选一判定 → 异常诊断（纯函数，前后端共享）
 */
import {
  THRESHOLDS,
  type DailyMetric,
  type JudgeResult,
  type MetricGrade,
  type TestTask,
  type VideoReport,
} from './testing-types';

function gradeRate(value: number, excellent: number, pass: number, higherBetter = true): MetricGrade {
  if (higherBetter) {
    if (value >= excellent) return 'excellent';
    if (value >= pass) return 'pass';
    return 'fail';
  }
  if (value <= excellent) return 'excellent';
  if (value <= pass) return 'pass';
  return 'fail';
}

/** 按展示量/消耗加权的单视频聚合报告 */
export function buildVideoReport(
  videoId: string,
  metrics: DailyMetric[],
  breakEvenCpa: number,
): VideoReport {
  const mine = metrics.filter((m) => m.videoId === videoId);
  const impressions = mine.reduce((s, m) => s + m.impressions, 0);
  const spend = mine.reduce((s, m) => s + m.spend, 0);
  const wByImp = (v: number, m: DailyMetric) => v * Math.max(m.impressions, 1);
  const wBySpend = (v: number, m: DailyMetric) => v * Math.max(m.spend, 0.01);
  const impW = Math.max(impressions, 1);
  const spendW = Math.max(spend, 0.01);

  const avgCompletion = mine.reduce((s, m) => s + wByImp(m.completionRate, m), 0) / impW;
  const avgCtr = mine.reduce((s, m) => s + wByImp(m.ctr, m), 0) / impW;
  const avgAddToCart = mine.reduce((s, m) => s + wByImp(m.addToCartRate, m), 0) / impW;
  const avgCpc = mine.reduce((s, m) => s + wBySpend(m.cpc, m), 0) / spendW;
  const avgCpa = mine.reduce((s, m) => s + wBySpend(m.cpa, m), 0) / spendW;

  const grades: VideoReport['grades'] = {
    ctr: gradeRate(avgCtr, THRESHOLDS.ctr.excellent, THRESHOLDS.ctr.pass),
    completion: gradeRate(avgCompletion, THRESHOLDS.completion.excellent, THRESHOLDS.completion.pass),
    cpc: gradeRate(avgCpc, THRESHOLDS.cpc.excellent, THRESHOLDS.cpc.pass, false),
    addToCart: gradeRate(avgAddToCart, THRESHOLDS.addToCart.excellent, THRESHOLDS.addToCart.pass),
    cpa:
      avgCpa <= breakEvenCpa * THRESHOLDS.cpaSafeRatio
        ? 'excellent'
        : avgCpa <= breakEvenCpa
          ? 'pass'
          : 'fail',
  };

  const passed =
    grades.ctr !== 'fail' &&
    avgCompletion >= THRESHOLDS.completion.pass &&
    grades.addToCart !== 'fail' &&
    avgCpa <= breakEvenCpa;

  return { videoId, impressions, spend, avgCompletion, avgCtr, avgCpc, avgAddToCart, avgCpa, grades, passed };
}

/** 异常速查：0播放/高完播低CTR/高CTR低转化 */
export function diagnose(task: TestTask, reports: VideoReport[]): string[] {
  const out: string[] = [];
  const totalImpressions = reports.reduce((s, r) => s + r.impressions, 0);
  if (totalImpressions === 0 && task.metrics.length > 0) {
    out.push('全部 0 播放：账号权重问题——换号不换品，重新起号测试');
  }
  for (const r of reports) {
    if (r.impressions === 0) continue;
    if (r.avgCompletion >= THRESHOLDS.completion.pass && r.avgCtr < THRESHOLDS.ctr.pass) {
      out.push('高完播低 CTR：钩子好看但产品无感——建议换品不换号');
    }
    if (r.avgCtr >= THRESHOLDS.ctr.pass && r.avgAddToCart < THRESHOLDS.addToCart.fail) {
      out.push('高 CTR 低加购：价格或 Listing 问题——先查价格带与主图卖点');
    }
  }
  return Array.from(new Set(out));
}

/** SOP 三选一判定：放量 / 优化 / 放弃（数据不足时返回 continue） */
export function judgeTask(task: TestTask): JudgeResult {
  const reports = task.videos.map((v) => buildVideoReport(v.id, task.metrics, task.breakEvenCpa));
  const reasons: string[] = [];
  const diagnoses = diagnose(task, reports);
  const totalSpend = reports.reduce((s, r) => s + r.spend, 0);
  const testedVideos = reports.filter((r) => r.impressions > 0);

  if (testedVideos.length === 0) {
    return { verdict: 'continue', reasons: ['还没有有效投放数据，先跑 D1-3 投放'], diagnoses };
  }

  if (totalSpend > task.budgetCap) {
    reasons.push(`总消耗 $${totalSpend.toFixed(0)} 已超预算红线 $${task.budgetCap}，强制止损`);
    return { verdict: 'kill', reasons, diagnoses };
  }

  const passed = reports.filter((r) => r.passed);
  const fmt = (id: string) => task.videos.find((v) => v.id === id)?.title ?? id;

  if (passed.length >= 2) {
    reasons.push(`${passed.length} 条钩子全部达标（${passed.map((r) => fmt(r.videoId)).join('、')}）`);
    for (const r of passed) {
      reasons.push(
        `「${fmt(r.videoId)}」CTR ${(r.avgCtr * 100).toFixed(1)}%、加购 ${(r.avgAddToCart * 100).toFixed(1)}%、CPA $${r.avgCpa.toFixed(2)}（安全线 ≤$${(task.breakEvenCpa * THRESHOLDS.cpaSafeRatio).toFixed(2)}）`,
      );
    }
    reasons.push('进入 D5-7：胜出钩子加预算至 $100-200/天，同步寄样 5-10 个腰部达人');
    return { verdict: 'scale', reasons, diagnoses };
  }

  const ctrOkConvBad = reports.find(
    (r) => r.grades.ctr !== 'fail' && r.grades.addToCart === 'fail',
  );
  if (ctrOkConvBad) {
    reasons.push(`「${fmt(ctrOkConvBad.videoId)}」CTR 达标但加购率仅 ${(ctrOkConvBad.avgAddToCart * 100).toFixed(1)}%：流量质量没问题，转化承接有问题`);
    reasons.push('优化方向：调价格带 / 重做 Listing 主图与卖点，改完直接重测');
    return { verdict: 'optimize', reasons, diagnoses };
  }

  const ctrOkCompletionBad = reports.find(
    (r) => r.grades.ctr !== 'fail' && r.avgCompletion < THRESHOLDS.completion.pass,
  );
  if (ctrOkCompletionBad) {
    reasons.push(`「${fmt(ctrOkCompletionBad.videoId)}」CTR 达标但完播 ${(ctrOkCompletionBad.avgCompletion * 100).toFixed(0)}% 不足：前 3 秒留不住人`);
    reasons.push('优化方向：只换前 3 秒钩子重测，产品本身不动');
    return { verdict: 'optimize', reasons, diagnoses };
  }

  if (task.rounds < THRESHOLDS.maxRounds) {
    reasons.push(`全部钩子 CTR 未达 ${(THRESHOLDS.ctr.pass * 100).toFixed(0)}% 及格线，当前第 ${task.rounds} 轮（上限 ${THRESHOLDS.maxRounds} 轮）`);
    reasons.push('优化方向：整批换钩子素材重测一轮；连续两轮不达标则止损');
    return { verdict: 'optimize', reasons, diagnoses };
  }

  reasons.push(`已重测 ${task.rounds} 轮，CTR 仍全部低于 ${(THRESHOLDS.ctr.pass * 100).toFixed(0)}% 及格线`);
  reasons.push('按 SOP 止损归档：样品与投流费用记为测试成本，预算留给下一个品');
  return { verdict: 'kill', reasons, diagnoses };
}
