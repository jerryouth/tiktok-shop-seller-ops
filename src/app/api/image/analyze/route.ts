// 主图结构解析：多模态 LLM 识别主图元素并返回归一化 bbox
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { analyzeImage, assertImageStudioReady } from '@/lib/image-studio';
import { resolveToDataUri } from '@/lib/image-resolve';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    assertImageStudioReady();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '服务不可用' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { image?: string };
    if (!body.image || typeof body.image !== 'string') {
      return NextResponse.json({ error: '缺少图片参数 image' }, { status: 400 });
    }
    const dataUri = await resolveToDataUri(body.image);
    const headers = HeaderUtils.extractForwardHeaders(request.headers);
    const structure = await analyzeImage(dataUri, headers);
    return NextResponse.json({ structure });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '主图解析失败' },
      { status: 500 },
    );
  }
}
