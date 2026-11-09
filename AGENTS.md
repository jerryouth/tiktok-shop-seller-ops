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
3. **市场趋势看板**（`/` + `/api/trends`）：**真实数据版**——TikTok Creative Center 美区 7 日官方榜（经 Apify，话题/播放/发帖/动能/阶段/行业，按播放降序去重）+ Google Trends 搜索兴趣（默认词优先取电商相关行业话题，支持自定义英文词查询）+ 美国营销日历倒计时。服务端 30 分钟内存缓存（TikTok/Google 分开缓存，globalThis 挂载）；4 张统计卡（在榜话题/上升期/总播放/下一节点）、热榜表格（TOP15 含 Creative Center 外链）、行业热度条形图、飙升话题 TOP5、Google 兴趣折线+洞察卡（指数/环比/飙升关联词/接近峰值）、营销节点卡片（倒计时+备货紧张标记+文化洞察）。共享类型 `src/lib/trend-types.ts`。
4. **AI 选品 Agent「老K」**（`src/lib/agent/` + `/api/chat`）：顶级选品总监人设（懂数据/美国文化/ROI/毛利；红线：毛利≥55%、盈亏平衡 CPA>0、轻小件、$9.99-$29.99 黄金定价带），ReAct 多跳推理（协议式工具调用，非原生 function calling）。模型输出 `<tool_call>{"skill":"...","args":{...}}</tool_call>` → runner 解析执行 Skill → `<tool_result>` 注入观察 → 循环至产出最终回答（最多 10 轮，耗尽时强制收敛产出回答）。系统提示词注入服务端真实日期（北京/美西双时区），日期与倒计时一律以工具返回为准，禁止模型凭记忆推算当前时间。**选品策略为外部趋势驱动：选品库（queryProducts 等 5 个库内 Skill 仍在注册表但不出现在提示词文档中）不作为选品依据，禁止推荐库内商品/ID**；选品工具仅 7 个（提示词文档自动生成）——getHotTrends（趋势源适配器层 `sources/trends.ts`：ApifyTrendSource 优先[TikTok Creative Center 美区官方榜，需 APIFY_TOKEN，见 `sources/apify.ts`] > WebSearchTrendSource 兜底）、getGoogleTrends（Google 搜索兴趣，经 Apify Actor onepierre~google-trends-insights，返回 0-100 指数/动能/飙升关联词/高热度州/24点时序）、calcUnitEconomics（单品经济模型，费率基准见 `src/lib/unit-economics.ts` FEE_BENCHMARKS）、getSeasonalCalendar（美国营销日历，数据源 `sources/calendar.ts`：12 节点+文化洞察+备货周期）、searchSourcing（1688 货源检索，数据源 `sources/sourcing.ts`：Onebound 万邦接口优先[env `ONEBOUND_KEY/SECRET`，适配器 `sources/onebound.ts`，真实单价/已售/回头率/详情链接+real_total_results 在售总数=供给端竞争信号，A 级证据] > 通用 HTTP[env `SOURCING_1688_API_URL/KEY`] > 降级直达搜索链接；推荐方向必配「1688 找货卡」：中文搜索词+链接+供应商筛选清单，禁止编造货源数据）、getSourcingDetail（1688 商品详情：阶梯价[测试期/放量期成本分开算]/起订量/产业带/供应商/SKU 数）、searchSourcingByImage（以图搜款：img_upload 换 imgid 再 item_search_img，未开通时友好降级为文字搜索）。Onebound 账号日配额约 10 次，onebound.ts 内置 globalThis 24h 缓存，提示词约束同词禁重复调用。决策闭环：趋势发现→机会推导→需求验证→经济测算→时机判断→风险审查→货源落地。模型：doubao-seed-2-0-pro-260215（提示词吸收 tiktok-agent-skills 方法论：口径声明开场、A/B/C 证据可信度分级标注[卡片 grade 字段前端渲染徽章]、数据事实与解读分离、不静默放宽条件、一次只问一个关键问题、不确定性独立成段、内容建议四段式[钩子/卖点/证明/CTA]）。SSE 事件协议：skill_start / skill_end / content / done / error。**可视化输出协议**（提示词约束，前端渲染）：`<chart>{JSON}</chart>` 渲染 ECharts 图表（line/bar/radar/pie，数据只能来自工具返回，source 字段必填）；`<cards>[{name,tag,reason,price,cost,keyword}]</cards>` 渲染选品方向卡（≥3 个方向：1 主推+其余次推/备选/观察，name 必填，price 建议定价带、cost 1688 参考成本、keyword 1688 找货词，前端渲染 1688 直达按钮；多候选时正文必须先给 Markdown 对比表）；`> 数据来源：…` 行渲染为来源脚注；图表数据禁止编造。前端 `ai-chat.tsx` 悬浮面板（右下角）：流式打字机渲染、Markdown 渲染（标题/分割线/有序无序列表/行内代码/管道表格真实表格化/来源脚注卡片）、parseBlocks 块解析（文本/chart/cards/流式占位）、Agent 执行步骤可视化（SKILL_ICONS 按技能映射图标）、跨 chunk SSE 行缓冲。
5. **主图工作台**（`/image-studio` + `src/lib/image-studio.ts` + `/api/image/*`）：AI 拆解主图视觉结构（多模态 LLM 输出元素归一化 bbox），画布拖拽标记框重排布局（也可一键打乱/增删/改文案）。生成链路为两段式：①`produceCreativeBrief` 广告制作 Agent（15 年电商广告总监人设，temperature 0.7）产出 Listing 视觉策划案 CreativeBrief——目标人群/核心卖点/传播钩子 + 4 个镜头的拍摄清单（hero 首图定调/proof 卖点实证/scene 使用场景/detail 细节特写，SHOT_ROLE_META 五色职能标签，用户可编辑/增删/换一版），再以原图为参考按清单批量图生图（4K、无水印、硬性无文字）；prompt 带商业边界控制（产品绝对主角、hero 占比≥50%、其余≥1/3、场景道具只为卖点服务、拒绝文艺片松散构图）；②多角度衍生 `remixAngles`：对满意的镜头图二次图生图（参考图=选中生成图，保持场景连贯），输出微距特写/俯拍陈列/平视瞬间/远景氛围 4 个机位。元素六类型：product/background/prop/text/badge/decor。解析与策划模型 doubao-seed-2-0-pro-260215，生成模型 doubao-seedream-5-0（平台最新）。上传图片经内存仓库 `image-store.ts` 换公网 URL 供图生图回源；参考图 origin 优先取 `COZE_PROJECT_DOMAIN_DEFAULT`（host 头可能是内网地址或带端口后缀的预览域名，生成服务外部回源会失败），host 仅作本地兜底。bbox 清洗规则：先夹取 [0,1] 再丢弃零面积框（模型偶发越界坐标）。

