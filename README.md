# Hermes-Ourmar

[![CI](https://github.com/USER/hermes-ourmar/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/hermes-ourmar/actions/workflows/ci.yml)
[![E2E](https://github.com/USER/hermes-ourmar/actions/workflows/e2e.yml/badge.svg)](https://github.com/USER/hermes-ourmar/actions/workflows/e2e.yml)

全平台消息网关 + AI 终端 Web UI。

## 架构

```
hermes-ourmar/
├── src/app/pages/          # 9 大功能页面（Chat、Terminal、Delegation、Gateway、Models、Keys、Settings、Analytics、Browser）
├── server/                 # Express 4 后端（端口 3001）
│   ├── routes/             # API 路由（chat、delegation、gateway、keys、sessions）
│   └── ws/                 # WebSocket 终端（node-pty + xterm.js）
└── hermes-agent/           # Hermes Agent CLI（~/.hermes/hermes-agent/）
```

## 技术栈

- **前端**：React 18 + Vite + TypeScript + shadcn/ui + Tailwind CSS + Zustand + TanStack Query + xterm.js + Recharts
- **后端**：Express 4（端口 3001）+ Hermes Agent CLI（端口 3001 代理）
- **前端 dev server**：Vite（端口 3000），`/api` → 3001，`/ws` → ws://127.0.0.1:3001

## 本地运行

### 前置条件

- Node.js 20+
- pnpm 8+
- **Hermes Agent**（独立安装，不在本仓库内）— 安装方式见下方「Hermes Agent 安装」
- `~/.hermes/config.yaml`（Hermes Agent 配置，首次运行会自动引导）

### Hermes Agent 安装

Hermes Agent 是独立项目，安装在 `~/.hermes/hermes-agent/`（宿主目录，非本仓库）：

```bash
# 方式一：官方安装脚本
curl -s https://raw.githubusercontent.com/a16z-infra/ai-town/main/scripts/setup-hermes.sh | bash

# 方式二：手动 clone
git clone https://github.com/your-org/hermes-agent.git ~/.hermes/hermes-agent
cd ~/.hermes/hermes-agent && source venv/bin/activate && pip install -e .

# 验证安装
python3 ~/.hermes/hermes-agent/cli.py --query "你好"
```

> **注意**：如果你只需要 Web UI 的前端部分（聊天、终端、网关管理），不需要 Hermes Agent 也能启动。但 AI 对话功能需要 Agent 支持。

### 步骤

```bash
# 安装依赖
pnpm install

# 启动前端（端口 3000）+ 后端（端口 3001）
pnpm dev

# 或分别启动
pnpm dev:server   # 后端 3001
pnpm dev          # 前端 3000（Vite dev server）
```

### 配置 Hermes Agent

确保 `~/.hermes/config.yaml` 存在且包含至少一个平台的 API key。首次运行：

```bash
# 配置 Hermes Agent
python3 ~/.hermes/hermes-agent/cli.py setup

# 验证 CLI 可用
python3 ~/.hermes/hermes-agent/cli.py --query "你好"
```

### 环境变量（可选）

```bash
cp .env.example .env
# 编辑 .env 填入 API keys
```

## 功能页面

| 页面 | 路径 | 说明 |
|------|------|------|
| Chat | `/` | AI 对话、SSE 流式响应、斜杠命令（`/help` `/clear` `/model` `/tools` `/session`） |
| Terminal | `/terminal` | 浏览器内 PTY 终端（WebSocket + node-pty） |
| Delegation | `/delegation` | 子任务拆分与并行执行（map-reduce） |
| Gateway | `/gateway` | 14 平台消息网关启停管理（Telegram/Discord/Slack/飞书/企业微信/钉钉/WhatsApp/Signal/Email/SMS/Home Assistant/Matrix/Mattermost/微信） |
| Models | `/models` | 模型切换（provider/model） |
| Keys | `/keys` | API Keys 管理 |
| Settings | `/settings` | 主题、语言、关于 |
| Analytics | `/analytics` | 使用统计（会话数/消息数/令牌数/成本） |
| Browser | `/browser` | 无头浏览器自动化（Browserbase） |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息（SSE 流式响应） |
| GET | `/api/chat/sessions` | 获取会话列表 |
| DELETE | `/api/chat/sessions` | 删除会话 |
| POST | `/api/delegation/tasks` | 创建子任务 |
| GET | `/api/delegation/tasks/:id` | 查询子任务状态 |
| GET | `/api/gateway` | 获取网关状态（14 平台） |
| POST | `/api/gateway/start` | 启动 Gateway |
| POST | `/api/gateway/stop` | 停止 Gateway |
| POST | `/api/gateway/restart` | 热重启 Gateway |
| PUT | `/api/gateway/:platformId` | 更新平台配置 |
| GET | `/api/keys` | 获取密钥列表 |
| POST | `/api/keys` | 添加密钥 |
| DELETE | `/api/keys/:id` | 删除密钥 |
| GET | `/api/logs` | 获取日志 |
| GET | `/api/analytics` | 获取使用统计 |
| WS | `/ws/terminal` | PTY WebSocket 终端 |

## 辅助脚本

### 全局命令（推荐）

项目提供了两个版本的跨平台脚本：

#### Node.js 版本（推荐，跨平台）

```bash
# 方式1: 直接运行
node hermes-cnweb.js start

# 方式2: 链接为全局命令（推荐）
ln -sf ~/path/to/hermes-cn-webui/hermes-cnweb.js /usr/local/bin/hermes-cnweb
hermes-cnweb start    # 启动前端 3000 + 后端 3001
hermes-cnweb stop     # 停止所有服务
hermes-cnweb restart  # 重启所有服务
```

#### Bash 版本（仅 macOS/Linux）

```bash
# 仅 macOS/Linux 可用
./hermes-cnweb start
```

#### Windows 用户

Windows 可使用 Node.js 版本，或在 Git Bash / WSL 环境中使用 Bash 版本。

### 传统脚本

```bash
# 一键启动/停止/重启（前后端）
./scripts/start-all.sh    # 启动前端 3000 + 后端 3001
./scripts/stop-all.sh     # 停止所有服务
./scripts/restart-all.sh  # 重启所有服务

# 单独管理后端
./scripts/start-backend.sh
./scripts/stop-backend.sh
./scripts/restart-backend.sh

# 单独管理前端
./scripts/start-frontend.sh
./scripts/stop-frontend.sh
./scripts/restart-frontend.sh
```

### 一键部署到服务器

#### Linux 服务器一键部署

```bash
# 方式1: 远程执行（推荐）
curl -s https://raw.githubusercontent.com/417517338-sketch/hermes-cn-webUI/master/scripts/deploy.sh | bash

# 方式2: 下载后执行
curl -sO https://raw.githubusercontent.com/417517338-sketch/hermes-cn-webUI/master/scripts/deploy.sh
chmod +x deploy.sh
./deploy.sh

# 方式3: 使用 Node.js 版本（跨平台）
node scripts/deploy.js
```

部署选项：
- 安装目录: `/opt/hermes-cn-webui`（可通过 `INSTALL_DIR` 环境变量修改）
- 分支: `master`（可通过 `BRANCH` 环境变量修改）
- 自动配置 systemd 服务（root 用户）
- 自动安装 Node.js 依赖

> 注意：这些脚本需要先确保 Hermes Agent 已正确安装（见上方「Hermes Agent 安装」）。

## 开发

```bash
# 代码检查
pnpm run lint     # ESLint（0 errors）

# 格式化
pnpm run format   # Prettier

# 测试
pnpm test         # Vitest

# 构建
pnpm run build    # 生产构建（tsc + Vite）
```
