'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CATEGORIES } from '@/lib/types';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  category: string;
  price: string;
  cost: string;
  sales: string;
  rating: string;
  reviews: string;
  listedAt: string;
  competition: string;
  heat: string;
  seller: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  category: '',
  price: '',
  cost: '',
  sales: '',
  rating: '',
  reviews: '',
  listedAt: '',
  competition: '',
  heat: '',
  seller: '',
};

export function ProductFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: ProductFormDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('请填写商品名称');
      return;
    }
    if (!form.category) {
      toast.error('请选择商品类目');
      return;
    }
    if (!form.price || Number(form.price) <= 0) {
      toast.error('请填写正确的售价');
      return;
    }
    if (form.cost === '' || Number(form.cost) < 0) {
      toast.error('请填写正确的成本');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          price: Number(form.price),
          cost: Number(form.cost),
          sales: form.sales === '' ? undefined : Number(form.sales),
          rating: form.rating === '' ? undefined : Number(form.rating),
          reviews: form.reviews === '' ? undefined : Number(form.reviews),
          listedAt: form.listedAt || undefined,
          competition:
            form.competition === '' ? undefined : Number(form.competition),
          heat: form.heat === '' ? undefined : Number(form.heat),
          seller: form.seller || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; name?: string };
      if (!res.ok) {
        toast.error(data.error ?? '新增失败，请稍后重试');
        return;
      }
      toast.success(`商品「${data.name}」已加入选品库`);
      setForm(INITIAL_FORM);
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error('网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>新增商品</DialogTitle>
          <DialogDescription>
            手动录入商品信息，带 * 为必填项，其余留空将使用系统默认值。上架后将自动计算选品评分。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="p-name">商品名称 *</Label>
            <Input
              id="p-name"
              className="mt-1.5"
              placeholder="例如：哑光丝绒唇釉三支套装"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={60}
            />
          </div>

          <div>
            <Label>商品类目 *</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder="选择类目" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="p-seller">店铺名称</Label>
            <Input
              id="p-seller"
              className="mt-1.5"
              placeholder="默认：自营店铺"
              value={form.seller}
              onChange={(e) => set('seller', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-price">售价（USD）*</Label>
            <Input
              id="p-price"
              className="mt-1.5"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="12.99"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-cost">成本（USD）*</Label>
            <Input
              id="p-cost"
              className="mt-1.5"
              type="number"
              min="0"
              step="0.01"
              placeholder="3.20"
              value={form.cost}
              onChange={(e) => set('cost', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-sales">累计销量</Label>
            <Input
              id="p-sales"
              className="mt-1.5"
              type="number"
              min="0"
              placeholder="默认 0"
              value={form.sales}
              onChange={(e) => set('sales', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-reviews">评论数</Label>
            <Input
              id="p-reviews"
              className="mt-1.5"
              type="number"
              min="0"
              placeholder="默认 0"
              value={form.reviews}
              onChange={(e) => set('reviews', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-rating">商品评分（0-5）</Label>
            <Input
              id="p-rating"
              className="mt-1.5"
              type="number"
              min="0"
              max="5"
              step="0.1"
              placeholder="默认 4.5"
              value={form.rating}
              onChange={(e) => set('rating', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-listed">上架时间</Label>
            <Input
              id="p-listed"
              className="mt-1.5"
              type="date"
              value={form.listedAt}
              onChange={(e) => set('listedAt', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-comp">竞争度（0-100）</Label>
            <Input
              id="p-comp"
              className="mt-1.5"
              type="number"
              min="0"
              max="100"
              placeholder="默认 50"
              value={form.competition}
              onChange={(e) => set('competition', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="p-heat">热度指数（0-100）</Label>
            <Input
              id="p-heat"
              className="mt-1.5"
              type="number"
              min="0"
              max="100"
              placeholder="默认 60"
              value={form.heat}
              onChange={(e) => set('heat', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#00b8b0] text-white hover:bg-[#089b94]"
          >
            {submitting ? '提交中…' : '确认新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