6. **内容测试工作台**（`/testing` + `/api/tests*`）：选品后 7 天内容测试 SOP 产品化——创建测试任务（品名/1688词/盈亏平衡CPA/多条钩子，单变量原则）→ SOP 五阶段进度条（D0准备→D1-3投放→D4判定→D5-7放量→归档）→ 逐日录入 7 项指标（播放/完播/CTR/CPC/加购/CPA/消耗）→ 一键 SOP 判定（规则引擎 `src/lib/testing-sop.ts`：按展示量/消耗加权聚合 → 五维分级[CTR≥1.5%优秀/≥1%及格、完播≥30%/25%、CPC≤$0.3/0.5、加购≥10%/8%、CPA≤盈亏平衡×0.7安全] → 三选一决策[≥2条达标放量/单项短板优化重测≤2轮/CTR持续<1%止损，超$300预算红线强制止损] + 异常诊断[0播放换号/高完播低CTR换品/高CTR低加购查价格Listing]）。判定结论卡含依据明细+重测入口；任务卡显示预算进度条。内存仓库 `test-store.ts`（globalThis，含 1 个演示任务：V2/V3 双钩子达标→放量）。共享类型 `testing-types.ts`（THRESHOLDS/SOP_STAGES/HOOK_META）。

## 目录结构

