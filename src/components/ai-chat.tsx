'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { EChartsOption } from 'echarts';
import {
  Bot,
  Send,
  Sparkles,
  Loader2,
  RotateCcw,
  Database,
  PackageSearch,
  PieChart,
  BarChart3,
  GitCompareArrows,
  Globe,
  Calculator,
  CalendarDays,
  Factory,
  TrendingUp,
  Check,
  Package,
  Search,
  ArrowUpRight,
  Square,
  ShoppingBag,
  History,
  Trash2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EChart } from '@/components/echart';
import type { ProductWithScore } from '@/lib/types';
import {
  type Conversation,
  type StoredMessage,
  createConversation,
  deleteConversation,
  loadConversations,
  relativeTime,
  upsertConversation,
} from '@/lib/chat-history';
import { build1688SearchUrl } from '@/lib/url1688';

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
  /** 用户主动停止生成（保留部分内容） */
  stopped?: boolean;
  steps?: SkillStep[];
}

const QUICK_PROMPTS = [
  '联网看看 TikTok 最近什么在爆，给我 3 个选品方向',
  'Google 上搜索量在涨的方向有哪些？帮我筛 3 个品',
  '接下来有什么美国营销节点？该提前备什么品？',
  '圣诞季有什么低成本高毛利的品？给出定价和 1688 找货',
  '从趋势里找 3 个轻小件方向，测算利润和盈亏平衡广告成本',
];

/** Skill 名称 → 图标 */
const SKILL_ICONS: Record<string, typeof Database> = {
  queryProducts: Database,
  getProductDetail: PackageSearch,
  getCategoryInsights: PieChart,
  getMarketOverview: BarChart3,
  compareProducts: GitCompareArrows,
  getHotTrends: Globe,
  calcUnitEconomics: Calculator,
  getSeasonalCalendar: CalendarDays,
  searchSourcing: Factory,
  getSourcingDetail: PackageSearch,
  searchSourcingByImage: Search,
  getGoogleTrends: TrendingUp,
  getTikTokRankings: BarChart3,
  getTikTokProductDetail: PackageSearch,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 行内格式：加粗 + 行内代码 + 链接可点击（Markdown [文本](url) 与裸 URL 两种形态，单趟扫描避免二次匹配 href） */
function formatInline(line: string): string {
  return line
    .replace(/`([^`]+)`/g, '<code style="background:#f4f4f5;border-radius:4px;padding:0 4px;font-size:11px;color:#27272a">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]*)\]\((https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'+,;=%]+)\)|(https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'+,;=%]+)/g,
      (_m, text: string, mdUrl: string | undefined, bareUrl: string | undefined) => {
        const url = mdUrl ?? bareUrl ?? '';
        const label = text || url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="break-all text-[#00B8B0] underline underline-offset-2 hover:text-[#009b94]">${label}</a>`;
      },
    );
}

const SOURCE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px;flex-shrink:0"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>';

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-');
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

type ColAlign = 'left' | 'center' | 'right';

