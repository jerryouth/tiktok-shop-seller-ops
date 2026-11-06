// 上传图片的临时内存仓库（globalThis 挂载，HMR 安全；进程重启后失效，属临时工作数据）
const g = globalThis as unknown as {
  __imgFiles?: Map<string, { data: Buffer; contentType: string; createdAt: number }>;
};

function getMap(): Map<string, { data: Buffer; contentType: string; createdAt: number }> {
  if (!g.__imgFiles) g.__imgFiles = new Map();
  // 简单容量保护：超过 50 张时淘汰最旧的
  if (g.__imgFiles.size >= 50) {
    const oldest = [...g.__imgFiles.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key] of oldest.slice(0, 10)) g.__imgFiles.delete(key);
  }
  return g.__imgFiles;
}

export function putImage(data: Buffer, contentType: string): string {
  const id = crypto.randomUUID();
  getMap().set(id, { data, contentType, createdAt: Date.now() });
  return id;
}

export function getImage(
  id: string,
): { data: Buffer; contentType: string } | undefined {
  return getMap().get(id);
}

export function dataUrlToBuffer(dataUrl: string): { data: Buffer; contentType: string } | null {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return { data: Buffer.from(m[2], 'base64'), contentType: m[1] };
  } catch {
    return null;
  }
}
