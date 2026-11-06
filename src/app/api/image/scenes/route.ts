// 场景联想：基于产品结构，LLM 构思差异化的使用场景（画面暗示产品价值）
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { assertImageStudioReady, suggestScenes } from '@/lib/image-studio';
import type { ImageStructure } from '@/lib/image-types';

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
    const body = (await request.json()) as { structure?: ImageStructure };
    if (!body.structure || typeof body.structure.productName !== 'string') {
      return NextResponse.json({ error: '缺少结构数据 structure' }, { status: 400 });
    }
    const headers = HeaderUtils.extractForwardHeaders(request.headers);
    const scenes = await suggestScenes(body.structure, headers);
    return NextResponse.json({ scenes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '场景联想失败' },
      { status: 500 },
    );
  }
}