/** 把连续 Markdown 表格行渲染为 HTML 表格，返回 html 与消耗到的下一行下标；非表格返回 null */
function buildTable(lines: string[], start: number): { html: string; next: number } | null {
  if (start + 1 >= lines.length) return null;
  if (!isTableLine(lines[start]) || !isTableSeparator(lines[start + 1])) return null;

  const headers = parseTableRow(lines[start]);
  const aligns: ColAlign[] = parseTableRow(lines[start + 1]).map((seg) => {
    const left = seg.startsWith(':');
    const right = seg.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  let i = start + 2;
  const rows: string[][] = [];
  while (i < lines.length && isTableLine(lines[i]) && !isTableSeparator(lines[i])) {
    rows.push(parseTableRow(lines[i]));
    i++;
  }
  if (rows.length === 0) return null;

  const alignOf = (idx: number): ColAlign => aligns[idx] ?? 'left';
  const th = headers
    .map(
      (h, c) =>
        `<th style="text-align:${alignOf(c)};padding:6px 8px;border-bottom:1px solid #e4e4e7;color:#71717a;font-weight:600;white-space:nowrap">${formatInline(h)}</th>`,
    )
    .join('');
  const trs = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, c) =>
              `<td style="text-align:${alignOf(c)};padding:6px 8px;border-bottom:1px solid #f4f4f5;color:${c === 0 ? '#18181b;font-weight:500' : '#3f3f46'}">${formatInline(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return {
    html: `<div style="overflow-x:auto;margin:8px 0;border:1px solid #f0f0f2;border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:11px;line-height:1.5"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`,
    next: i,
  };
}

const HEADING_STYLES: Record<number, string> = {
  1: 'font-size:15px;font-weight:700;color:#18181b;margin:12px 0 4px',
  2: 'font-size:14px;font-weight:600;color:#18181b;margin:10px 0 4px',
  3: 'font-size:13px;font-weight:600;color:#27272a;margin:8px 0 3px',
  4: 'font-size:12.5px;font-weight:600;color:#3f3f46;margin:6px 0 2px',
};

/** # 标题 / --- 分割线 / 列表项 / 空行 的块级渲染，返回 null 表示普通文本行 */
function renderBlockLine(line: string): string | null {
  const heading = line.match(/^(#{1,4})\s+(.*)$/);
  if (heading) {
    return `<div style="${HEADING_STYLES[heading[1].length]}">${formatInline(heading[2])}</div>`;
  }
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return '<div style="border-top:1px solid #f0f0f2;margin:8px 0"></div>';
  }
  const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
  if (bullet) {
    const indent = Math.floor(bullet[1].length / 2) * 14;
    return `<div style="display:flex;gap:6px;padding-left:${indent}px;margin:1.5px 0"><span style="color:#00b8b0;flex-shrink:0">•</span><span style="flex:1;min-width:0">${formatInline(bullet[2])}</span></div>`;
  }
  const ordered = line.match(/^(\s*)(\d+)[.、)]\s*(.*)$/);
  if (ordered) {
    const indent = Math.floor(ordered[1].length / 2) * 14;
    return `<div style="display:flex;gap:6px;padding-left:${indent}px;margin:1.5px 0"><span style="color:#a1a1aa;flex-shrink:0;min-width:16px;text-align:right">${ordered[2]}.</span><span style="flex:1;min-width:0">${formatInline(ordered[3])}</span></div>`;
  }
  if (!line.trim()) {
    return '<div style="height:4px"></div>';
  }
  return null;
}

function formatContent(text: string): string {
  const stripped = text
    // 安全网：剥除可能泄漏的工具协议标记
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
    .replace(/<tool_result[\s\S]*?(<\/tool_result>|$)/g, '');
  const lines = escapeHtml(stripped).split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // ``` 围栏代码块 → 等宽预格式化块
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合 ```
      out.push(
        `<pre style="margin:6px 0;max-height:220px;overflow:auto;border-radius:8px;background:#f8f8fa;border:1px solid #f0f0f2;padding:8px 10px;font-size:10.5px;line-height:1.55;color:#52525b;white-space:pre-wrap;word-break:break-all">${buf.join('\n')}</pre>`,
      );
      continue;
    }
    // Markdown 表格 → HTML 表格（对比数据可读性）
    if (isTableLine(line)) {
      const table = buildTable(lines, i);
      if (table) {
        out.push(table.html);
        i = table.next;
        continue;
      }
    }
    // 「> 」开头的行渲染为数据来源脚注卡片
    if (/^&gt;\s?/.test(line)) {
      const body = formatInline(line.replace(/^&gt;\s?/, ''));
      out.push(
        `<div style="margin-top:6px;display:flex;align-items:flex-start;gap:6px;border-radius:8px;border:1px solid #f4f4f5;background:#fafafa;padding:6px 10px;font-size:10.5px;line-height:1.6;color:#a1a1aa">${SOURCE_ICON_SVG}<span>${body}</span></div>`,
      );
      i++;
      continue;
    }
    // 标题 / 分割线 / 列表 / 空行的块级渲染
    const block = renderBlockLine(line);
    if (block !== null) {
      out.push(block);
      i++;
      continue;
    }
    out.push(formatInline(line) + (i === lines.length - 1 ? '' : '<br/>'));
    i++;
  }
  return out.join('');
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

// ---------------------------------------------------------------------------
// 可视化协议：<chart>{...}</chart> 图表、<cards>[...]</cards> 选品推荐卡片
// ---------------------------------------------------------------------------

interface ChartSeries {
  name: string;
  data: number[];
}

interface ChartSpec {
  type: 'line' | 'bar' | 'radar' | 'pie';
  title?: string;
  source?: string;
  x?: string[];
  indicators?: { name: string; max?: number }[];
  data?: { name: string; value: number }[];
  series?: ChartSeries[];
}

interface RecommendItem {
  id?: string; // 旧协议：库内商品 ID（选品库已不作为选品依据，保留渲染兼容）
  name?: string; // 方向卡：具体产品方向名
  tag?: string; // 主推/次推/备选/观察/劝退
  grade?: string; // 证据可信度 A/B/C
  reason?: string; // 差异化推荐理由
  price?: string; // 建议定价带，如 $15.99-19.99
  cost?: string; // 1688 参考成本
  keyword?: string; // 1688 找货搜索词
}

/** 真实在售商品（<products> 协议，来自 EchoTik 榜单/详情工具，字段为事实数据） */
interface TikTokProduct {
  name: string; // 商品名（英文原文）
  productId?: string; // TikTok Shop 商品 ID
  image?: string; // 商品封面图
  price?: string; // 在售均价，如 $24.18
  sales?: number; // 榜单周期销量
  gmv?: string; // 周期 GMV，如 $540,589
  commission?: string; // 佣金率，如 10%
  influencers?: number; // 带货达人数
  note?: string; // 老K 一句话解读
}

type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'products'; items: TikTokProduct[] }
  | { kind: 'product'; id: string }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'cards'; items: RecommendItem[] }
  | { kind: 'pending'; label: string };

function asFiniteNumbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((n): number | null => {
      if (typeof n === 'number' && Number.isFinite(n)) return n;
      // 容错：模型偶发把数字输出成字符串（"63"）
      if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) return Number(n);
      return null;
    })
    .filter((n): n is number => n !== null);
}

/** 宽松校验图表 JSON，字段不合法时返回 null（前端静默降级，不渲染坏图） */
function parseChartSpec(raw: unknown): ChartSpec | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (type !== 'line' && type !== 'bar' && type !== 'radar' && type !== 'pie') return null;

  const spec: ChartSpec = { type };
  if (typeof r.title === 'string') spec.title = r.title;
  if (typeof r.source === 'string') spec.source = r.source;
  // x 轴标签容错：模型偶发用 xAxis / categories / labels 别名
  const xRaw = r.x ?? r.xAxis ?? r.categories ?? r.labels;
  if (Array.isArray(xRaw)) spec.x = xRaw.map((v) => String(v));
  if (Array.isArray(r.series)) {
    spec.series = r.series
      .map((s): ChartSeries | null => {
        if (typeof s !== 'object' || s === null) return null;
        const sr = s as Record<string, unknown>;
        const data = asFiniteNumbers(sr.data);
        if (data.length === 0) return null;
        return { name: typeof sr.name === 'string' ? sr.name : '', data };
      })
      .filter((s): s is ChartSeries => s !== null);
  }
  if (Array.isArray(r.indicators)) {
    spec.indicators = r.indicators
      .map((it) => {
        if (typeof it !== 'object' || it === null) return null;
        const ir = it as Record<string, unknown>;
        if (typeof ir.name !== 'string' || !ir.name) return null;
        return {
          name: ir.name,
          max: typeof ir.max === 'number' && Number.isFinite(ir.max) ? ir.max : 100,
        };
      })
      .filter((it): it is { name: string; max: number } => it !== null);
  }
  if (Array.isArray(r.data)) {
    spec.data = r.data
      .map((it) => {
        if (typeof it !== 'object' || it === null) return null;
        const ir = it as Record<string, unknown>;
        if (typeof ir.name !== 'string' || typeof ir.value !== 'number') return null;
        return { name: ir.name, value: ir.value };
      })
      .filter((it): it is { name: string; value: number } => it !== null);
  }

  // line/bar 缺 x 标签时按 series 数据长度补序号标签，宁可标签简陋也不丢图
  if ((type === 'line' || type === 'bar') && spec.series?.length && !spec.x?.length) {
    const len = Math.max(...spec.series.map((s) => s.data.length));
    if (len > 0) spec.x = Array.from({ length: len }, (_, i) => `${i + 1}`);
  }

  if ((type === 'line' || type === 'bar') && (!spec.x?.length || !spec.series?.length)) return null;
  if (type === 'radar' && (!spec.indicators?.length || !spec.series?.length)) return null;
  if (type === 'pie' && !spec.data?.length) return null;
  return spec;
}

function parseRecommendItems(raw: unknown): RecommendItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): RecommendItem | null => {
      if (typeof it !== 'object' || it === null) return null;
      const r = it as Record<string, unknown>;
      const item: RecommendItem = {};
      if (typeof r.id === 'string' && r.id) item.id = r.id;
      if (typeof r.name === 'string' && r.name.trim()) item.name = r.name;
      if (!item.id && !item.name) return null;
      if (typeof r.tag === 'string') item.tag = r.tag;
      if (typeof r.grade === 'string' && /^[ABC]$/i.test(r.grade)) item.grade = r.grade.toUpperCase();
      if (typeof r.reason === 'string') item.reason = r.reason;
      if (typeof r.price === 'string') item.price = r.price;
      if (typeof r.cost === 'string') item.cost = r.cost;
      if (typeof r.keyword === 'string') item.keyword = r.keyword;
      return item;
    })
    .filter((it): it is RecommendItem => it !== null)
    .slice(0, 5);
}

/** 宽松解析 <products> 真实商品数组：字段缺失容错，name 必填 */
function parseTikTokProducts(raw: unknown): TikTokProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): TikTokProduct | null => {
      if (typeof it !== 'object' || it === null) return null;
      const r = it as Record<string, unknown>;
      if (typeof r.name !== 'string' || !r.name.trim()) return null;
      const p: TikTokProduct = { name: r.name.trim() };
      if (typeof r.productId === 'string' && r.productId) p.productId = r.productId;
      if (typeof r.image === 'string' && /^https?:\/\//.test(r.image)) p.image = r.image;
      if (typeof r.price === 'string') p.price = r.price;
      if (typeof r.sales === 'number' && Number.isFinite(r.sales)) p.sales = r.sales;
      else if (typeof r.sales === 'string' && Number.isFinite(Number(r.sales))) p.sales = Number(r.sales);
      if (typeof r.gmv === 'string') p.gmv = r.gmv;
      if (typeof r.commission === 'string') p.commission = r.commission;
      if (typeof r.influencers === 'number' && Number.isFinite(r.influencers)) p.influencers = r.influencers;
      else if (typeof r.influencers === 'string' && Number.isFinite(Number(r.influencers))) p.influencers = Number(r.influencers);
      if (typeof r.note === 'string') p.note = r.note;
      return p;
    })
    .filter((p): p is TikTokProduct => p !== null)
    .slice(0, 6);
}

/** 文本段按 [PRODUCT:id] 拆分为文本块与商品块 */
function pushTextBlocks(blocks: ContentBlock[], text: string): void {
  for (const part of text.split(/(\[PRODUCT:[^\]]+\])/g)) {
    const pm = part.match(/^\[PRODUCT:([^\]]+)\]$/);
    if (pm) blocks.push({ kind: 'product', id: pm[1] });
    else if (part) blocks.push({ kind: 'text', text: part });
  }
}

const BLOCK_RE = /<(chart|cards|products)>([\s\S]*?)(<\/\1>|$)/g;

/** 把消息内容解析为有序块：文本 / 内联商品 / 图表 / 推荐卡片 / 流式占位 */
function parseBlocks(content: string, streaming?: boolean): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let last = 0;
  for (const m of content.matchAll(BLOCK_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) pushTextBlocks(blocks, content.slice(last, idx));
    const closed = m[3] !== '';
    const tag = m[1];
    if (!closed) {
      // 流式途中未闭合的图表/卡片标签 → 占位提示；非流式直接丢弃残缺标签
      if (streaming) {
        blocks.push({
          kind: 'pending',
          label: tag === 'cards' ? '正在生成推荐卡片…' : tag === 'products' ? '正在整理在售商品…' : '正在生成图表…',
        });
      }
    } else {
      let raw: unknown = null;
      try {
        raw = JSON.parse(m[2]);
      } catch {
        raw = null;
      }
      if (tag === 'chart') {
        const spec = parseChartSpec(raw);
        if (spec) {
          blocks.push({ kind: 'chart', spec });
        } else {
          // 解析失败不静默丢弃：回显原始 JSON，提示数据异常
          blocks.push({
            kind: 'text',
            text: `> 图表数据格式异常，以下为模型原始输出：\n\n\`\`\`json\n${m[2].slice(0, 600)}\n\`\`\``,
          });
        }
      } else if (tag === 'products') {
        const items = parseTikTokProducts(raw);
        if (items.length) {
          blocks.push({ kind: 'products', items });
        } else {
          blocks.push({
            kind: 'text',
            text: `> 在售商品数据格式异常，以下为模型原始输出：\n\n\`\`\`json\n${m[2].slice(0, 600)}\n\`\`\``,
          });
        }
      } else {
        const items = parseRecommendItems(raw);
        if (items.length) {
          blocks.push({ kind: 'cards', items });
        } else {
          blocks.push({
            kind: 'text',
            text: `> 推荐卡片数据格式异常，以下为模型原始输出：\n\n\`\`\`json\n${m[2].slice(0, 600)}\n\`\`\``,
          });
        }
      }
    }
    last = idx + m[0].length;
  }
  if (last < content.length) pushTextBlocks(blocks, content.slice(last));
  return blocks.filter((b) => b.kind !== 'text' || b.text.trim());
}

