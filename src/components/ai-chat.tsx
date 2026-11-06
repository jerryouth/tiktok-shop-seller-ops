'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Bot,
  Send,
  X,
  Sparkles,
  Loader2,
  RotateCcw,
  Database,
  PackageSearch,
  PieChart,
  BarChart3,
  GitCompareArrows,
  Globe,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ProductWithScore } from '@/lib/types';

/** Agent 执行步骤（Skill 调用轨迹） */
interface SkillStep {
  skill: string;
  label: string;
  summary?: string;
  status: 'running' | 'done';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  steps?: SkillStep[];
}

const QUICK_PROMPTS = [
  '联网看看 TikTok 最近什么在爆，结合库里商品给建议',
  '帮我推荐利润率最高的3个商品',
  '美妆类目有什么值得做的？',
  '对比下评分最高的两款商品',
  '低竞争高利润的商品有哪些？',
];

/** Skill 名称 → 图标 */
const SKILL_ICONS: Record<string, typeof Database> = {
  queryProducts: Database,
  getProductDetail: PackageSearch,
  getCategoryInsights: PieChart,
  getMarketOverview: BarChart3,
  compareProducts: GitCompareArrows,
  getHotTrends: Globe,
};

function formatContent(text: string): string {
  return (
    text
      // 安全网：剥除可能泄漏的工具协议标记
      .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
      .replace(/<tool_result[\s\S]*?(<\/tool_result>|$)/g, '')
      .replace(/\n/g, '<br/>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  );
}

/** Agent 执行步骤可视化 */
function SkillSteps({ steps }: { steps: SkillStep[] }) {
  return (
    <div className="mb-2 space-y-1 rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-2">
      {steps.map((s, i) => {
        const Icon = SKILL_ICONS[s.skill] ?? Database;
        return (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            {s.status === 'running' ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#00b8b0]" />
            ) : (
              <Check className="h-3 w-3 shrink-0 text-[#00b8b0]" />
            )}
            <Icon className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="text-zinc-500">{s.label}</span>
            {s.summary && (
              <span className="truncate text-zinc-400">· {s.summary}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 将消息内容按 [PRODUCT:id] 标记拆分，商品部分渲染为卡片 */
function MessageContent({
  content,
  products,
  streaming,
}: {
  content: string;
  products: ProductWithScore[];
  streaming?: boolean;
}) {
  const parts = content.split(/(\[PRODUCT:[^\]]+\])/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const match = part.match(/\[PRODUCT:([^\]]+)\]/);
        if (match) {
          const product = products.find((p) => p.id === match[1]);
          if (product) return <InlineProductCard key={i} product={product} />;
          return null;
        }
        if (!part.trim()) return null;
        return (
          <div
            key={i}
            className="text-[13px] leading-relaxed text-zinc-700 [&_strong]:font-semibold [&_strong]:text-zinc-900"
            dangerouslySetInnerHTML={{ __html: formatContent(part) }}
          />
        );
      })}
      {streaming && (
        <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#00b8b0]" />
      )}
    </div>
  );
}

/** 消息内联商品卡片 */
function InlineProductCard({ product }: { product: ProductWithScore }) {
  const scoreColor =
    product.score.total >= 85
      ? 'text-[#fe2c55]'
      : product.score.total >= 70
        ? 'text-[#00b8b0]'
        : product.score.total >= 55
          ? 'text-amber-600'
          : 'text-zinc-500';

  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          sizes="56px"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-zinc-900">
            {product.name}
          </p>
          <span className={`shrink-0 text-sm font-bold ${scoreColor}`}>
            {product.score.total}分
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
          <span>{product.category}</span>
          <span className="font-medium text-zinc-700">${product.price}</span>
          <span>利润率 {Math.round(product.score.profitMargin * 100)}%</span>
          <span>
            7日增幅 {product.score.growthRate >= 0 ? '+' : ''}
            {Math.round(product.score.growthRate * 100)}%
          </span>
        </div>
        {product.score.isHot && (
          <Badge className="mt-1.5 border-0 bg-[#fe2c55]/10 text-[10px] text-[#fe2c55] hover:bg-[#fe2c55]/10">
            潜力爆款
          </Badge>
        )}
      </div>
    </div>
  );
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [products, setProducts] = useState<ProductWithScore[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 打开时加载商品数据（用于渲染商品卡片）
  useEffect(() => {
    if (open && products.length === 0) {
      fetch('/api/products?pageSize=50&sortBy=score&sortOrder=desc')
        .then((r) => r.json())
        .then((data) => setProducts(data.items || []))
        .catch(() => {});
    }
  }, [open, products.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        streaming: true,
      };

      const newMessages = [...messages, userMsg];
      setMessages([...newMessages, assistantMsg]);
      setInput('');
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatHistory = newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatHistory }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let accumulated = '';
        let steps: SkillStep[] = [];
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // 按行解析 SSE，跨 chunk 的不完整行先缓冲
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data) as {
                type?: 'skill_start' | 'skill_end' | 'content' | 'done' | 'error';
                skill?: string;
                label?: string;
                summary?: string;
                content?: string;
                error?: string;
              };

              if (parsed.type === 'content' && parsed.content) {
                accumulated += parsed.content;
              } else if (parsed.type === 'error') {
                accumulated = parsed.error ?? 'AI 服务暂时不可用，请稍后重试';
              } else if (parsed.type === 'skill_start') {
                steps = [
                  ...steps,
                  {
                    skill: parsed.skill ?? '',
                    label: parsed.label ?? '',
                    status: 'running',
                  },
                ];
              } else if (parsed.type === 'skill_end') {
                const idx = steps.findIndex(
                  (s) => s.status === 'running' && s.skill === parsed.skill,
                );
                if (idx >= 0) {
                  steps = steps.map((s, i) =>
                    i === idx
                      ? { ...s, status: 'done', summary: parsed.summary }
                      : s,
                  );
                }
              }
            } catch {
              // skip malformed lines
            }
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: accumulated, steps }
                : m,
            ),
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: accumulated, steps, streaming: false }
              : m,
          ),
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: '抱歉，AI 服务暂时不可用，请稍后重试。',
                    streaming: false,
                  }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setIsStreaming(false);
  };

  return (
    <>
      {/* 悬浮按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-2xl bg-[#00b8b0] text-white shadow-lg shadow-[#00b8b0]/25 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-[#00b8b0]/30 active:scale-95"
          aria-label="AI 选品助手"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* 聊天面板 */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-zinc-200 bg-[#fafbfc] shadow-2xl sm:w-[440px]">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00b8b0]/10">
                <Sparkles className="h-4 w-4 text-[#00b8b0]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">AI 选品助手</p>
                <p className="text-[11px] text-zinc-400">Agent · 联网趋势 × 商品库分析</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={resetChat}
                title="清空对话"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                title="关闭"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00b8b0]/10">
                  <Bot className="h-7 w-7 text-[#00b8b0]" />
                </span>
                <p className="mb-1.5 text-sm font-semibold text-zinc-900">
                  AI 选品助手
                </p>
                <p className="mb-6 max-w-[280px] text-center text-xs leading-relaxed text-zinc-400">
                  我能联网检索 TikTok 实时趋势，结合商品库做交叉分析，用自然语言描述你的选品需求即可
                </p>
                <div className="flex w-full max-w-[320px] flex-col gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left text-[13px] text-zinc-600 transition-colors hover:border-[#00b8b0]/30 hover:bg-[#00b8b0]/5 hover:text-zinc-900"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#00b8b0]/10">
                    <Bot className="h-3.5 w-3.5 text-[#00b8b0]" />
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-[#00b8b0] text-white'
                      : 'bg-white border border-zinc-200'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-[13px] leading-relaxed">{msg.content}</p>
                  ) : (
                    <>
                      {msg.steps && msg.steps.length > 0 && (
                        <SkillSteps steps={msg.steps} />
                      )}
                      {msg.content ? (
                        <MessageContent
                          content={msg.content}
                          products={products}
                          streaming={msg.streaming}
                        />
                      ) : (
                        msg.streaming &&
                        (!msg.steps || msg.steps.length === 0) && (
                          <span className="flex items-center gap-1.5 text-[12px] text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Agent 正在思考...
                          </span>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="border-t border-zinc-200 bg-white p-3">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你的选品需求..."
                rows={1}
                className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-900 placeholder-zinc-400 outline-none focus:border-[#00b8b0]/50 focus:ring-1 focus:ring-[#00b8b0]/20"
                disabled={isStreaming}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming}
                className="h-[38px] w-[38px] shrink-0 rounded-xl bg-[#00b8b0] hover:bg-[#00a3a0]"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
