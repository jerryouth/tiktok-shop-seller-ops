/**
 * 老K 会话历史本地持久化（localStorage）
 *
 * 为什么不放服务端：沙箱 dev server 会被回收，globalThis 内存仓库不可靠；
 * localStorage 跨刷新/跨天保留，适合单人使用的内部运营后台。
 * 存储预算：最多 30 个会话、每会话最多 100 条消息，超出按最旧淘汰。
 */

export interface StoredStep {
  skill: string;
  label: string;
  summary?: string;
  status: 'running' | 'done';
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: StoredStep[];
  stopped?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const STORAGE_KEY = 'laok_chat_history_v1';
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES = 100;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll(): Conversation[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Conversation =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Conversation).id === 'string' &&
        Array.isArray((c as Conversation).messages),
    );
  } catch {
    return [];
  }
}

function writeAll(list: Conversation[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存储超限：淘汰最旧会话后重试一次
    try {
      const pruned = [...list]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(5, Math.floor(MAX_CONVERSATIONS / 2)));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // 放弃写入，不影响聊天主流程
    }
  }
}

/** 读取全部会话（按最近更新降序） */
export function loadConversations(): Conversation[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 新建会话对象（未落库，首条消息到达时由 upsertConversation 写入） */
export function createConversation(firstUserText: string): Conversation {
  const now = Date.now();
  return {
    id: `conv-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: titleFromText(firstUserText),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

/** 用首条用户消息生成会话标题 */
export function titleFromText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleanTitle(cleaned) || '未命名会话';
}

function cleanTitle(t: string): string {
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

/** 写入/更新会话（按 id upsert，消息截断到最近 100 条） */
export function upsertConversation(conv: Conversation): Conversation[] {
  const list = readAll();
  const idx = list.findIndex((c) => c.id === conv.id);
  const normalized: Conversation = {
    ...conv,
    updatedAt: Date.now(),
    messages: conv.messages.slice(-MAX_MESSAGES),
  };
  if (idx >= 0) list[idx] = normalized;
  else list.push(normalized);
  // 数量淘汰：保留最近更新的
  const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  writeAll(sorted);
  return sorted;
}

/** 删除会话 */
export function deleteConversation(id: string): Conversation[] {
  const list = readAll().filter((c) => c.id !== id);
  writeAll(list);
  return list;
}

/** 列表用相对时间 */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}