/** 按需补拉商品详情：引用可能超出首屏加载的 TOP 列表 */
function useExtraProducts(base: ProductWithScore[], ids: string[]): ProductWithScore[] {
  const [extra, setExtra] = useState<ProductWithScore[]>([]);
  const knownIds = useMemo(() => {
    const set = new Set(base.map((p) => p.id));
    for (const p of extra) set.add(p.id);
    return set;
  }, [base, extra]);
  const missingKey = ids
    .filter((id) => !knownIds.has(id))
    .sort()
    .join(',');

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    void Promise.all(
      missingKey.split(',').map((id) =>
        fetch(`/api/products/${encodeURIComponent(id)}`)
          .then((r) => (r.ok ? (r.json() as Promise<ProductWithScore>) : null))
          .catch(() => null),
      ),
    ).then((list) => {
      if (cancelled) return;
      const ok = list.filter((p): p is ProductWithScore => Boolean(p && p.id));
      if (ok.length) setExtra((prev) => [...prev, ...ok]);
    });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  return useMemo(() => [...base, ...extra], [base, extra]);
}

/** 图表配色（与 DESIGN.md 图表色板一致） */
const CHART_PALETTE = ['#00B8B0', '#FE2C55', '#6366F1', '#F59E0B', '#8B5CF6', '#94A3B8'];

