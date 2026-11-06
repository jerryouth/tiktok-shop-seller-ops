'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const CSV_TEMPLATE = `名称,类目,售价,成本,销量,评分,评论数,上架时间,竞争度,热度,店铺
烟酰胺身体乳 250ml,美妆个护,11.99,3.5,5200,4.6,1200,2025-10-20,55,78,GlowLab 美妆专营店
折叠收纳洗衣篮,家居生活,9.99,2.8,3800,4.4,860,2025-10-25,40,66,HomeVibe 家居好物馆`;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResponse {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
  error?: string;
}

export function ImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!csv.trim()) {
      toast.error('请先选择 CSV 文件或粘贴 CSV 内容');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = (await res.json()) as ImportResponse;
      if (!res.ok) {
        toast.error(data.error ?? '导入失败，请检查 CSV 格式');
        return;
      }
      setResult(data);
      if (data.imported > 0) {
        toast.success(`成功导入 ${data.imported} 个商品`);
        onSuccess();
      } else {
        toast.warning('没有商品被导入，请检查数据内容');
      }
    } catch {
      toast.error('网络异常，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setResult(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>CSV 批量导入</DialogTitle>
          <DialogDescription>
            列顺序：名称,类目,售价,成本,销量,评分,评论数,上架时间,竞争度,热度,店铺。首行表头可省略，仅名称、类目、售价、成本必填。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="mr-1.5 h-4 w-4" />
              选择 CSV 文件
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCsv(CSV_TEMPLATE);
                setResult(null);
              }}
            >
              填入示例模板
            </Button>
          </div>

          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
            placeholder="在此粘贴 CSV 内容，或点击上方按钮选择文件…"
            className="min-h-[220px] font-mono text-xs"
          />

          {result && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-medium text-zinc-800">
                导入结果：成功 {result.imported} 条，失败 {result.failed} 条
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-red-600">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      第 {err.row} 行：{err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing}
            className="bg-[#00b8b0] text-white hover:bg-[#089b94]"
          >
            {importing ? '导入中…' : '开始导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
