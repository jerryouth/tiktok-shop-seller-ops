/**
 * 1688 搜索链接构建（GBK 编码）
 * 1688 搜索接口将 keywords 参数按 GBK 解码，传 UTF-8 百分号编码会显示乱码。
 * 浏览器/Node 均无原生 GBK 编码器，使用内置 GB2312 区位表（src/lib/gb2312-table.ts）。
 */
import { GB2312_GRID, GB2312_ROWS } from './gb2312-table';

const COLS = 94;

/** 反向映射：字符 → GBK 双字节码（惰性构建一次） */
let reverseMap: Map<string, number> | null = null;
function getReverseMap(): Map<string, number> {
  if (!reverseMap) {
    reverseMap = new Map();
    for (let row = 0; row < GB2312_ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const ch = GB2312_GRID[row * COLS + col];
        if (ch) reverseMap.set(ch, ((0xa1 + row) << 8) | (0xa1 + col));
      }
    }
  }
  return reverseMap;
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

/** GBK 百分号编码：ASCII 直出，汉字查 GB2312 表，表外字符退化为 ? */
export function gbkPercentEncode(input: string): string {
  const map = getReverseMap();
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out += /[A-Za-z0-9\-._~]/.test(ch) ? ch : '%' + hex(code);
    } else {
      const gbk = map.get(ch);
      out += gbk === undefined ? '%3F' : '%' + hex(gbk >> 8) + '%' + hex(gbk & 0xff);
    }
  }
  return out;
}

/** 1688 货源搜索直达链接（keywords 必须 GBK 编码，否则 1688 侧显示乱码） */
export function build1688SearchUrl(keyword: string): string {
  return `https://s.1688.com/selloffer/offer_search.htm?keywords=${gbkPercentEncode(keyword.trim())}`;
}