function buildChartOption(spec: ChartSpec): EChartsOption {
  const base: EChartsOption = {
    color: CHART_PALETTE,
    animationDuration: 400,
  };
  if (spec.type === 'pie') {
    return {
      ...base,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '54%'],
          label: { fontSize: 10, color: '#71717a' },
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          data: spec.data ?? [],
        },
      ],
    };
  }
  if (spec.type === 'radar') {
    const series = spec.series ?? [];
    return {
      ...base,
      tooltip: { trigger: 'item' },
      legend:
        series.length > 1
          ? { bottom: 0, icon: 'circle', itemWidth: 8, textStyle: { fontSize: 10, color: '#71717a' } }
          : undefined,
      radar: {
        indicator: (spec.indicators ?? []).map((it) => ({ name: it.name, max: it.max ?? 100 })),
        radius: '60%',
        center: ['50%', series.length > 1 ? '46%' : '52%'],
        axisName: { fontSize: 10, color: '#71717a' },
        splitArea: { areaStyle: { color: ['#fff', '#fafafa'] } },
        splitLine: { lineStyle: { color: '#f0f0f2' } },
      },
      series: [
        {
          type: 'radar',
          symbolSize: 4,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.08 },
          data: series.map((s) => ({ name: s.name, value: s.data })),
        },
      ],
    };
  }
  // line / bar
  const series = spec.series ?? [];
  return {
    ...base,
    tooltip: { trigger: 'axis' },
    legend:
      series.length > 1
        ? { top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { fontSize: 10, color: '#71717a' } }
        : undefined,
    grid: { left: 4, right: 8, top: series.length > 1 ? 26 : 14, bottom: 2, containLabel: true },
    xAxis: {
      type: 'category',
      data: spec.x ?? [],
      axisLabel: { fontSize: 9, color: '#a1a1aa' },
      axisLine: { lineStyle: { color: '#e4e4e7' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, color: '#a1a1aa' },
      splitLine: { lineStyle: { color: '#f4f4f5' } },
    },
    series: series.map((s) =>
      spec.type === 'bar'
        ? {
            name: s.name,
            type: 'bar' as const,
            data: s.data,
            barMaxWidth: 16,
            itemStyle: { borderRadius: [3, 3, 0, 0] as [number, number, number, number] },
          }
        : {
            name: s.name,
            type: 'line' as const,
            data: s.data,
            smooth: true,
            symbolSize: 5,
            lineStyle: { width: 2 },
          },
    ),
  };
}

