# hermes-cn-webUI 开发进度

**最后更新**：2026-04-15（Phase 6-8 收尾）
**项目根目录**：`/Users/macbook/Desktop/hermes-ourmar`
**构建状态**：✅ 通过 (`tsc` + `vite build` 均成功)
**开发服务器**：✅ 运行中 `http://localhost:3000` (pid 25126)

---

## 宪法概要

项目基于 `CONSTITUTION.md`（v2.0.0），定义 16 个页面、8 个开发阶段，约 170-200 个源文件。

**核心原则**：
- 100% 功能映射：每个 WebUI 页面对应 Hermes Agent 一项能力
- React 18 + Vite + TypeScript + shadcn/ui + Tailwind CSS
- 状态管理：Zustand（全局）+ TanStack Query（服务端）
- 许可证：免费版(L1)限制 1 个子 Agent，专业版(L2) ¥1.9 永久解锁，企业版(L3)全部功能

**许可证等级**：
| 等级 | 名称 | 费用 | 功能 |
|------|------|------|------|
| L1 | 基础版 | 免费 | Sessions, Logs, Keys, Settings |
| L2 | 专业版 | ¥1.9 | Config, Skills, Tools, Memory, Cron, Browser |
| L3 | 企业版 | 付费 | Delegation, Gateway, Analytics, Terminal |

---

## 当前阻塞

### ✅ 无阻塞

`pnpm run build` 已通过，`pnpm dev` 开发服务器已在 `http://localhost:3000` 运行。

**（历史记录）** `Delegation.tsx` TypeScript 错误已于 2026-04-15 验证：**不复存在**。构建命令 `tsc && vite build` 成功，Delegation.tsx (542行) 无编译错误。

### ✅ 扫码登录功能（2026-04-16 新增）

| 变更 | 文件 | 说明 |
|------|------|------|
| 后端 WeChat QR | `server/routes/gateway.js` | `POST /weixin/qr/start` → 从 iLink API 获取 base64 PNG；`GET /weixin/qr/status` → 轮询 scan/confirmed；`POST /weixin/qr/cancel` |
| 后端 Feishu QR | `server/routes/gateway.js` | `POST /feishu/qr/start` → 设备码流程；`GET /feishu/qr/status` → 轮询授权状态；`POST /feishu/qr/cancel` |
| 前端弹窗 | `src/app/pages/gateway/Gateway.tsx` | 微信：直接显示 base64 PNG；飞书：用 `qrcode` npm 包将 URL 生成 canvas 二维码；每 1.5s 轮询状态 |
| 配置保存 | `server/routes/gateway.js` | WeChat 凭据保存至 `config.platforms.weixin.extra.{account_id,token,base_url}`；Feishu 凭据保存至 `config.platforms.feishu.extra.{app_id,app_secret}` |
| Config 修复 | `server/routes/gateway.js` | `platformConfig()` 改为优先读取 `config.platforms.{id}`（官方结构），兼容旧格式 |
| 包安装 | `package.json` | `qrcode@1.5.4` + `@types/qrcode@1.5.6` |

---

## 已完成的工作

### ✅ Phase 1 - 项目骨架（100% 完成）

| 文件/模块 | 状态 | 说明 |
|---------|------|------|
| `package.json` | ✅ | React 18, Vite 5, TypeScript, Express 4, Tailwind, shadcn/ui, TanStack Query v5, Zustand, React Router v6 |
| `vite.config.ts` | ✅ | 端口 3000，代理 `/api`, `/v1`, `/ws` → `http://127.0.0.1:3001` |
| `src/app/App.tsx` | ✅ | 16 个路由全部注册，TanStack Query Provider 包裹 |
| `src/app/layout/MainLayout.tsx` | ✅ | Sidebar + Header + `<Outlet>` 布局 |
| `src/components/layout/Sidebar.tsx` | ✅ | 16 个导航项，LicenseGate 包裹 |
| `src/components/layout/Header.tsx` | ✅ | 头部组件 |
| `src/features/license/LicenseGate.tsx` | ✅ | 三级许可证门控组件 (L1/L2/L3) |