```
├── public/products/        # AI 生成的商品演示图（6 类目 × 2）
├── src/
│   ├── app/
│   │   ├── page.tsx              # 市场趋势看板（客户端组件）
│   │   ├── products/page.tsx     # 选品库页面
│   │   ├── testing/page.tsx      # 内容测试工作台（列表 + 详情：进度条/指标表/逐日录入/判定卡）
│   │   ├── image-studio/page.tsx # 主图工作台（选图 → AI 解析 → 拖拽重排 → 生成）
│   │   ├── layout.tsx            # 根布局（挂载 AppShell）
│   │   └── api/
│   │       ├── products/route.ts         # GET 列表 / POST 新增 / DELETE 批量
│   │       ├── products/[id]/route.ts    # GET 详情 / DELETE 单个
│   │       ├── products/import/route.ts  # POST CSV 导入
│   │       ├── stats/route.ts            # GET 看板统计（选品库演示数据）
│   │       ├── trends/route.ts           # GET 真实趋势聚合
│   │       ├── tests/route.ts + tests/[id]/(route|metrics|judge)  # 内容测试 CRUD/指标录入/SOP判定（TikTok CC + Google Trends，maxDuration 300s，30min缓存）
│   │       ├── chat/route.ts             # POST AI Agent 对话（SSE 流式）
│   │       └── image/
│   │           ├── analyze/route.ts      # POST 主图结构解析（多模态，maxDuration 120s）
│   │           ├── brief/route.ts        # POST 广告策划案 CreativeBrief（maxDuration 120s）
│   │           ├── remix/route.ts        # POST 按拍摄清单批量图生图（maxDuration 300s）
│   │           ├── angles/route.ts       # POST 多角度衍生：选中镜头图 ×4 机位（maxDuration 300s）
│   │           └── file/route.ts + file/[id]/route.ts  # POST 上传 base64 / GET 读取（公网回源）
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
│   │   └── sources/              # 数据源适配器层（trends.ts 聚合 / apify.ts TikTok CC+Google Trends / calendar.ts / sourcing.ts，可插拔 Kalodata/EchoTik）
├── scripts/agent-smoke.ts        # Agent E2E 冒烟（pnpm tsx scripts/agent-smoke.ts）
├── scripts/apify-smoke.ts        # Apify 数据源直连冒烟（pnpm tsx scripts/apify-smoke.ts）
├── scripts/onebound-smoke.ts     # Onebound 1688 数据源冒烟（pnpm tsx scripts/onebound-smoke.ts，消耗 2 次/日配额）
├── scripts/image-studio-smoke.ts # 主图工作台 E2E 冒烟（pnpm tsx scripts/image-studio-smoke.ts）
├── scripts/trends-smoke.ts       # 趋势看板接口冒烟（pnpm tsx scripts/trends-smoke.ts，真实抓取约 30-120s）
│   └── lib/
│       ├── types.ts              # 全局类型（Product / ScoreResult / DashboardStats…）
│       ├── scoring.ts            # 评分引擎（维度加权 + 推荐理由生成）
│       ├── data.ts               # 28 个内置演示商品（确定性日销序列）
│       ├── store.ts              # 内存数据仓库（globalThis 挂载，HMR 安全）
│       ├── image-types.ts        # 主图结构共享类型（ImageElement/ImageStructure/TYPE_META，前后端通用）
│       ├── image-studio.ts       # 服务端核心：结构解析 + 方位词 prompt 构建 + 图生图
│       ├── image-resolve.ts      # 图片引用解析（data URI / 公网 URL / origin 推导）
│       ├── image-store.ts        # 上传图片内存仓库（globalThis 挂载）
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
- `pnpm tsx scripts/agent-smoke.ts`：Agent E2E；`pnpm tsx scripts/image-studio-smoke.ts`：主图工作台 E2E（analyze/remix 接口耗时 15~90s，超出 test_run curl 10s 上限，用脚本验证）