/** <chart> 协议渲染：图表卡片（标题 + 图 + 数据来源行） */
function ChatChart({ spec }: { spec: ChartSpec }) {
  const option = useMemo(() => buildChartOption(spec), [spec]);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      {spec.title && (
        <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-zinc-800">
          <BarChart3 className="h-3.5 w-3.5 text-[#00b8b0]" />
          {spec.title}
        </p>
      )}
      <EChart option={option} height={170} />
      {spec.source && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
          <Database className="h-3 w-3 shrink-0" />
          数据来源：{spec.source}
        </p>
      )}
    </div>
  );
}

/** <products> 协议渲染：真实在售商品墙（冷启动核心——看得见摸得着的在卖商品） */
function TikTokProductCards({ items }: { items: TikTokProduct[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-zinc-800">
        <ShoppingBag className="h-3.5 w-3.5 text-[#fe2c55]" />
        美区真实在售商品 · EchoTik 榜单
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p, i) => (
          <div
            key={p.productId || i}
            className="group overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/50 transition-colors hover:border-[#00b8b0]/40"
          >
            <div className="relative aspect-square bg-zinc-100">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-300">
                  <ShoppingBag className="h-8 w-8" />
                </div>
              )}
              {p.commission && (
                <span className="absolute right-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  佣金 {p.commission}
                </span>
              )}
            </div>
            <div className="p-2">
              <p className="line-clamp-2 min-h-[32px] text-[11px] font-medium leading-4 text-zinc-800">
                {p.name}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-bold text-[#fe2c55]">{p.price || '-'}</span>
                {p.sales !== undefined && (
                  <span className="text-[10px] text-zinc-500">
                    周期销量 <span className="font-semibold text-zinc-700">{p.sales.toLocaleString()}</span>
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-zinc-400">
                {p.gmv && <span>GMV {p.gmv}</span>}
                {p.influencers !== undefined && <span>{p.influencers.toLocaleString()} 达人带货</span>}
              </div>
              {p.note && (
                <p className="mt-1.5 rounded bg-[#00b8b0]/8 px-1.5 py-1 text-[10px] leading-4 text-[#00b8b0]">
                  {p.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">销量/GMV 为榜单统计周期内增量（EchoTik 收录数据，存在延迟）</p>
    </div>
  );
}

const TAG_STYLES: Record<string, string> = {
  主推: 'bg-[#fe2c55] text-white',
  次推: 'bg-[#00b8b0] text-white',
  备选: 'bg-[#00b8b0]/10 text-[#00b8b0]',
  观察: 'bg-amber-500/10 text-amber-600',
  劝退: 'bg-zinc-400/10 text-zinc-500',
};

/** 证据可信度徽章样式：A=双平台印证+真实货源（青实底）/ B=单平台或假设成本（琥珀）/ C=降级数据或纯推断（灰） */
const GRADE_STYLES: Record<string, { cls: string; tip: string }> = {
  A: { cls: 'bg-[#00b8b0] text-white', tip: 'A级证据：双平台印证+真实货源+测算过线' },
  B: { cls: 'bg-amber-500/10 text-amber-600', tip: 'B级证据：单平台强信号或假设成本' },
  C: { cls: 'bg-zinc-400/10 text-zinc-500', tip: 'C级证据：降级数据或纯推断，下注前需补数据' },
};

/** <cards> 协议渲染：选品方向卡片清单（外部趋势驱动，不依赖选品库） */
function RecommendCards({
  items,
  lookup,
}: {
  items: RecommendItem[];
  lookup: (id: string) => ProductWithScore | undefined;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        // 旧协议：携带库内商品 ID 时走详情卡渲染（选品库已不作为选品依据）
        if (it.id) {
          const p = lookup(it.id);
          if (!p) {
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[11px] text-zinc-400"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {it.id} 商品信息加载中…
              </div>
            );
          }
          const scoreColor =
            p.score.total >= 85
              ? 'text-[#fe2c55]'
              : p.score.total >= 70
                ? 'text-[#00b8b0]'
                : p.score.total >= 55
                  ? 'text-amber-600'
                  : 'text-zinc-500';
          return (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  <Image src={p.image} alt={p.name} fill className="object-cover" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-zinc-900">{p.name}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {it.tag && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLES[it.tag] ?? 'bg-zinc-100 text-zinc-500'}`}
                        >
                          {it.tag}
                        </span>
                      )}
                      <span className={`text-sm font-bold ${scoreColor}`}>{p.score.total}分</span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                    <span>{p.category}</span>
                    <span className="font-medium text-zinc-700">${p.price}</span>
                    <span>利润率 {Math.round(p.score.profitMargin * 100)}%</span>
                    <span
                      className={`font-medium ${p.score.growthRate >= 0 ? 'text-[#fe2c55]' : 'text-zinc-400'}`}
                    >
                      7日{p.score.growthRate >= 0 ? '+' : ''}
                      {(p.score.growthRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              {it.reason && (
                <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] leading-relaxed text-zinc-500">
                  <span className="mr-1 text-[#fe2c55]">✦</span>
                  {it.reason}
                </p>
              )}
            </div>
          );
        }
        // 方向卡：外部趋势驱动的选品方向
        return <DirectionCard key={i} item={it} />;
      })}
    </div>
  );
}