### ✅ Phase 1 - 16 个页面文件（全部存在，内容充实）

| 页面 | 文件 | 行数 | 状态 | 说明 |
|-----|------|------|------|------|
| 状态看板 `/` | `pages/dashboard/Dashboard.tsx` | 267 | ✅ | `hermes status` + `hermes doctor` 集成 |
| 会话管理 `/sessions` | `pages/sessions/Sessions.tsx` | 242 | ✅ | state.db + FTS5搜索 + 分页抽屉 |
| 用量分析 `/analytics` | `pages/analytics/Analytics.tsx` | 211 | ✅ | Recharts图表 + Token统计 |
| 系统日志 `/logs` | `pages/logs/Logs.tsx` | 111 | ✅ | xterm.js + WebSocket流 |
| 定时任务 `/cron` | `pages/cron/Cron.tsx` | 621 | ✅ | 自然语言→Cron转换 |
| 技能管理 `/skills` | `pages/skills/Skills.tsx` | 406 | ✅ | 开关/导入/导出 |
| 配置中心 `/config` | `pages/config/Config.tsx` | 473 | ⚠️ | LicenseGate就位，有TODO标记 |
| 密钥管理 `/keys` | `pages/keys/Keys.tsx` | 109 | ⚠️ | 掩码+测试按钮，测试为占位 |
| 内存管理 `/memory` | `pages/memory/Memory.tsx` | 131 | ⚠️ | 搜索/重建，但用mock数据 |
| 工具调用 `/tools` | `pages/tools/Tools.tsx` | 144 | ✅ | MCP服务器按钮为占位 |
| 浏览器控制 `/browser` | `pages/browser/Browser.tsx` | 912 | ✅ | Playwright 集成（chromium.launch() 等真实 API）|
| 终端界面 `/terminal` | `pages/terminal/Terminal.tsx` | 97 | ✅ | xterm.js PTY |
| 消息网关 `/gateway` | `pages/gateway/Gateway.tsx` | 350+ | ✅ | **14平台**网格（telegram/discord/slack/whatsapp/signal/feishu/wecom/dingtalk/weixin/email/sms/homeassistant/matrix/mattermost）+ Gateway进程控制（启动/停止/热重启）+ 平台配置面板（每个平台独立字段）+ PUT /api/gateway/:id |
| 子Agent委派 `/delegation` | `pages/delegation/Delegation.tsx` | 542 | ⚠️ | LicenseGate就位，TS无错误 |
| 对话界面 `/chat` | `pages/chat/Chat.tsx` | 430+ | ✅ | SSE流式 + Markdown渲染 + **斜杠命令面板**（/help /clear /model /tools /session，键盘↑↓导航，Enter执行，Escape关闭，外部点击关闭）+ 工具调用卡片 + 复制按钮 |
| 系统设置 `/settings` | `pages/settings/Settings.tsx` | 380+ | ✅ | 许可证激活（L1/L2 ¥1.9/L3 三级）+ 主题/语言切换 + 购买链接（¥1.9 永久专业版）+ 关于信息完整 |

### ✅ Phase 1 - 后端路由（15个，全部注册）

