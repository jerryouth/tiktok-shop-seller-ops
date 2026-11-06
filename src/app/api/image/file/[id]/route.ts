// 读取已上传的图片（供图生图服务公网回源）
import { NextRequest, NextResponse } from 'next/server';
import { getImage } from '@/lib/image-store';

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const file = getImage(id);
  if (!file) {
    return NextResponse.json({ error: '图片不存在或已过期' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
