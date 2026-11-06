// 广告主图生成：以原图为参考，按策划案拍摄清单批量图生图（边界受控，无文字）
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { assertImageStudioReady, remixImage } from '@/lib/image-studio';
import { resolveOrigin, resolveToPublicUrl } from '@/lib/image-resolve';
import type { CreativeBrief, ImageStructure } from '@/lib/image-types';

export const maxDuration = 300;

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
    const body = (await request.json()) as {
      image?: string;
      structure?: ImageStructure;
      brief?: CreativeBrief;
      extra?: string;
    };
    if (!body.image || typeof body.image !== 'string') {
      return NextResponse.json({ error: '缺少图片参数 image' }, { status: 400 });
    }
    if (!body.structure || !Array.isArray(body.structure.elements) || body.structure.elements.length === 0) {
      return NextResponse.json({ error: '缺少有效的结构数据 structure.elements' }, { status: 400 });
    }
    if (!body.brief || !Array.isArray(body.brief.shots) || body.brief.shots.length === 0 || body.brief.shots.length > 6) {
      return NextResponse.json({ error: '拍摄清单镜头数量需在 1-6 个之间' }, { status: 400 });
    }

    const referenceUrl = resolveToPublicUrl(body.image, resolveOrigin(request));
    const headers = HeaderUtils.extractForwardHeaders(request.headers);
    const images = await remixImage(referenceUrl, body.structure, body.brief, body.extra, headers);
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '主图生成失败' },
      { status: 500 },
    );
  }
}