| 路由文件 | 端点 | 行数 | 状态 |
|---------|------|------|------|
| `server/index.js` | 主入口 | ~50 | ✅ 15路由+2 WebSocket |
| `server/routes/status.js` | `/api/status` | ~300 | ✅ 真实hermes status |
| `server/routes/sessions.js` | `/api/sessions` | ~350 | ✅ state.db集成 |
| `server/routes/analytics.js` | `/api/analytics/usage` | 316 | ✅ Recharts数据 |
| `server/routes/tools.js` | `/api/tools` | 28 | ⚠️ mock数据 |
| `server/routes/skills.js` | `/api/skills` | ~200 | ✅ 真实读写 |
| `server/routes/config.js` | `/api/config` | ~350 | ✅ 真实YAML读写 |
| `server/routes/keys.js` | `/api/keys` | ~200 | ✅ 掩码+测试 |
| `server/routes/memory.js` | `/api/memory` | 32 | ⚠️ mock数据 |
| `server/routes/browser.js` | `/api/browser` | 387 | ✅ Playwright 真实浏览器控制 |
| `server/routes/cron.js` | `/api/cron` | 337 | ✅ 真实CRUD |
| `server/routes/gateway.js` | `/api/gateway` | ~200 | ✅ 多平台配置 |
| `server/routes/delegation.js` | `/api/delegation` | ~250 | ✅ 子Agent管理 |
| `server/routes/chat.js` | `/v1/chat/completions` | ~400 | ✅ SSE流式 |
| `server/routes/license.js` | `/api/license/*` | 22 | ✅ 内存存储 |
| `server/routes/system.js` | `/api/system` | 85 | ✅ 主题/语言 |
| `server/ws/logs.js` | `/ws/logs` | 49 | ✅ 日志流 |
| `server/ws/terminal.js` | `/ws/terminal` | ~150 | ✅ PTY转发 |

---

## 已验证的页面内容

**Dashboard.tsx**（267行，完全实现）：
- 4个状态卡片：Sessions、Memory、Tools、Skills
- `hermes status` 集成（后端 `server/routes/status.js`）
- `hermes doctor` 健康检查卡片
- 最近活动时间列表
- 系统统计面板（Provider、Model、Context Window）

**Sessions.tsx**（242行，完全实现）：
- `hermes state.db` 集成（后端读取真实SQLite）
- FTS5全文搜索
- 分页会话列表
- 会话详情抽屉（时间、Token用量、工具调用记录）

**Analytics.tsx**（211行，完全实现）：
- Recharts面积图（每日Token趋势）
- 柱状图（各模型用量对比）
- 饼图（Token类型分布）
- 成本统计卡片

**Cron.tsx**（621行，完全实现）：
- 自然语言描述 → Cron表达式转换
- cron任务 CRUD（列表/创建/编辑/删除）
- 定时调度配置
- 自然语言→cron解析API调用

**Skills.tsx**（406行，完全实现）：
- 技能列表展示（按分类）
- 启用/禁用开关
- 技能导入（拖放SKILL.md）
- 技能导出

**Logs.tsx**（111行，完全实现）：
- xterm.js终端组件
- WebSocket日志流 (`/ws/logs`)
- 日志级别过滤（INFO/WARN/ERROR）
- 自动滚动+暂停

**Terminal.tsx**（97行，完全实现）：
- xterm.js PTY终端
- WebSocket连接到 `/ws/terminal`
- 命令输入+输出回显

**Gateway.tsx**（350+行，完全实现）：
- 14平台网格（telegram/discord/slack/whatsapp/signal/feishu/wecom/dingtalk/weixin/email/sms/homeassistant/matrix/mattermost）
- 每个平台独立配置字段（token/secret/webhook URL 等）
- Gateway进程控制（Play启动/Square停止/RefreshCw热重启）
- 平台启用/禁用切换（Power按钮）
- 实时PID和在线状态显示

**Chat.tsx**（430+行，完全实现）：
- SSE流式对话（OpenAI兼容 EventSourceParser 解析）
- Markdown渲染（react-markdown + remark-gfm）+ 代码语法高亮
- **斜杠命令面板**（`/help` `/clear` `/model` `/tools` `/session`，键盘↑↓导航，Enter执行，Escape关闭，外部点击关闭）
- 工具调用展示（折叠卡片）
- Stop Generation按钮（AbortController）
- 会话历史侧边栏（localStorage 持久化）
- 复制按钮（useClipboard）

