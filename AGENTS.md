# 项目上下文

TikTok Shop 跨境电商选品运营后台（全中文界面），面向跨境卖家辅助选品决策。

## 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **图表**: ECharts 6（封装于 `src/components/echart.tsx`）
- **包管理**: 仅 pnpm，严禁 npm / yarn

## 业务模块

1. **选品库**（`/products`）：表格（图片/名称/类目/售价/销量/评分/7日增幅/上架时间/选品评分）、关键词防抖搜索、类目/价格/销量/评分/分数组合筛选、6 字段排序、分页、批量删除、新增商品对话框、CSV 批量导入、商品详情抽屉（雷达图 + 近 14 天销量 + 推荐理由）。
2. **智能选品评分**（`src/lib/scoring.ts`）：热度 25% + 利润 25% + 销量 20% + 竞争环境 15% + 增长势头 15%，0-100 分；≥85 标注「潜力爆款」；自动生成中文推荐理由（评级开场 → 核心优势 → 风险提示 → 运营建议）。
3. **市场趋势看板**（`/`）：4 张统计卡片、热销品类条形图、近 14 天销量折线、飙升商品榜（近 7 天增幅 TOP6）、评分分布环形饼图。
4. **AI 选品 Agent**（`src/lib/agent/` + `/api/chat`）：自然语言对话选品，ReAct 多跳推理（协议式工具调用，非原生 function calling）。模型输出 `<tool_call>{"skill":"...","args":{...}}</tool_call>` → runner 解析执行 Skill → `<tool_result>` 注入观察 → 循环至产出最终回答（最多 5 轮）。6 个 Skill 薄封装 store/趋势源：queryProducts、getProductDetail、getCategoryInsights、getMarketOverview、compareProducts、getHotTrends（联网趋势）。模型：doubao-seed-2-0-pro-260215。SSE 事件协议：skill_start / skill_end / content / done / error。前端 `ai-chat.tsx` 悬浮面板（右下角）：流式打字机渲染、[PRODUCT:id] 内联商品卡片、Agent 执行步骤可视化、跨 chunk SSE 行缓冲。

## 目录结构

```
├── public/products/        # AI 生成的商品演示图（6 类目 × 2）
├── src/
│   ├── app/
│   │   ├── page.tsx              # 市场趋势看板（客户端组件）
│   │   ├── products/page.tsx     # 选品库页面
│   │   ├── layout.tsx            # 根布局（挂载 AppShell）
│   │   └── api/
│   │       ├── products/route.ts         # GET 列表 / POST 新增 / DELETE 批量
│   │       ├── products/[id]/route.ts    # GET 详情 / DELETE 单个
│   │       ├── products/import/route.ts  # POST CSV 导入
│   │       ├── stats/route.ts            # GET 看板统计
│   │       └── chat/route.ts             # POST AI Agent 对话（SSE 流式）
│   ├── components/
│   │   ├── app-shell.tsx         # 深色侧边栏布局（移动端 Sheet 抽屉，挂载 AiChat）
│   │   ├── ai-chat.tsx           # AI 选品 Agent 悬浮聊天面板
│   │   ├── echart.tsx            # ECharts 通用封装（自动 resize）
│   │   ├── score-badge.tsx       # 评分徽章 + 潜力爆款标识
│   │   ├── product-form-dialog.tsx / import-dialog.tsx / product-detail-drawer.tsx
│   │   └── ui/                   # shadcn/ui 组件库
│   ├── lib/agent/
│   │   ├── types.ts              # Skill / AgentEvent 类型
│   │   ├── skills.ts             # 6 个 Skill 实现 + 注册表（新增工具在此登记）
│   │   ├── prompts.ts            # 系统提示词（工具协议 + Skill 文档自动生成）
│   │   ├── runner.ts             # ReAct 循环（窥探流前缀判定工具调用/最终回答）
│   │   └── sources/trends.ts     # 趋势数据源适配器层（WebSearch 实现，可插拔 Kalodata/EchoTik）
├── scripts/agent-smoke.ts        # Agent E2E 冒烟脚本（pnpm tsx scripts/agent-smoke.ts）
│   └── lib/
│       ├── types.ts              # 全局类型（Product / ScoreResult / DashboardStats…）
│       ├── scoring.ts            # 评分引擎（维度加权 + 推荐理由生成）
│       ├── data.ts               # 28 个内置演示商品（确定性日销序列）
│       ├── store.ts              # 内存数据仓库（globalThis 挂载，HMR 安全）
│       ├── format.ts             # 格式化工具（销量/金额/百分比/评分档位）
│       └── utils.ts              # cn()
├── DESIGN.md                 # 设计规范（TikTok 青/洋红双色点缀的浅色后台）
└── next.config.ts
```

## 数据源与迭代

- 当前为**内存演示数据**（`store.ts` 中 `getProducts()`，服务重启后重置为 28 个演示商品）。
- 对接真实数据时：仅需替换 `store.ts` 的数据读写实现（保持函数签名不变），评分引擎、API 路由与前端无需改动。

## 开发规范

- 默认按 TypeScript `strict` 写代码；禁止隐式 `any` 与 `as any`。
- ECharts option 中的 formatter 回调参数统一用 `unknown` 再断言，避免与 `EChartsOption` 类型冲突。
- 严禁在 JSX 渲染逻辑中直接使用 `typeof window`、`Date.now()`、`Math.random()`；动态内容用 `'use client'` + `useEffect`。
- 三方字体/CSS 在 `globals.css` 顶部 `@import`（中文字体用 `fonts.googleapis.cn`），禁止 head 标签。
- 金额用 `$` 前缀（美元），销量用「万」格式化，百分比带 `+/-` 号。
- 评分分档：≥85 洋红 #FE2C55「潜力爆款」；70-84 青 #00B8B0；55-69 琥珀；<55 灰。

## 验证命令

- `pnpm ts-check` / `pnpm lint --quiet`：静态检查
- API 冒烟测试通过 test_run 执行，覆盖 7 个端点（列表/筛选/详情/新增/批量删除/单个删除/CSV导入/统计）
