// 上传图片（base64）→ 换取可在图生图中使用的公网 URL
import { NextRequest, NextResponse } from 'next/server';
import { dataUrlToBuffer, putImage } from '@/lib/image-store';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { dataUrl?: string };
    if (!body.dataUrl || typeof body.dataUrl !== 'string') {
      return NextResponse.json({ error: '缺少 dataUrl 参数' }, { status: 400 });
    }
    const parsed = dataUrlToBuffer(body.dataUrl);
    if (!parsed) {
      return NextResponse.json({ error: '图片数据格式不正确' }, { status: 400 });
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(parsed.contentType)) {
      return NextResponse.json({ error: '仅支持 PNG / JPG / WebP 图片' }, { status: 400 });
    }
    if (parsed.data.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: '图片大小不能超过 10MB' }, { status: 400 });
    }
    const id = putImage(parsed.data, parsed.contentType);
    return NextResponse.json({ id, url: `/api/image/file/${id}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上传失败' },
      { status: 500 },
    );
  }
}
