// 广告制作 Agent：基于产品结构产出 Listing 视觉策划案（策略 + 拍摄清单）
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { assertImageStudioReady, produceReviewedCreativeBrief } from '@/lib/image-studio';
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
    const brief = await produceReviewedCreativeBrief(body.structure, headers);
    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '策划案生成失败' },
      { status: 500 },
    );
  }
}