/** 选品方向卡：产品方向 + 定价带 + 参考成本 + 依据 + 1688 找货直达 */
function DirectionCard({ item: it }: { item: RecommendItem }) {
  const sourcingUrl = it.keyword
    ? build1688SearchUrl(it.keyword)
    : undefined;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fe2c55]/10">
          <Package className="h-4 w-4 text-[#fe2c55]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-medium leading-snug text-zinc-900">{it.name}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {it.grade && GRADE_STYLES[it.grade] && (
                <span
                  title={GRADE_STYLES[it.grade].tip}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${GRADE_STYLES[it.grade].cls}`}
                >
                  {it.grade}级
                </span>
              )}
              {it.tag && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLES[it.tag] ?? 'bg-zinc-100 text-zinc-500'}`}
                >
                  {it.tag}
                </span>
              )}
            </div>
          </div>
          {(it.price || it.cost) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              {it.price && (
                <span>
                  建议定价 <span className="font-medium text-zinc-700">{it.price}</span>
                </span>
              )}
              {it.cost && (
                <span>
                  1688 参考成本 <span className="font-medium text-zinc-700">{it.cost}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {it.reason && (
        <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] leading-relaxed text-zinc-500">
          <span className="mr-1 text-[#fe2c55]">✦</span>
          {it.reason}
        </p>
      )}
      {sourcingUrl && (
        <a
          href={sourcingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#00b8b0]/10 px-2 py-1 text-[11px] font-medium text-[#00b8b0] transition-colors hover:bg-[#00b8b0]/20"
        >
          <Search className="h-3 w-3" />
          1688 找货：{it.keyword}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/** 渲染一组内容块（文本 / 内联商品 / 图表 / 推荐卡片 / 流式占位） */
function BlockList({
  blocks,
  lookup,
}: {
  blocks: ContentBlock[];
  lookup: (id: string) => ProductWithScore | undefined;
}) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'product': {
            const product = lookup(b.id);
            return product ? <InlineProductCard key={i} product={product} /> : null;
          }
          case 'chart':
            return <ChatChart key={i} spec={b.spec} />;
          case 'cards':
            return <RecommendCards key={i} items={b.items} lookup={lookup} />;
          case 'products':
            return <TikTokProductCards key={i} items={b.items} />;
          case 'pending':
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-200 px-2.5 py-2 text-[11px] text-zinc-400"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {b.label}
              </div>
            );
          default:
            return (
              <div
                key={i}
                className="text-[13px] leading-relaxed text-zinc-700 [&_strong]:font-semibold [&_strong]:text-zinc-900"
                dangerouslySetInnerHTML={{ __html: formatContent(b.text) }}
              />
            );
        }
      })}
    </div>
  );
}

/**
 * 助手消息主体：
 * - 简单回复（无卡片/图表/工具轨迹）→ 纯文本流式渲染
 * - 富内容回复 → Tab 化：「选品方案」（推荐卡 + 正文）/「图表」（全部图表集中）/「佐证过程」（工具调用轨迹）
 */
