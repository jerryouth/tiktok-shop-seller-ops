// 多角度衍生：以选中镜头已生成的图为参考，生成不同视角/构图的同场景主图
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { assertImageStudioReady, remixAngles } from '@/lib/image-studio';
import type { Shot } from '@/lib/image-types';

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
      shot?: Shot;
      productName?: string;
      extra?: string;
    };
    if (!body.image || typeof body.image !== 'string' || !body.image.startsWith('http')) {
      return NextResponse.json(
        { error: '缺少有效的参考图 URL（应为已生成图的公网地址）' },
        { status: 400 },
      );
    }
    if (!body.shot || typeof body.shot.scene !== 'string' || !body.shot.scene.trim()) {
      return NextResponse.json({ error: '缺少有效的镜头数据 shot' }, { status: 400 });
    }

    const headers = HeaderUtils.extractForwardHeaders(request.headers);
    const images = await remixAngles(
      body.image,
      body.shot,
      body.productName ?? '产品',
      body.extra,
      headers,
    );
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '多角度生成失败' },
      { status: 500 },
    );
  }
}
