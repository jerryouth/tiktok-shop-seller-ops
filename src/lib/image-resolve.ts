// 图片引用解析：把前端传来的图片引用统一转换为 LLM / 图生图可用的形式
import { promises as fs } from 'fs';
import path from 'path';
import { getImage } from './image-store';

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** 解析为 base64 data URI（供多模态 LLM 视觉识别；公网 URL 直接透传） */
export async function resolveToDataUri(image: string): Promise<string> {
  if (image.startsWith('data:')) return image;
  if (/^https?:\/\//.test(image)) return image;

  if (image.startsWith('/products/')) {
    const clean = path.posix.normalize(image);
    if (!clean.startsWith('/products/')) throw new Error('非法图片路径');
    const abs = path.join(process.cwd(), 'public', clean);
    const buf = await fs.readFile(abs);
    const mime = EXT_MIME[path.posix.extname(clean).toLowerCase()] ?? 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  const m = /^\/api\/image\/file\/([\w-]+)$/.exec(image);
  if (m) {
    const file = getImage(m[1]);
    if (!file) throw new Error('上传的图片已失效，请重新上传');
    return `data:${file.contentType};base64,${file.data.toString('base64')}`;
  }

  throw new Error('不支持的图片引用格式');
}

/** 解析为公网绝对 URL（供图生图参考图，生成服务需主动回源拉取） */
export function resolveToPublicUrl(image: string, origin: string): string {
  if (/^https?:\/\//.test(image)) return image;
  if (image.startsWith('/products/')) return `${origin}${image}`;
  if (/^\/api\/image\/file\/[\w-]+$/.test(image)) return `${origin}${image}`;
  throw new Error('图生图需要商品库图片或已上传图片（不支持直接使用本地预览数据）');
}

/** 从请求头推导对外访问源（协议 + 域名） */
export function resolveOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host');
  if (host) return `${proto}://${host}`;
  const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT ?? '';
  return domain.startsWith('http') ? domain : `https://${domain}`;
}