function AssistantMessageBody({
  msg,
  products,
}: {
  msg: ChatMessage;
  products: ProductWithScore[];
}) {
  const blocks = useMemo(() => parseBlocks(msg.content, msg.streaming), [msg.content, msg.streaming]);
  const wantedIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) {
      if (b.kind === 'product') set.add(b.id);
      else if (b.kind === 'cards') for (const it of b.items) if (it.id) set.add(it.id);
    }
    return [...set];
  }, [blocks]);
  const allProducts = useExtraProducts(products, wantedIds);
  const lookup = useMemo(() => {
    const map = new Map(allProducts.map((p) => [p.id, p]));
    return (id: string) => map.get(id);
  }, [allProducts]);

  const cardBlocks = blocks.filter((b) => b.kind === 'cards');
  const productBlocks = blocks.filter((b) => b.kind === 'products');
  const chartBlocks = blocks.filter((b) => b.kind === 'chart');
  const textBlocks = blocks.filter(
    (b) => b.kind === 'text' || b.kind === 'product' || b.kind === 'pending',
  );
  const steps = msg.steps ?? [];
  const rich = cardBlocks.length > 0 || productBlocks.length > 0 || chartBlocks.length > 0 || steps.length > 0;

  // 简单回复：纯文本
  if (!rich) {
    return (
      <div>
        {msg.content ? (
          <BlockList blocks={textBlocks} lookup={lookup} />
        ) : (
          msg.streaming && (
            <span className="flex items-center gap-1.5 text-[12px] text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              老K 正在思考...
            </span>
          )
        )}
        {msg.streaming && msg.content && (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#00b8b0]" />
        )}
        {msg.stopped && <StoppedMarker />}
      </div>
    );
  }

  return (
    <Tabs defaultValue="plan" className="w-full">
      <TabsList className="h-8 w-full justify-start rounded-lg bg-zinc-100 p-0.5">
        <TabsTrigger
          value="plan"
          className="h-7 rounded-md px-2.5 text-[11.5px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
        >
          <Sparkles className="mr-1 h-3 w-3" />
          选品方案
        </TabsTrigger>
        <TabsTrigger
          value="charts"
          className="h-7 rounded-md px-2.5 text-[11.5px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
        >
          <BarChart3 className="mr-1 h-3 w-3" />
          图表{chartBlocks.length > 0 && ` ${chartBlocks.length}`}
        </TabsTrigger>
        <TabsTrigger
          value="evidence"
          className="h-7 rounded-md px-2.5 text-[11.5px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
        >
          <Database className="mr-1 h-3 w-3" />
          佐证过程{steps.length > 0 && ` ${steps.length}`}
        </TabsTrigger>
      </TabsList>

      {/* 选品方案：真实在售商品墙置顶 → 推荐方向卡 → 详细分析正文 */}
      <TabsContent value="plan" className="mt-2.5 space-y-2.5">
        {productBlocks.length > 0 && <BlockList blocks={productBlocks} lookup={lookup} />}
        {cardBlocks.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
              <Package className="h-3 w-3 text-[#fe2c55]" />
              推荐方向（{cardBlocks.reduce((n, b) => n + (b.kind === 'cards' ? b.items.length : 0), 0)}）
            </p>
            <BlockList blocks={cardBlocks} lookup={lookup} />
          </div>
        )}
        {textBlocks.length > 0 && (
          <div>
            {(cardBlocks.length > 0 || productBlocks.length > 0) && (
              <p className="mb-1.5 border-t border-zinc-100 pt-2 text-[11px] font-semibold text-zinc-500">
                详细分析
              </p>
            )}
            <BlockList blocks={textBlocks} lookup={lookup} />
          </div>
        )}
        {msg.streaming && (
          <span className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {msg.content ? '' : '老K 正在思考...'}
            {msg.content && (
              <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#00b8b0]" />
            )}
          </span>
        )}
        {msg.stopped && <StoppedMarker />}
      </TabsContent>

      {/* 图表：集中展示全部图表 */}
      <TabsContent value="charts" className="mt-2.5">
        {chartBlocks.length > 0 ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {chartBlocks.map((b, i) =>
              b.kind === 'chart' ? <ChatChart key={i} spec={b.spec} /> : null,
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-[11.5px] text-zinc-400">
            {msg.streaming ? '图表生成中…' : '本次回答没有图表'}
          </p>
        )}
      </TabsContent>

      {/* 佐证过程：工具调用轨迹（数据出处） */}
      <TabsContent value="evidence" className="mt-2.5">
        {steps.length > 0 ? (
          <SkillSteps steps={steps} />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-[11.5px] text-zinc-400">
            {msg.streaming ? '等待工具调用…' : '本次回答未调用工具'}
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}

/** 停止生成标记 */
function StoppedMarker() {
  return (
    <p className="mt-2 flex items-center gap-1 border-t border-zinc-100 pt-1.5 text-[10.5px] text-zinc-400">
      <Square className="h-2.5 w-2.5 fill-current" />
      已停止生成，以上内容不完整
    </p>
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

export function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [products, setProducts] = useState<ProductWithScore[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 贴底跟随：用户上滚超过阈值后停止自动滚动，回到底部附近恢复 */
  const stickToBottomRef = useRef(true);
  /** 会话历史：当前激活会话 id（null = 新会话，首条消息落库时分配） */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeConvIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  /** 从存储载入会话后跳过一次自动保存（避免载入即改写 updatedAt） */
  const skipNextSaveRef = useRef(false);

  const syncConversations = useCallback((list: Conversation[]) => {
    conversationsRef.current = list;
    setConversations(list);
  }, []);

  // 挂载时加载商品数据（兼容旧协议 [PRODUCT:id] 与库内 ID 卡片渲染）
  useEffect(() => {
    fetch('/api/products?pageSize=50&sortBy=score&sortOrder=desc')
      .then((r) => r.json())
      .then((data) => setProducts(data.items || []))
      .catch(() => {});
  }, []);

  // 挂载时载入历史会话，自动恢复最近一个会话（继续上下文）
  useEffect(() => {
    const list = loadConversations();
    conversationsRef.current = list;
    setConversations(list);
    const latest = list[0];
    if (latest && latest.messages.length > 0) {
      skipNextSaveRef.current = true;
      activeConvIdRef.current = latest.id;
      setActiveConvId(latest.id);
      setMessages(latest.messages.map((m) => ({ ...m })));
      stickToBottomRef.current = true;
    }
  }, []);

  // 会话自动持久化：流式结束/停止/出错后落库（流式期间跳过）
  useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    let convId = activeConvIdRef.current;
    let newTitle: string | undefined;
    if (!convId) {
      const firstUser = messages.find((m) => m.role === 'user');
      const conv = createConversation(firstUser?.content ?? '新会话');
      convId = conv.id;
      newTitle = conv.title;
      activeConvIdRef.current = convId;
      setActiveConvId(convId);
    }
    const existing = conversationsRef.current.find((c) => c.id === convId);
    const stored: StoredMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      stopped: m.stopped,
      steps: m.steps?.map((s) => ({ ...s, status: 'done' as const })),
    }));
    const updated = upsertConversation({
      id: convId,
      title: existing?.title ?? newTitle ?? '新会话',
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messages: stored,
    });
    syncConversations(updated);
  }, [messages, isStreaming, syncConversations]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    // 距底部 120px 以内视为贴底，继续跟随流式输出；否则保留用户浏览位置
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      stickToBottomRef.current = true;

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
        if ((error as Error).name === 'AbortError') {
          // 用户主动停止：保留已生成的部分内容
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    streaming: false,
                    stopped: true,
                    steps: m.steps?.map((s) =>
                      s.status === 'running' ? { ...s, status: 'done' as const } : s,
                    ),
                  }
                : m,
            ),
          );
        } else {
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

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
    activeConvIdRef.current = null;
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setIsStreaming(false);
  };

  /** 切换到历史会话（续聊：历史消息会随下次提问一起作为上下文发送） */
  const switchConversation = (id: string) => {
    if (id === activeConvIdRef.current) {
      setHistoryOpen(false);
      return;
    }
    abortRef.current?.abort();
    setIsStreaming(false);
    const conv = conversationsRef.current.find((c) => c.id === id);
    if (!conv) return;
    skipNextSaveRef.current = true;
    activeConvIdRef.current = id;
    setActiveConvId(id);
    setMessages(conv.messages.map((m) => ({ ...m, streaming: false })));
    stickToBottomRef.current = true;
    setHistoryOpen(false);
  };

  const removeConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const list = deleteConversation(id);
    syncConversations(list);
    if (activeConvIdRef.current === id) {
      abortRef.current?.abort();
      activeConvIdRef.current = null;
      setActiveConvId(null);
      setMessages([]);
      setIsStreaming(false);
    }
  };

  return (
    <div className="relative flex h-full bg-[#fafbfc]">
      {/* 历史会话侧栏（移动端为覆盖式抽屉） */}
      <aside
        className={
          historyOpen
            ? 'absolute inset-y-0 left-0 z-20 flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white shadow-xl lg:static lg:shadow-none'
            : 'hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex'
        }
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-700">
            <History className="h-3.5 w-3.5 text-zinc-400" />
            历史会话
          </span>
          <button
            onClick={() => {
              resetChat();
              setHistoryOpen(false);
            }}
            className="flex items-center gap-1 rounded-md border border-[#00b8b0]/30 px-2 py-1 text-[11px] text-[#00a19a] transition-colors hover:bg-[#00b8b0]/5"
          >
            <Plus className="h-3 w-3" />
            新对话
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-zinc-400">
              暂无历史会话
              <br />
              对话会自动保存在本地
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => switchConversation(c.id)}
              className={`group w-full cursor-pointer rounded-lg px-2.5 py-2 transition-colors ${
                c.id === activeConvId
                  ? 'bg-[#00b8b0]/10'
                  : 'hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    c.id === activeConvId
                      ? 'font-medium text-[#00a19a]'
                      : 'text-zinc-700'
                  }`}
                >
                  {c.title}
                </span>
                <span
                  onClick={(e) => removeConversation(c.id, e)}
                  title="删除会话"
                  className="hidden shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-[#fe2c55] group-hover:block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                {relativeTime(c.updatedAt)} · {c.messages.length} 条
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* 聊天主列 */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* 页面头部 */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 lg:hidden"
              title="历史会话"
            >
              <History className="h-4.5 w-4.5" />
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00b8b0]/10">
              <Sparkles className="h-4.5 w-4.5 text-[#00b8b0]" />
            </span>
            <div>
              <h1 className="text-[15px] font-semibold text-zinc-900">AI 选品 · 老K</h1>
              <p className="text-[11px] text-zinc-400">
                顶级选品总监 Agent · 趋势 × 货源 × 利润测算
              </p>
            </div>
          </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetChat}
          disabled={messages.length === 0}
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          新对话
        </Button>
      </div>

      {/* 消息区域 */}
      <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00b8b0]/10">
                <Bot className="h-8 w-8 text-[#00b8b0]" />
              </span>
              <p className="mb-1.5 text-base font-semibold text-zinc-900">
                老K · 顶级选品总监
              </p>
              <p className="mb-8 max-w-[400px] text-center text-[13px] leading-relaxed text-zinc-400">
                15 年跨境操盘手：懂数据、懂美国文化、懂 ROI
                和毛利。联网趋势 × 实时货源 × 利润测算，直接给我你的选品问题
              </p>
              <div className="grid w-full max-w-[560px] gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-[13px] text-zinc-600 transition-colors hover:border-[#00b8b0]/30 hover:bg-[#00b8b0]/5 hover:text-zinc-900"
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
              className={`mb-5 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <span className="mr-2.5 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#00b8b0]/10">
                  <Bot className="h-3.5 w-3.5 text-[#00b8b0]" />
                </span>
              )}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'max-w-[75%] bg-[#00b8b0] text-white'
                    : 'max-w-[92%] flex-1 border border-zinc-200 bg-white'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-[13px] leading-relaxed">{msg.content}</p>
                ) : (
                  <AssistantMessageBody msg={msg} products={products} />
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="border-t border-zinc-200 bg-white px-5 py-3.5">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? '正在生成中，可先输入下一个问题…' : '描述你的选品需求…'
            }
            rows={1}
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[13px] text-zinc-900 placeholder-zinc-400 outline-none focus:border-[#00b8b0]/50 focus:ring-1 focus:ring-[#00b8b0]/20"
          />
          {isStreaming ? (
            <Button
              type="button"
              onClick={stopGenerating}
              title="停止生成"
              className="h-[42px] shrink-0 gap-1.5 rounded-xl bg-[#FE2C55] px-4 text-[13px] hover:bg-[#e6254d]"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              停止
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              title="发送"
              className="h-[42px] w-[42px] shrink-0 rounded-xl bg-[#00b8b0] hover:bg-[#00a3a0]"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
        <p className="mx-auto mt-1.5 w-full max-w-3xl text-[10px] text-zinc-300">
          Enter 发送 · Shift+Enter 换行 · 生成中可随时停止 · 会话自动保存在本地
        </p>
      </div>
      </div>
    </div>
  );
}
