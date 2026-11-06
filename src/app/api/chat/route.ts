// AI 选品 Agent 接口：ReAct 多跳推理 + Skill 工具调用，SSE 流式返回
// 事件协议：skill_start / skill_end / content / done / error
import { NextRequest } from 'next/server';
import { runAgent } from '@/lib/agent/runner';
import type { AgentEvent } from '@/lib/agent/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const history = body.messages;

    if (!history || !Array.isArray(history) || history.length === 0) {
      return Response.json({ error: '消息不能为空' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: AgentEvent): void => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };
        try {
          await runAgent({ headers: request.headers, history, emit });
          emit({ type: 'done' });
        } catch (error) {
          console.error('Agent run error:', error);
          emit({ type: 'error', error: 'AI 服务暂时不可用，请稍后重试' });
          emit({ type: 'done' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: '请求处理失败' }, { status: 500 });
  }
}
