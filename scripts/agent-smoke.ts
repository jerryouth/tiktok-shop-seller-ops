// Agent 端到端冒烟脚本：直接驱动 runAgent，验证 ReAct 工具调用循环（非 HTTP 层）
// 用法：pnpm tsx scripts/agent-smoke.ts [用例名关键词]
import { readFileSync } from 'node:fs';

// 独立脚本不经过 Next，手动加载 .env.local（APIFY_TOKEN 等）
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local 不存在时忽略
}

import { runAgent } from '../src/lib/agent/runner';
import type { AgentEvent } from '../src/lib/agent/types';

async function runCase(name: string, question: string): Promise<void> {
  console.log(`\n========== 用例：${name} ==========`);
  console.log(`Q: ${question}\n`);
  const emit = (e: AgentEvent): void => {
    if (e.type === 'skill_start') {
      console.log(`  [调用工具] ${e.skill}`);
    } else if (e.type === 'skill_end') {
      console.log(`  [工具完成] ${e.skill} -> ${e.summary}`);
    } else if (e.type === 'content') {
      process.stdout.write(e.content);
    } else if (e.type === 'error') {
      console.log(`  [错误] ${e.error}`);
    }
  };
  await runAgent({
    headers: new Headers(),
    history: [{ role: 'user', content: question }],
    emit,
  });
  console.log('\n---------- 用例结束 ----------');
}

const cases: [string, string][] = [
  ['利润测算', '日落投影氛围灯：1688 成本约 22 元，重 200g，定价 $19.99。帮我测算毛利、净利、ROI 和盈亏平衡广告成本'],
  ['1688货源', '最近磁吸假睫毛在美区很火，这个品能做吗？帮我在1688上找找货源'],
  ['营销日历', '接下来两个月有什么营销节点？适合提前布局哪些方向？'],
  ['联网趋势', '联网看看 TikTok 美区最近什么话题在爆，给我 3 个选品方向，横向对比并给出推荐卡片'],
  ['谷歌趋势', '用谷歌趋势查一下 magnetic lashes 和 pet cooling mat 在美国的搜索热度，现在入场哪个更合适'],
  ['图表方向', '用谷歌趋势对比 sunset lamp、sunset projection lamp、galaxy projector 近 3 个月搜索兴趣，画折线图并给出推荐方向'],
];

async function main(): Promise<void> {
  const only = process.argv[2];
  const selected = only ? cases.filter(([n]) => n.includes(only)) : cases;
  for (const [name, q] of selected) {
    await runCase(name, q);
  }
}

main().catch((err) => {
  console.error('冒烟脚本失败:', err);
  process.exit(1);
});
