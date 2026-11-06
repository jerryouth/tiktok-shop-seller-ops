// Agent 端到端冒烟脚本：直接驱动 runAgent，验证 ReAct 工具调用循环（非 HTTP 层）
// 用法：pnpm tsx scripts/agent-smoke.ts
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
  ['库内检索', '帮我推荐利润率最高的2个商品'],
  ['联网趋势', '现在 TikTok 美区什么产品比较火？看看咱们库里有没有对应的货'],
];

async function main(): Promise<void> {
  for (const [name, q] of cases) {
    await runCase(name, q);
  }
}

main().catch((err) => {
  console.error('冒烟脚本失败:', err);
  process.exit(1);
});
