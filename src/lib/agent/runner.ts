// ReAct 循环：LLM 计划 → 解析工具协议 → 执行 Skill → 注入观察 → 直到产出最终回答
// 协议：模型调用工具时只输出一行 <tool_call>{"skill":"...","args":{...}}</tool_call>
import { Config, HeaderUtils, LLMClient, type Message } from 'coze-coding-dev-sdk';
import { AGENT_MODEL, MAX_AGENT_STEPS, buildSystemPrompt } from './prompts';
import { getSkill } from './skills';
import type { AgentEvent } from './types';

const TOOL_OPEN = '<tool_call>';
const TOOL_CLOSE = '</tool_call>';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  skill: string;
  args: Record<string, unknown>;
}

type ParseResult =
  | { kind: 'call'; call: ToolCall }
  | { kind: 'invalid' }
  | { kind: 'none' };

/** 从一轮输出中解析工具调用 */
function parseToolCall(text: string): ParseResult {
  const match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
  if (!match) {
    return text.includes(TOOL_OPEN) ? { kind: 'invalid' } : { kind: 'none' };
  }
  try {
    const obj = JSON.parse(match[1]) as { skill?: unknown; args?: unknown };
    if (typeof obj.skill !== 'string' || !obj.skill) return { kind: 'invalid' };
    const args =
      obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
        ? (obj.args as Record<string, unknown>)
        : {};
    return { kind: 'call', call: { skill: obj.skill, args } };
  } catch {
    return { kind: 'invalid' };
  }
}

/**
 * 流式执行一轮 LLM 输出。
 * 窥探输出前缀：以 <tool_call> 开头 → 本轮是工具调用（吞掉不转发）；
 * 否则 → 本轮是最终回答，边收边转发给前端。返回该轮完整文本。
 */
async function streamTurn(
  client: LLMClient,
  messages: Message[],
  emit: (e: AgentEvent) => void,
): Promise<string> {
  const stream = client.stream(messages, {
    model: AGENT_MODEL,
    temperature: 0.5,
  });

  let full = '';
  let pending = '';
  let decided: 'tool' | 'answer' | null = null;

  for await (const chunk of stream) {
    const raw = chunk.content;
    if (!raw) continue;
    const text = typeof raw === 'string' ? raw : String(raw);
    full += text;

    if (decided === 'answer') {
      emit({ type: 'content', content: text });
      continue;
    }
    if (decided === 'tool') continue;

    pending += text;
    const trimmed = pending.trimStart();
    if (!trimmed) continue;
    // 仍可能是 <tool_call> 的前缀，继续缓冲观察
    if (TOOL_OPEN.startsWith(trimmed) && trimmed.length < TOOL_OPEN.length) {
      continue;
    }

    if (trimmed.startsWith(TOOL_OPEN)) {
      decided = 'tool';
    } else {
      decided = 'answer';
      emit({ type: 'content', content: pending });
    }
    pending = '';
  }

  if (decided === null && pending) {
    emit({ type: 'content', content: pending });
  }
  return full;
}

export interface RunAgentOptions {
  /** 原始请求头（用于 SDK 链路追踪），由路由层从 request.headers 传入 */
  headers: Headers;
  history: ChatMessage[];
  emit: (event: AgentEvent) => void;
}

/** Agent 主循环：最多 MAX_AGENT_STEPS 轮工具调用后强制收敛 */
export async function runAgent({
  headers: rawHeaders,
  history,
  emit,
}: RunAgentOptions): Promise<void> {
  const headers = HeaderUtils.extractForwardHeaders(rawHeaders);
  const client = new LLMClient(new Config(), headers);
  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const turnText = await streamTurn(client, messages, emit);
    const parsed = parseToolCall(turnText);

    if (parsed.kind === 'none') return; // 最终回答已流式输出

    if (parsed.kind === 'invalid') {
      messages.push({ role: 'assistant', content: turnText });
      messages.push({
        role: 'user',
        content:
          '工具调用格式错误。请只输出一行：<tool_call>{"skill":"工具名","args":{...}}</tool_call>',
      });
      continue;
    }

    const { skill: skillName, args } = parsed.call;
    const skill = getSkill(skillName);
    if (!skill) {
      messages.push({ role: 'assistant', content: turnText });
      messages.push({
        role: 'user',
        content: `<tool_result>错误：不存在工具「${skillName}」，请从可用工具列表中选择</tool_result>`,
      });
      continue;
    }

    emit({ type: 'skill_start', skill: skillName, label: skill.description });
    messages.push({ role: 'assistant', content: turnText });
    try {
      const result = await skill.run(args, { headers });
      emit({
        type: 'skill_end',
        skill: skillName,
        label: skill.description,
        summary: result.summary,
      });
      messages.push({
        role: 'user',
        content: `<tool_result skill="${skillName}">\n${JSON.stringify(result.data)}\n</tool_result>`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';
      emit({
        type: 'skill_end',
        skill: skillName,
        label: skill.description,
        summary: `失败：${msg}`,
      });
      messages.push({
        role: 'user',
        content: `<tool_result skill="${skillName}">工具执行失败：${msg}。请调整参数重试，或基于已有信息直接给出回答。</tool_result>`,
      });
    }
  }

  // 超出最大轮次仍在调用工具：提示前端已收敛
  emit({ type: 'content', content: '（已达到最大分析轮次，以上基于已获取信息）' });
}