**Delegation.tsx**（542行，框架完整）：
- SubAgent卡片网格（最多3个）
- 任务分发表单（目标/工具集/模型选择）
- AgentSettingsModal配置弹窗
- 并行执行+状态管理

---

## 待完成的工作

### 🔴 最高优先级

无重大阻塞。

### ⚠️ 次高优先级

- [x] **Settings.tsx 许可证数据源统一**
  - Settings.tsx 现在使用 `/api/license` (via `useQuery<LicenseInfo>`) 显示许可证状态，与 LicenseGate.tsx 一致
  - 移除了 `/api/system` 返回中的 `license` 字段，消除了两个独立 license store 的不一致
  - 激活成功后 `invalidateQueries({ queryKey: ['license'] })` 确保 UI 立即刷新
  - `LicenseInfo` 接口统一从 LicenseGate.tsx 导入
- [ ] Settings.tsx 与真实许可证服务器对接

### 📋 Phase 4-7 细化

#### Phase 4（配置、密钥）

- [x] `Config.tsx` React Hook Form + Zod + YAML编辑框架 — 有473行内容
- [x] `Keys.tsx` 密钥表单+连接测试框架 — 有109行内容
- [ ] Config/Keys 与真实Hermes CLI `.env`/config.yaml 写入对齐

#### Phase 5（内存、工具、浏览器）

- [x] `Memory.tsx` 记忆列表+FTS5搜索+清理框架 — 有131行内容
- [x] `Tools.tsx` 工具列表+开关+MCP配置框架 — 有144行内容
- [ ] Memory.tsx 对接真实 `~/.hermes/memory.db` FTS5
- [ ] Tools.tsx MCP服务器按钮接入真实 `hermes tools` 命令
| [x] **Browser.tsx** 真实 Playwright 集成 ✅ |

#### Phase 6（终端、网关、子Agent）

- [x] `Terminal.tsx` xterm.js PTY（WebSocket）— 有97行内容
- [x] `Gateway.tsx` 多平台接入配置 — 有161行内容
- [x] `Delegation.tsx` 修复后完善 — 有542行内容
- [ ] Terminal.tsx 对接真实 `hermes terminal` PTY
- [ ] Gateway 各大平台真实连接测试

#### Phase 7（对话、设置）

- [x] `Settings.tsx` 许可证激活（L1/L2 ¥1.9/L3）+ 主题/语言 + 购买链接 ✅
- [x] `Chat.tsx` SSE流式+Markdown+工具调用+**斜杠命令面板** ✅

#### Phase 8（测试、文档）

- [x] **ESLint + Prettier 配置** ✅（ESLint 9 + typescript-eslint 8 + react-hooks 5，0 errors，107 warnings）
- [ ] 单元测试 ≥60% 覆盖
- [x] **README.md 本地运行指南** ✅
- [ ] CI/CD 流水线

---

## 启动命令

```bash
cd /Users/macbook/Desktop/hermes-ourmar

# 安装依赖
pnpm install

# 构建（✅ 已通过）
pnpm run build

# 开发模式（✅ 运行中 http://localhost:3000）
pnpm dev

# 后端服务
node server/index.js
```

---

## 已知问题

---

## 宪法章节摘要

| 章节 | 内容 |
|-----|------|
| 第一章 | 项目定义（16 页面映射 Hermes Agent 能力） |
| 第二章 | 功能映射表（16 页面 × 详细功能点） |
| 第三章 | 技术栈（React+Vite+TS+shadcn/ui+Zustand+TanStack Query+xterm.js+Recharts） |
| 第四章 | 许可证（L1基础免费/L2专业¥1.9/L3企业付费） |
| 第五章 | 质量标准（ESLint/Prettier、测试 ≥60%、性能指标） |
| 第六章 | 8 阶段开发规划（约 170-200 文件） |
| 第七章 | 宪法修订程序 |
| 附录 A | 能力清单速查表 |
