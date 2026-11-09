'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  Aperture,
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  ShieldCheck,
  Download,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  ScanSearch,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SHOT_ROLE_META,
  TYPE_META,
  type CreativeBrief,
  type ImageElement,
  type ImageStructure,
  type RemixResult,
  type Shot,
} from '@/lib/image-types';
import type { PagedResult, ProductWithScore } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SelectedImage {
  /** 本地预览用（dataURL 或站内路径） */
  preview: string;
  /** 发给后端的引用（/products/xxx.png 或 /api/image/file/{id}） */
  serverRef: string;
  name: string;
}

/** 一批多角度衍生结果（基于某张场景图二次生成） */
interface AngleBatch {
  id: string;
  sceneName: string;
  results: RemixResult[];
}

const STEP_DEFS = [
  { n: 1, label: '选择主图' },
  { n: 2, label: 'AI 解析结构' },
  { n: 3, label: '广告策划与生成' },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export default function ImageStudioPage() {
  // ------- 图库与选择 -------
  const [products, setProducts] = useState<ProductWithScore[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------- 结构解析 -------
  const [structure, setStructure] = useState<ImageStructure | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // ------- 广告策划案 -------
  const [brief, setBrief] = useState<CreativeBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);

  // ------- 生成 -------
  const [extra, setExtra] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<RemixResult[]>([]);

  // ------- 多角度衍生 -------
  const [angleBatches, setAngleBatches] = useState<AngleBatch[]>([]);
  const [anglesFor, setAnglesFor] = useState<string | null>(null);

  // ------- 画布拖拽 -------
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products?pageSize=60&sortBy=sales&order=desc')
      .then((r) => r.json())
      .then((data: PagedResult<ProductWithScore>) => {
        if (!cancelled) setProducts(data.items ?? []);
      })
      .catch(() => toast.error('商品库加载失败'))
      .finally(() => {
        if (!cancelled) setLoadingLib(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickLibrary = useCallback((p: ProductWithScore) => {
    setSelected({ preview: p.image, serverRef: p.image, name: p.name });
    setStructure(null);
    setBrief(null);
    setResults([]);
    setAngleBatches([]);
    setActiveId(null);
  }, []);

  const onUploadFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch('/api/image/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? '上传失败');
      setSelected({ preview: dataUrl, serverRef: json.url, name: file.name });
      setStructure(null);
      setBrief(null);
      setResults([]);
      setAngleBatches([]);
      setActiveId(null);
      toast.success('图片已上传，可以开始解析');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  /** 广告制作 Agent：基于解析结构产出 Listing 视觉策划案 */
  const loadBrief = useCallback(async (s: ImageStructure) => {
    setLoadingBrief(true);
    try {
      const res = await fetch('/api/image/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure: s }),
      });
      const json = (await res.json()) as { brief?: CreativeBrief; error?: string };
      if (!res.ok || !json.brief) throw new Error(json.error ?? '策划案生成失败');
      setBrief(json.brief);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '策划案生成失败');
    } finally {
      setLoadingBrief(false);
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!selected || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/image/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: selected.serverRef }),
      });
      const json = (await res.json()) as { structure?: ImageStructure; error?: string };
      if (!res.ok || !json.structure) throw new Error(json.error ?? '解析失败');
      const s: ImageStructure = {
        ...json.structure,
        elements: json.structure.elements.map((e, i) => ({ ...e, id: `e${i + 1}` })),
      };
      setStructure(s);
      setBrief(null);
      setResults([]);
      setAngleBatches([]);
      setActiveId(s.elements.find((e) => e.type === 'product')?.id ?? s.elements[0]?.id ?? null);
      toast.success(`识别完成：拆解出 ${s.elements.length} 个结构元素`);
      void loadBrief(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [selected, analyzing, loadBrief]);

  // ------- 结构编辑 -------
  const patchElement = useCallback((id: string, patch: Partial<ImageElement>) => {
    setStructure((prev) =>
      prev
        ? { ...prev, elements: prev.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
        : prev,
    );
  }, []);

  const moveElement = useCallback((id: string, dir: -1 | 1) => {
    setStructure((prev) => {
      if (!prev) return prev;
      const idx = prev.elements.findIndex((e) => e.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.elements.length) return prev;
      const next = [...prev.elements];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, elements: next };
    });
  }, []);

  const removeElement = useCallback((id: string) => {
    setStructure((prev) =>
      prev ? { ...prev, elements: prev.elements.filter((e) => e.id !== id) } : prev,
    );
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  // ------- 策划案编辑 -------
  const patchBrief = useCallback((patch: Partial<Omit<CreativeBrief, 'shots'>>) => {
    setBrief((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const patchShot = useCallback((id: string, patch: Partial<Shot>) => {
    setBrief((prev) =>
      prev
        ? { ...prev, shots: prev.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
        : prev,
    );
  }, []);

  const removeShot = useCallback((id: string) => {
    setBrief((prev) =>
      prev ? { ...prev, shots: prev.shots.filter((s) => s.id !== id) } : prev,
    );
  }, []);

  const addShot = useCallback(() => {
    setBrief((prev) =>
      prev
        ? {
            ...prev,
            shots: [
              ...prev.shots,
              {
                id: crypto.randomUUID(),
                role: 'scene' as const,
                name: '自定义镜头',
                sellingPoint: '',
                emotion: '',
                scene: '',
                composition: '中景，产品占画面 1/2，位于视觉中心',
              },
            ],
          }
        : prev,
    );
  }, []);

  /** 一键打乱：除背景外的元素两两交换位置 */
  const shuffleLayout = useCallback(() => {
    setStructure((prev) => {
      if (!prev) return prev;
      const movableIdx = prev.elements
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type !== 'background')
        .map(({ i }) => i);
      if (movableIdx.length < 2) {
        toast.error('可移动元素不足，无法打乱');
        return prev;
      }
      const boxes = movableIdx.map((i) => prev.elements[i].bbox);
      for (let i = boxes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
      }
      const next = [...prev.elements];
      movableIdx.forEach((elIdx, k) => {
        next[elIdx] = { ...next[elIdx], bbox: boxes[k] };
      });
      return { ...prev, elements: next };
    });
  }, []);

  // ------- 画布拖拽 -------
  const beginDrag = (e: React.PointerEvent<HTMLDivElement>, el: ImageElement) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveId(el.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.bbox[0],
      origY: el.bbox[1],
    };
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    setStructure((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        elements: prev.elements.map((el) => {
          if (el.id !== d.id) return el;
          const nx = Math.min(Math.max(d.origX + dx, 0), 1 - el.bbox[2]);
          const ny = Math.min(Math.max(d.origY + dy, 0), 1 - el.bbox[3]);
          return { ...el, bbox: [nx, ny, el.bbox[2], el.bbox[3]] };
        }),
      };
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // ------- 生成与下载 -------
  const generate = useCallback(async () => {
    if (!selected || !structure || !brief || brief.shots.length === 0 || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/image/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: selected.serverRef, structure, brief, extra }),
      });
      const json = (await res.json()) as { images?: RemixResult[]; error?: string };
      if (!res.ok || !json.images) throw new Error(json.error ?? '生成失败');
      setResults(json.images);
      toast.success(`已生成 ${json.images.length} 张广告主图`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [selected, structure, brief, extra, generating]);

  const downloadImage = useCallback(async (url: string, variant: string, index: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `主图-${variant}-${index + 1}.png`;
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('下载失败，请右键图片另存为');
    }
  }, []);

  /** 对满意的镜头图做二次生成：同场景、不同机位/构图 */
  const generateAngles = useCallback(
    async (r: RemixResult) => {
      const shot = brief?.shots.find((s) => s.id === r.sceneId);
      if (!shot) {
        toast.error('该图的来源镜头已被删除，无法做多角度衍生');
        return;
      }
      if (!structure || anglesFor) return;
      setAnglesFor(r.url);
      try {
        const res = await fetch('/api/image/angles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: r.url,
            shot,
            productName: structure.productName,
            extra,
          }),
        });
        const json = (await res.json()) as { images?: RemixResult[]; error?: string };
        if (!res.ok || !json.images) throw new Error(json.error ?? '多角度生成失败');
        setAngleBatches((prev) => [
          { id: crypto.randomUUID(), sceneName: shot.name, results: json.images ?? [] },
          ...prev,
        ]);
        toast.success(`已生成「${shot.name}」的 ${json.images.length} 个视角`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '多角度生成失败');
      } finally {
        setAnglesFor(null);
      }
    },
    [brief, structure, extra, anglesFor],
  );

  const stepsDone = [Boolean(selected), Boolean(structure), results.length > 0];

  return (
    <div className="space-y-4">
      {/* 页面标题 + 步骤条 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">主图工作台</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            AI 拆解主图结构，广告制作 Agent 输出 Listing 拍摄策划案，边界受控地批量产出广告主图
          </p>
        </div>
        <div className="flex items-center gap-2">
          {STEP_DEFS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                  stepsDone[i]
                    ? 'bg-[#00b8b0] text-white'
                    : 'bg-zinc-200 text-zinc-500',
                )}
              >
                {stepsDone[i] ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span
                className={cn(
                  'text-xs',
                  stepsDone[i] ? 'font-medium text-zinc-900' : 'text-zinc-400',
                )}
              >
                {s.label}
              </span>
              {i < STEP_DEFS.length - 1 && <span className="mx-1 h-px w-5 bg-zinc-200" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* 左栏：图库选择 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-zinc-900">选择主图</h2>
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              上传
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadFile(f);
              }}
            />
          </div>
          <div className="grid max-h-[560px] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {loadingLib &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-lg bg-zinc-100" />
              ))}
            {!loadingLib &&
              products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickLibrary(p)}
                  title={p.name}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border transition-all duration-150',
                    selected?.serverRef === p.image
                      ? 'border-[#00b8b0] ring-2 ring-[#00b8b0]/40'
                      : 'border-zinc-200 hover:border-zinc-300',
                  )}
                >
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="110px"
                    className="object-cover"
                  />
                </button>
              ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
            从选品库挑一张主图，或上传自己的产品图（PNG/JPG/WebP，≤10MB）
          </p>
        </section>

        {/* 中栏：结构画布 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900">
              <Layers className="h-4 w-4 text-[#00b8b0]" />
              结构画布
            </h2>
            <div className="flex gap-2">
              {structure && (
                <Button size="sm" variant="outline" onClick={analyze} disabled={analyzing}>
                  <RefreshCw className={cn('h-3.5 w-3.5', analyzing && 'animate-spin')} />
                  重新解析
                </Button>
              )}
              <Button
                size="sm"
                onClick={analyze}
                disabled={!selected || analyzing}
                className="bg-[#00b8b0] text-white hover:bg-[#00a59e]"
              >
                {analyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5" />
                )}
                {analyzing ? '解析中…' : structure ? '再次解析' : 'AI 解析结构'}
              </Button>
            </div>
          </div>

          {!selected && (
            <div className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400">
              <ImagePlus className="mb-2 h-10 w-10" />
              <p className="text-sm">先从左侧选择或上传一张主图</p>
            </div>
          )}

          {selected && (
            <div
              ref={canvasRef}
              className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-zinc-50"
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.preview}
                alt={selected.name}
                draggable={false}
                className="block h-auto w-full"
              />
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[1px]">
                  <Loader2 className="h-8 w-8 animate-spin text-[#00b8b0]" />
                  <p className="text-sm text-zinc-600">AI 正在拆解主图结构…</p>
                </div>
              )}
              {structure?.elements.map((el) => {
                const meta = TYPE_META[el.type];
                const active = activeId === el.id;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => beginDrag(e, el)}
                    className={cn(
                      'absolute cursor-move rounded-[3px] border-2 transition-shadow',
                      active ? 'z-10 shadow-md' : 'opacity-90',
                    )}
                    style={{
                      left: `${el.bbox[0] * 100}%`,
                      top: `${el.bbox[1] * 100}%`,
                      width: `${el.bbox[2] * 100}%`,
                      height: `${el.bbox[3] * 100}%`,
                      borderColor: meta.color,
                      backgroundColor: `${meta.color}${active ? '26' : '14'}`,
                    }}
                  >
                    <span
                      className="absolute -top-5 left-0 max-w-full truncate rounded px-1 py-px text-[10px] font-medium whitespace-nowrap text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.label} · {el.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {structure && (
            <p className="mt-2 text-[11px] text-zinc-400">
              构图：{structure.composition || '—'} ｜ 风格：{structure.style || '—'} ｜
              直接拖动色块即可调整元素位置
            </p>
          )}
        </section>

        {/* 右栏：结构清单与操作 */}
        <section className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-zinc-900">结构清单</h2>
            {structure && (
              <Button size="sm" variant="outline" onClick={shuffleLayout}>
                <Shuffle className="h-3.5 w-3.5 text-[#fe2c55]" />
                一键打乱
              </Button>
            )}
          </div>

          {!structure && (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center text-zinc-400">
              <ScanSearch className="mb-2 h-8 w-8" />
              <p className="text-[13px]">解析后，这里会列出主图的每个结构元素</p>
              <p className="mt-1 text-[11px]">支持重命名、改文案、调层级、删元素</p>
            </div>
          )}

          {structure && (
            <div className="max-h-[380px] flex-1 space-y-2 overflow-y-auto pr-1">
              {structure.elements.map((el, idx) => {
                const meta = TYPE_META[el.type];
                return (
                  <div
                    key={el.id}
                    onClick={() => setActiveId(el.id)}
                    className={cn(
                      'rounded-lg border p-2.5 transition-colors duration-150',
                      activeId === el.id
                        ? 'border-zinc-300 bg-zinc-50 ring-1 ring-zinc-300'
                        : 'border-zinc-200 hover:border-zinc-300',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-[11px] text-zinc-400">{meta.label}</span>
                      <Input
                        value={el.name}
                        onChange={(e) => patchElement(el.id, { name: e.target.value })}
                        className="h-6 flex-1 border-0 bg-transparent px-1 text-[13px] font-medium shadow-none focus-visible:ring-1"
                      />
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-label="上移图层"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveElement(el.id, -1);
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="下移图层"
                          disabled={idx === structure.elements.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveElement(el.id, 1);
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="删除元素"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeElement(el.id);
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-[#fe2c55]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <Input
                      value={el.description}
                      placeholder={el.type === 'text' ? '卖点文案' : '视觉描述'}
                      onChange={(e) => patchElement(el.id, { description: e.target.value })}
                      className="mt-1.5 h-7 border-zinc-200 bg-white px-2 text-xs shadow-none"
                    />
                    {el.role && (
                      <p className="mt-1 line-clamp-1 text-[11px] text-zinc-400">{el.role}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {structure && (
            <p className="mt-3 border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-400">
              拖动产品框可决定生成图中产品的摆放位置；到下方「广告拍摄策划案」确认策略与镜头后即可生成
            </p>
          )}
        </section>
      </div>

      {/* 广告拍摄策划案 */}
      {structure && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900">
                <Clapperboard className="h-4 w-4 text-[#fe2c55]" />
                广告拍摄策划案
                {brief?.review && brief.review.attempts > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      brief.review.passed
                        ? 'bg-[#00b8b0]/10 text-[#00b8b0]'
                        : 'bg-amber-500/10 text-amber-600',
                    )}
                    title={`识别度${brief.review.scores.recognition} · 聚焦${brief.review.scores.focus} · 合规${brief.review.scores.compliance} · 可拍性${brief.review.scores.feasibility} · 钩子${brief.review.scores.hook}${brief.review.issues ? `\n问题：${brief.review.issues}` : ''}`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {brief.review.passed ? '五维自审通过' : '自审未过线'}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                广告制作 Agent 产出：先定传播策略，再开拍摄清单——每张图各司其职，边界清晰，产品永远是主角
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addShot} disabled={!brief}>
                <Plus className="h-3.5 w-3.5" />
                自定义镜头
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingBrief}
                onClick={() => void loadBrief(structure)}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingBrief && 'animate-spin')} />
                换一版策划
              </Button>
            </div>
          </div>

          {loadingBrief && !brief ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg bg-zinc-50 text-zinc-400"
                >
                  <Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" />
                  <p className="text-xs">广告制作 Agent 正在撰写策划案…</p>
                </div>
              ))}
            </div>
          ) : brief ? (
            <>
              {/* 传播策略 */}
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { key: 'audience', label: '目标人群', ph: '如：20-35岁通勤女性' },
                    { key: 'coreSellingPoint', label: '核心卖点', ph: '只选一个最能打的' },
                    { key: 'hook', label: '传播钩子', ph: '让人一眼记住的记忆点' },
                  ] as const
                ).map((f) => (
                  <div
                    key={f.key}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2"
                  >
                    <p className="text-[11px] font-medium text-zinc-500">{f.label}</p>
                    <Input
                      value={brief[f.key]}
                      onChange={(e) => patchBrief({ [f.key]: e.target.value })}
                      placeholder={f.ph}
                      className="mt-1 h-7 border-0 bg-transparent px-0 text-[13px] font-semibold text-zinc-900 shadow-none focus-visible:ring-0"
                    />
                  </div>
                ))}
              </div>

              {/* 拍摄清单 */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {brief.shots.map((shot) => {
                  const meta = SHOT_ROLE_META[shot.role] ?? SHOT_ROLE_META.scene;
                  return (
                    <div
                      key={shot.id}
                      className="rounded-lg border border-zinc-200 p-3 transition-colors duration-150 hover:border-zinc-300"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <Input
                          value={shot.name}
                          onChange={(e) => patchShot(shot.id, { name: e.target.value })}
                          placeholder="画面短名"
                          className="h-7 flex-1 border-0 bg-transparent px-1 text-[13px] font-semibold shadow-none focus-visible:ring-1"
                        />
                        <button
                          type="button"
                          aria-label="删除镜头"
                          onClick={() => removeShot(shot.id)}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-[#fe2c55]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <Input
                          value={shot.sellingPoint}
                          onChange={(e) => patchShot(shot.id, { sellingPoint: e.target.value })}
                          placeholder="卖点"
                          className="h-7 flex-1 border-0 bg-[#fe2c55]/10 px-2 text-[11px] text-[#fe2c55] shadow-none placeholder:text-[#fe2c55]/50 focus-visible:ring-1"
                        />
                        <Input
                          value={shot.emotion}
                          onChange={(e) => patchShot(shot.id, { emotion: e.target.value })}
                          placeholder="情绪/理念"
                          className="h-7 flex-1 border-0 bg-amber-50 px-2 text-[11px] text-amber-700 shadow-none placeholder:text-amber-400 focus-visible:ring-1"
                        />
                      </div>
                      <textarea
                        value={shot.scene}
                        onChange={(e) => patchShot(shot.id, { scene: e.target.value })}
                        placeholder="画面描述：环境 / 光线 / 道具 / 人物状态"
                        rows={3}
                        className="mt-2 w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200"
                      />
                      <Input
                        value={shot.composition}
                        onChange={(e) => patchShot(shot.id, { composition: e.target.value })}
                        placeholder="构图规范：景别 / 产品占比 / 位置"
                        className="mt-1.5 h-7 border-zinc-200 bg-white px-2 text-[11px] text-zinc-500 shadow-none"
                      />
                      {shot.claimNote && (
                        <p
                          className="mt-1.5 flex items-start gap-1 rounded bg-zinc-50 px-1.5 py-1 text-[10px] leading-snug text-zinc-400"
                          title="证据边界：本镜头宣称的依据是否充足（合规审查）"
                        >
                          <ShieldCheck className="mt-px h-3 w-3 shrink-0 text-zinc-300" />
                          {shot.claimNote}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-zinc-50 py-8 text-center text-xs text-zinc-400">
              策划案加载失败，点击「换一版策划」重试
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="额外要求（可选），如：整体偏暖色调、加入圣诞元素"
              className="h-9 min-w-[220px] flex-1 text-xs shadow-none"
            />
            <Button
              className="bg-[#fe2c55] text-white hover:bg-[#e6254c]"
              disabled={!brief || brief.shots.length === 0 || generating}
              onClick={generate}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating
                ? '正在拍摄广告主图（4K，约 1 分钟）…'
                : `按拍摄清单生成 ${brief?.shots.length ?? 0} 张广告主图（4K）`}
            </Button>
          </div>
        </section>
      )}

      {/* 生成结果 */}
      {(results.length > 0 || generating) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">生成结果</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {generating &&
              Array.from({ length: brief?.shots.length || 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-zinc-50 text-zinc-400"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-[#00b8b0]" />
                  <p className="text-xs">生成中…</p>
                </div>
              ))}
            {!generating &&
              results.map((r, i) => (
                <div
                  key={r.url}
                  className="group relative overflow-hidden rounded-lg border border-zinc-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={r.variant} className="block aspect-square w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-white">{r.variant}</span>
                      {r.note && (
                        <p className="truncate text-[10px] text-white/75">{r.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {r.sceneId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 bg-white/90 text-xs hover:bg-white"
                          disabled={anglesFor !== null}
                          title="以此场景生成不同机位/构图的图"
                          onClick={() => void generateAngles(r)}
                        >
                          {anglesFor === r.url ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Aperture className="h-3 w-3" />
                          )}
                          多角度
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 bg-white/90 text-xs hover:bg-white"
                        onClick={() => void downloadImage(r.url, r.variant, i)}
                      >
                        <Download className="h-3 w-3" />
                        下载
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            按策划案职能生成的 4K 广告主图，可直接用于 Listing；点击「多角度」可对满意的镜头二次生成 4 个不同机位的同场景图
          </p>
        </section>
      )}

      {/* 多角度衍生结果 */}
      {(angleBatches.length > 0 || anglesFor) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900">
              <Aperture className="h-4 w-4 text-[#6366f1]" />
              多角度衍生
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              以选中场景图为参考做同场景不同机位的二次生成，保持场景与产品连贯一致
            </p>
          </div>

          {anglesFor && (
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-zinc-50 text-zinc-400"
                >
                  <Loader2 className="h-5 w-5 animate-spin text-[#6366f1]" />
                  <p className="text-xs">正在生成 4 个视角…</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {angleBatches.map((batch) => (
              <div key={batch.id}>
                <h3 className="mb-2 text-[13px] font-medium text-zinc-700">
                  「{batch.sceneName}」的 {batch.results.length} 个视角
                </h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  {batch.results.map((r, i) => (
                    <div
                      key={r.url}
                      className="group relative overflow-hidden rounded-lg border border-zinc-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.url}
                        alt={r.variant}
                        className="block aspect-square w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-1.5">
                        <span className="text-[11px] font-medium text-white">{r.variant}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 bg-white/90 px-2 text-[11px] hover:bg-white"
                          onClick={() =>
                            void downloadImage(r.url, `${batch.sceneName}-${r.variant}`, i)
                          }
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
