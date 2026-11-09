'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { EChartsOption } from 'echarts';
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
  Calculator,
  CalendarDays,
  Factory,
  TrendingUp,
  Check,
  Package,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EChart } from '@/components/echart';
import type { ProductWithScore } from '@/lib/types';
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
  getGoogleTrends: TrendingUp,
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

type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'product'; id: string }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'cards'; items: RecommendItem[] }
  | { kind: 'pending'; label: string };

function asFiniteNumbers(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
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
  if (Array.isArray(r.x)) spec.x = r.x.map((v) => String(v));
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

/** 文本段按 [PRODUCT:id] 拆分为文本块与商品块 */
function pushTextBlocks(blocks: ContentBlock[], text: string): void {
  for (const part of text.split(/(\[PRODUCT:[^\]]+\])/g)) {
    const pm = part.match(/^\[PRODUCT:([^\]]+)\]$/);
    if (pm) blocks.push({ kind: 'product', id: pm[1] });
    else if (part) blocks.push({ kind: 'text', text: part });
  }
}

const BLOCK_RE = /<(chart|cards)>([\s\S]*?)(<\/\1>|$)/g;

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
          label: tag === 'cards' ? '正在生成推荐卡片…' : '正在生成图表…',
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
        if (spec) blocks.push({ kind: 'chart', spec });
      } else {
        const items = parseRecommendItems(raw);
        if (items.length) blocks.push({ kind: 'cards', items });
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

/** 将消息内容解析为有序块渲染：文本 / 内联商品 / 图表 / 推荐卡片 / 流式占位 */
function MessageContent({
  content,
  products,
  streaming,
}: {
  content: string;
  products: ProductWithScore[];
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parseBlocks(content, streaming), [content, streaming]);
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
                <p className="text-sm font-semibold text-zinc-900">老K · 选品总监</p>
                <p className="text-[11px] text-zinc-400">Agent · 趋势 × 数据 × 利润测算</p>
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
                  老K · 顶级选品总监
                </p>
                <p className="mb-6 max-w-[280px] text-center text-xs leading-relaxed text-zinc-400">
                  15 年跨境操盘手：懂数据、懂美国文化、懂 ROI
                  和毛利。联网趋势 × 商品库 × 利润测算，直接给我你的选品问题
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
