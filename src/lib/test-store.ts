/**
 * 内容测试任务内存仓库（globalThis 挂载，HMR 安全；重启后重置为演示任务）
 */
import type { DailyMetric, TestTask, TestVideo } from './testing-types';

const KEY = '__content_test_store__';

interface TestStore {
  tasks: TestTask[];
  seq: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function seedDemoTask(): TestTask {
  const videos: TestVideo[] = [
    { id: 'V1', hook: 'pain', title: '痛点型：圣诞装饰收纳太崩溃' },
    { id: 'V2', hook: 'scene', title: '场景型：卧室一秒变圣诞氛围' },
    { id: 'V3', hook: 'compare', title: '对比型：普通灯串 vs 可收纳灯串' },
  ];
  // 三天演示数据：V2/V3 达标、V1 不达标 → 应判定「放量」
  const rows: Array<[string, number, number, number, number, number, number, number]> = [
    // [videoId, imp, completion, ctr, cpc, addToCart, cpa, spend]
    ['V1', 4200, 0.18, 0.006, 0.62, 0.03, 9.8, 30],
    ['V2', 6800, 0.34, 0.021, 0.28, 0.12, 3.1, 30],
    ['V3', 5400, 0.29, 0.016, 0.35, 0.09, 4.4, 30],
    ['V1', 3900, 0.17, 0.007, 0.58, 0.04, 8.9, 30],
    ['V2', 8200, 0.36, 0.024, 0.26, 0.13, 2.9, 30],
    ['V3', 6100, 0.31, 0.018, 0.31, 0.1, 3.8, 30],
    ['V1', 3600, 0.16, 0.005, 0.66, 0.03, 10.2, 30],
    ['V2', 9100, 0.37, 0.026, 0.24, 0.14, 2.6, 30],
    ['V3', 6600, 0.31, 0.019, 0.29, 0.11, 3.5, 30],
  ];
  const metrics: DailyMetric[] = rows.map((r, i) => ({
    id: `M${i + 1}`,
    videoId: r[0],
    date: daysAgo(3 - Math.floor(i / 3)),
    impressions: r[1],
    completionRate: r[2],
    ctr: r[3],
    cpc: r[4],
    addToCartRate: r[5],
    cpa: r[6],
    spend: r[7],
  }));
  return {
    id: 'T0001',
    name: '圣诞可收纳迷你灯串',
    keyword1688: '圣诞灯串 可收纳 迷你',
    source: '趋势洞察 #holidays',
    breakEvenCpa: 4.7,
    budgetCap: 300,
    status: 'judging',
    rounds: 0,
    videos,
    metrics,
    createdAt: daysAgo(4),
    startedAt: daysAgo(3),
  };
}

function getStore(): TestStore {
  const g = globalThis as unknown as Record<string, TestStore | undefined>;
  if (!g[KEY]) {
    g[KEY] = { tasks: [seedDemoTask()], seq: 1 };
  }
  return g[KEY];
}

export function listTasks(): TestTask[] {
  return [...getStore().tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTask(id: string): TestTask | undefined {
  return getStore().tasks.find((t) => t.id === id);
}

export function createTask(input: {
  name: string;
  keyword1688?: string;
  source?: string;
  breakEvenCpa: number;
  budgetCap?: number;
  videos: TestVideo[];
}): TestTask {
  const store = getStore();
  store.seq += 1;
  const task: TestTask = {
    id: `T${String(store.seq).padStart(4, '0')}`,
    name: input.name,
    keyword1688: input.keyword1688,
    source: input.source,
    breakEvenCpa: input.breakEvenCpa,
    budgetCap: input.budgetCap ?? 300,
    status: 'preparing',
    rounds: 0,
    videos: input.videos,
    metrics: [],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  store.tasks.push(task);
  return task;
}

export function updateTask(id: string, patch: Partial<TestTask>): TestTask | undefined {
  const task = getTask(id);
  if (!task) return undefined;
  Object.assign(task, patch);
  return task;
}

export function deleteTask(id: string): boolean {
  const store = getStore();
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  store.tasks.splice(idx, 1);
  return true;
}

export function addMetrics(id: string, entries: Array<Omit<DailyMetric, 'id'>>): TestTask | undefined {
  const task = getTask(id);
  if (!task) return undefined;
  const base = task.metrics.length;
  entries.forEach((e, i) => {
    task.metrics.push({ ...e, id: `M${base + i + 1}` });
  });
  if (task.status === 'preparing') {
    task.status = 'running';
    task.startedAt = task.startedAt ?? new Date().toISOString().slice(0, 10);
  }
  return task;
}
