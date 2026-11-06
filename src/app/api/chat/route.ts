// AI 对话选品接口：SSE 流式返回
// 将商品数据库注入系统提示词，LLM 基于真实数据做选品分析与推荐
import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { queryProducts } from '@/lib/store';
import { DIMENSION_META } from '@/lib/scoring';
import type { ProductWithScore } from '@/lib/types';

/** 构建注入系统提示词的紧凑商品数据 */
function buildProductContext(): string {
  const { items } = queryProducts({ pageSize: 50, sortBy: 'score', sortOrder: 'desc' });
  const compact = items.map((p: ProductWithScore) => ({
    id: p.id,
    名称: p.name,
    类目: p.category,
    售价: `$${p.price}`,
    成本: `$${p.cost}`,
    利润率: `${Math.round(p.score.profitMargin * 100)}%`,
    累计销量: p.sales,
    评分: p.rating,
    评论数: p.reviews,
    上架时间: p.listedAt,
    平台热度: p.heat,
    竞争度: p.competition,
    店铺: p.seller,
    综合评分: p.score.total,
    潜力爆款: p.score.isHot,
    近7天增幅: `${Math.round(p.score.growthRate * 100)}%`,
    维度得分: {
      热度: p.score.dimensions.heat,
      竞争环境: p.score.dimensions.competition,
      利润: p.score.dimensions.profit,
      销量: p.score.dimensions.sales,
      增长: p.score.dimensions.growth,
    },
  }));
  return JSON.stringify(compact);
}

function buildSystemPrompt(): string {
  const productData = buildProductContext();
  const dimDesc = DIMENSION_META.map(
    (d) => `${d.label}(权重${Math.round(d.weight * 100)}%)`,
  ).join('、');

  return `你是「选品参谋」—— TikTok Shop 跨境电商选品专家 AI 助手，服务于中国跨境卖家。

## 你的能力
- 基于当前商品数据库进行选品分析、对比、推荐
- 分析商品的利润空间、竞争环境、增长趋势、市场热度
- 给出具体的运营建议（定价、内容策略、达人合作等）

## 综合评分体系（0-100分）
${dimDesc}
≥85分标注为「潜力爆款」

## 当前商品数据库（JSON）
${productData}

## 回复规则（必须遵守）
1. 根据用户的自然语言需求，从数据库中筛选、对比、推荐商品
2. 推荐/提及具体商品时，在商品名称后立即加上 [PRODUCT:id] 标记，前端会自动渲染为可点击的商品卡片。例如：推荐「哑光丝绒唇釉三支套装」[PRODUCT:P0001]
3. 分析要有理有据，引用数据库中的真实数字（售价、利润率、评分、增幅等）
4. 回复结构清晰，适当使用标题和列表，语言专业但易懂
5. 如果用户问题与选品无关，礼貌引导回选品话题
6. 每次回复控制在合理长度，重点突出，不要冗长
7. 用中文回复`;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const userMessages = body.messages;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = buildSystemPrompt();
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const stream = client.stream(messages, {
            model: 'doubao-seed-2-0-pro-260215',
            temperature: 0.7,
          });

          for await (const chunk of stream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              const data = `data: ${JSON.stringify({ content: text })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('LLM stream error:', error);
          const errData = `data: ${JSON.stringify({ error: 'AI 服务暂时不可用，请稍后重试' })}\n\n`;
          controller.enqueue(encoder.encode(errData));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: '请求处理失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
