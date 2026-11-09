/**
 * 一次性脚本：生成 GB2312 映射表（src/lib/gb2312-table.ts）
 * 运行：pnpm tsx scripts/gen-gb2312-table.ts
 * 1688 搜索接口只接受 GBK 编码的关键词，浏览器无原生 GBK 编码器，故内置此表。
 */
import iconv from 'iconv-lite';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROWS = 0xf7 - 0xa1 + 1; // hi: A1-F7
const COLS = 94; // lo: A1-FE
const cells: string[] = new Array(ROWS * COLS).fill('');

for (let hi = 0xa1; hi <= 0xf7; hi++) {
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    const ch = iconv.decode(Buffer.from([hi, lo]), 'gbk');
    if (ch.length === 1 && ch !== '' && ch !== '?') {
      cells[(hi - 0xa1) * COLS + (lo - 0xa1)] = ch;
    }
  }
}

const grid = cells.join('');
const out = `/** 自动生成（scripts/gen-gb2312-table.ts），请勿手改。GB2312 区位表：索引=(hi-0xA1)*94+(lo-0xA1) */
export const GB2312_GRID = ${JSON.stringify(grid)};
export const GB2312_ROWS = ${ROWS};
`;

writeFileSync(join(process.cwd(), 'src/lib/gb2312-table.ts'), out, 'utf-8');
console.log('grid chars:', grid.length, '| mapped:', cells.filter((c) => c !== '').length);
