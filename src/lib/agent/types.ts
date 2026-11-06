// 选品 Agent 类型定义：Skill（工具）与 Agent 事件协议

/** Skill 执行上下文：透传请求头给下游 SDK（链路追踪/鉴权） */
export interface SkillContext {
  headers?: Record<string, string>;
}

/** Skill 执行结果：data 注入 LLM 观察（须可 JSON 序列化），summary 用于前端步骤展示 */
export interface SkillResult {
  data: unknown;
  summary: string;
}

/** Skill 定义：名称 + 用途说明 + 参数文档（注入系统提示词）+ 执行函数 */
export interface Skill {
  name: string;
  description: string;
  argsDoc: string;
  run(args: Record<string, unknown>, ctx: SkillContext): Promise<SkillResult>;
}

/** Agent 推送给前端的事件（SSE data 载荷） */
export type AgentEvent =
  | { type: 'skill_start'; skill: string; label: string }
  | { type: 'skill_end'; skill: string; label: string; summary: string }
  | { type: 'content'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };
