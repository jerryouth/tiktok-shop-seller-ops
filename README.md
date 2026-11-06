# TikTok Shop 跨境电商选品运营后台

面向 TikTok 跨境卖家的选品决策辅助工具，全中文界面。包含选品库管理、智能选品评分、市场趋势看板、AI 选品 Agent 四大模块。

## 功能特性

- **选品库**：商品表格（图片/名称/类目/售价/销量/评分/7日增幅/上架时间/选品评分）、关键词防抖搜索、多维组合筛选、6 字段排序、分页、批量删除、新增商品、CSV 批量导入、商品详情抽屉（雷达图 + 近 14 天销量 + 推荐理由）
- **智能评分**：热度 25% + 利润 25% + 销量 20% + 竞争 15% + 增长 15% 加权计算 0-100 分，≥85 标注「潜力爆款」，自动生成中文推荐理由
- **趋势看板**：统计卡片、热销品类条形图、14 天销量折线、飙升商品榜、评分分布饼图
- **AI 选品 Agent**：自然语言对话选品，ReAct 多跳推理（协议式工具调用），6 个 Skill（商品检索/详情/类目洞察/市场大盘/商品对比/联网趋势），可实时检索 TikTok 全网趋势信号并与库内商品交叉分析

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · ECharts 6

## 本地快速开始

### 环境要求

- Node.js >= 20（推荐 22/24）
- pnpm >= 9（`npm i -g pnpm`）

### 启动

```bash
# 1. 克隆仓库
git clone https://github.com/jerryouth/tiktok-shop-seller-ops.git
cd tiktok-shop-seller-ops

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器（标准 Next.js 开发模式，支持热更新）
pnpm next dev
```

浏览器打开 **http://localhost:3000** 即可访问。

> 仓库中的 `pnpm dev` / `pnpm build` / `pnpm start` 脚本是云端部署环境专用（含沙箱端口与打包逻辑），本地请直接使用 `pnpm next dev`。

### 本地生产构建

```bash
pnpm next build
pnpm next start   # 默认 http://localhost:3000
```

## 环境差异说明

| 功能 | 本地开发 | 云端部署 |
|---|---|---|
| 选品库 / 筛选 / 导入导出 | ✅ 完全可用 | ✅ |
| 智能评分 / 趋势看板 | ✅ 完全可用 | ✅ |
| AI 对话选品 | ⚠️ 自动降级提示 | ✅ 需云端注入的 AI 凭证 |
| 联网趋势检索 | ⚠️ 自动降级提示 | ✅ |

AI 相关能力（`/api/chat`）依赖云端运行时注入的 `COZE_*` 系列凭证；本地环境未检测到凭证时接口会返回友好提示而非报错，其余功能不受影响。

## 数据说明

- 当前为**内存演示数据**：28 个典型 TikTok Shop 商品（美妆/家居/服饰/数码/母婴/运动 6 大类目），服务重启后重置
- 对接真实数据：仅需替换 `src/lib/store.ts` 的数据读写实现（保持函数签名不变），评分引擎、API 路由与前端无需改动
- 趋势数据源为适配器架构（`src/lib/agent/sources/trends.ts`），当前为 WebSearch 实现，可插拔扩展 Kalodata / EchoTik 等平台

## 常用命令

```bash
pnpm ts-check                          # TypeScript 静态检查
pnpm lint                              # ESLint 检查
pnpm tsx scripts/agent-smoke.ts        # Agent 端到端冒烟（需云端 AI 凭证）
```

## 项目结构

```
src/
├── app/
│   ├── page.tsx                  # 市场趋势看板
│   ├── products/page.tsx       # 选品库
│   └── api/                    # products / stats / chat(SSE Agent)
├── components/                 # app-shell / ai-chat / echart / 业务组件 + shadcn/ui
└── lib/
    ├── scoring.ts              # 评分引擎（维度加权 + 推荐理由生成）
    ├── store.ts                # 内存数据仓库（globalThis，HMR 安全）
    ├── data.ts                 # 演示商品数据
    └── agent/                  # Agent：runner(ReAct循环) + skills + prompts + 趋势数据源
scripts/
└── agent-smoke.ts              # Agent E2E 冒烟脚本
```
