# hermes-cn-webUI 项目宪法

**基于 Hermes Agent v0.8.0 官方技术文档重构**
版本：3.0.0
最后修订：2026-04-17

---

## 完全开源声明

本项目**完全开源**，遵循 **MIT 协议**，无任何专有组件或付费功能。

所有功能对所有用户开放，无需注册、激活或订阅。

---

## 序言

本宪法为 hermes-cn-webUI 项目的最高指导文件，定义了项目的功能边界、模块划分、技术约束与质量标准。所有开发决策、功能增删、架构调整均需遵循本宪法。

**核心原则：**
- **100% 功能映射**：WebUI 的每一个页面、每一个组件，必须直接对应 Hermes Agent 的一项可调用能力。
- **官方能力优先**：优先暴露官方已稳定支持的功能，实验性功能需明确标注。
- **管理控制台定位**：WebUI 是 Agent 的"驾驶舱"，而非替代 Agent 本身的 CLI 交互界面。
- **完全开源**：所有功能默认开放，无许可证检查、无付费墙、无激活限制。

---

## 第一章：项目定义与范围

### 1.1 项目名称

hermes-cn-webUI —— Hermes Agent 中文 Web 管理控制台

### 1.2 项目定位

为 Hermes Agent（Nous Research 官方版） 提供一个功能完整、界面美观、开箱即用的 **图形化管理后台**。用户无需记忆 CLI 命令，即可完成 Agent 的全生命周期管理：配置、监控、会话追溯、技能编排、记忆维护、网关接入与任务调度。

### 1.3 核心目标

| 目标 | 说明 |
|------|------|
| 功能全覆盖 | 覆盖 Hermes Agent 官方全部 6 大能力域（终端、记忆、技能、工具、网关、任务） |
| 实时可观测 | 状态看板、日志流、用量图表均支持实时更新 |
| 配置可视化 | 所有 config.yaml /.env 配置项均提供表单化编辑界面 |
| 暗色主题优先 | 与 Hermes 官方 TUI 的 display.skin 风格保持一致 |

### 1.4 关联项目

- **后端依赖**：Hermes Agent v0.8.0+（运行于 `hermes gateway start` 模式）
- **数据存储**：`~/.hermes/state.db`（SQLite，由 Agent 直接管理，WebUI 只读或通过 API 操作）

---

## 第二章：对话模式

### 2.1 两种对话模式

本项目支持两种对话模式：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **普通模式**（默认） | 前端直接调用底层模型 API（不经过 Agent 层），用于快速响应简单对话 | 简单问答、闲聊、快速获取答案 |
| **Agent 模式** | 启用工具调用、多步推理等高级能力，适用于需要外部工具或复杂任务的场景 | 需要搜索、计算、代码执行等工具能力的任务 |

### 2.2 普通模式

- 请求发送至 `/api/chat/direct`（或类似无 Agent 的端点）
- 流式输出保持原有体验
- 无工具调用，纯模型响应
- 默认开启，用户可随时切换

### 2.3 Agent 模式

- 请求发送至 `/api/chat/completions`（完整 Agent 能力）
- 启用 40+ 内置工具 + MCP 扩展工具
- 支持工具调用展示、多步推理
- 用户手动切换

### 2.4 模式切换 UI

- 前端增加模式切换开关（如 Toggle）
- 默认普通模式
- 开关放置在对话界面顶部（模型选择器旁边）
- 切换模式后，后续消息使用对应模式的端点

---

## 第三章：功能模块全景映射

本章是宪法的核心，明确 **Agent 能力 → WebUI 页面** 的一一映射关系。

### 3.1 模块总览表

| 序号 | WebUI 页面 | 路由 | 对应 Agent 能力 | 数据来源 |
|------|-----------|------|-----------------|---------|
| 1 | 状态看板 | `/` | `hermes status`、`hermes doctor` | API: `/api/status` |
| 2 | 对话界面 | `/chat` | Agent 对话能力（OpenAI 兼容 API） | HTTP Stream: `/v1/chat/completions` |
| 3 | 会话管理 | `/sessions` | 跨会话记忆存储（state.db 查询） | API: `/api/sessions` |
| 4 | 用量分析 | `/analytics` | Token 用量统计（`/usage` 命令） | API: `/api/analytics/usage` |
| 5 | 系统日志 | `/logs` | Agent 运行日志流 | WebSocket: `/api/logs/stream` |
| 6 | 定时任务 | `/cron` | `hermes schedule` 自然语言定时任务 | API: `/api/cron` |
| 7 | 技能管理 | `/skills` | 技能系统（agentskills.io 标准） | API: `/api/skills` |
| 8 | 配置中心 | `/config` | `~/.hermes/config.yaml` 全量配置 | API: `/api/config` |
| 9 | 密钥管理 | `/keys` | `~/.hermes/.env` 中的 API Key | API: `/api/keys` |
| 10 | 内存管理 | `/memory` | 持久化记忆（FTS5 向量检索） | API: `/api/memory` |
| 11 | 工具调用 | `/tools` | 40+ 内置工具 + MCP 扩展工具 | API: `/api/tools` |
| 12 | 终端界面 | `/terminal` | 6 种终端后端（local/docker/ssh等） | WebSocket: `/api/terminal` |
| 13 | 消息网关 | `/gateway` | 多平台接入（飞书/微信/Telegram等） | API: `/api/gateway` |
| 14 | 子 Agent 委派 | `/delegation` | 并行子代理（最多 3 个） | API: `/api/delegation` |
| 15 | 系统设置 | `/settings` | 主题切换、全局偏好 | API: `/api/settings` + 本地存储 |
| 16 | 系统维护 | `/startup` | Gateway 启动、配置急救、更新检查 | API: `/api/startup` |

### 3.2 详细功能映射表

#### 3.2.1 状态看板 (`/`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| `hermes status` | 运行状态卡片 | PID、运行时长、版本号 |
| `hermes doctor` | 环境健康检查面板 | 各依赖项状态（Python、内存、网络等） |
| 当前模型信息 | 模型信息卡片 | 模型名称、Provider、上下文窗口 |
| 活跃会话数 | 统计卡片 | 当前 Gateway 连接数 |
| 终端后端状态 | 后端状态指示器 | local/docker/ssh 等连接状态 |
| 消息网关连接状态 | 平台连接状态列表 | Telegram/Discord/Slack 等在线状态 |

#### 3.2.2 对话界面 (`/chat`)

| Agent 能力项 | WebUI 展示组件 | 交互说明 |
|------------|--------------|---------|
| Agent 对话 | 聊天 UI | **始终可用**。支持 Markdown 渲染、代码高亮、数学公式（KaTeX）。 |
| 流式输出 | SSE 解析 | **始终可用**。逐字显示 Agent 回复，支持中途停止生成。 |
| 上下文引用（@ 语法） | 提及组件 | **始终可用**。输入 `@` 触发文件/会话/记忆建议列表，支持 `@file.py`、`@session:xxx`、`@memory:xxx` 等引用。 |
| 斜杠命令 | 命令面板 | **始终可用**。输入 `/` 弹出命令菜单，支持所有命令（`/help`、`/clear`、`/model`、`/usage`、`/tools`、`/skills`、`/delegation`、`/export`、`/session` 等）。 |
| 工具调用展示 | 折叠卡片 | **始终可见**。Agent 调用工具时，对话区域内嵌可折叠卡片，展示工具名称、参数和返回结果摘要。 |
| 语音输入 | 麦克风按钮 | **始终可用**。调用浏览器语音识别 API，支持中文/英文。 |
| 对话导出 | 导出按钮 | **始终可用**。支持导出为 Markdown、PDF、JSON 格式。 |
| 会话上下文管理 | 上下文进度条 | **始终可见**。显示当前会话已用 Token / 模型最大上下文。 |
|| 模式说明 | 模式切换开关 | **始终可见**。对话界面顶部提供「普通模式」与「Agent 模式」切换按钮，说明如下：<br>**普通模式**：前端直连模型 API（不经 Agent 层），响应快，适合简单问答、闲聊、无需工具的快速获取答案场景。<br>**Agent 模式**：请求经 Agent 层处理，启用 40+ 内置工具 + MCP 扩展，支持工具调用、多步推理、复杂任务自动化执行。<br>默认普通模式，用户可随时手动切换。当前模式在输入框上方有明显标识。 |
| 对话分支 | 分支选择器 | **始终可用**。支持从任意消息重新生成，创建对话分支，可切换查看不同分支。 |

> **交互原则**：对话界面是用户的核心交互入口。所有功能默认对所有用户开放，无需任何激活或注册。

#### 3.2.3 会话管理 (`/sessions`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| state.db 会话记录 | 会话列表（Table） | 时间、摘要、消息数、Token 消耗 |
| FTS5 全文搜索 | 搜索框 | 支持跨会话内容检索 |
| 会话详情 | 抽屉/侧边面板 | 完整对话历史、工具调用记录 |
| 会话删除/归档 | 操作按钮 | 调用 Agent 记忆管理 API |

#### 3.2.4 用量分析 (`/analytics`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| Token 用量统计 | Recharts 折线图 | 30 天趋势、按模型拆分 |
| Cache 命中率 | 饼图/指标卡 | 读/写缓存比例 |
| 费用估算 | 统计卡片 | 基于模型定价计算（支持自定义单价） |
| 模型用量明细 | 表格 | 各模型调用次数、Token 数、费用 |
| `/usage` 命令输出 | 实时用量快照 | 当前会话累计用量 |

#### 3.2.5 系统日志 (`/logs`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| Agent 运行日志 | xterm.js 终端模拟器 | 实时流式输出 |
| 日志级别切换 | Segmented 控件 | ERROR/WARN/INFO/DEBUG |
| 日志过滤 | 输入框 | 按关键词、来源过滤 |
| 日志导出 | 下载按钮 | 导出为 .log 文件 |

#### 3.2.6 定时任务 (`/cron`)

| Agent 能力项 | WebUI 展示组件 | 交互说明 |
|------------|--------------|---------|
| `hermes schedule` | 任务列表 | **始终可见**。展示已创建的定时任务（任务名称、Cron 表达式、下次执行时间）。 |
| 自然语言转 Cron | 输入框 + 转换按钮 | **始终可用**。输入框可正常输入文字，点击转换可预览转换结果，创建任务按钮可正常操作。 |
| 任务 CRUD | 表单弹窗 | **创建/编辑/删除按钮始终可操作**。 |
| 执行历史 | 子表格 | **始终可见**。展示历次执行时间、状态、日志摘要。 |

> **交互原则**：定时任务所有功能对所有用户开放，无需任何激活检查。

#### 3.2.7 技能管理 (`/skills`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| 内置技能列表 | 卡片网格 / 表格 | 97+ 官方技能（agentskills.io 格式） |
| 技能分类分组 | Tabs / Tree | 按功能域分类（编码、写作、分析等） |
| 启用/禁用技能 | Switch 开关 | 调用技能开关 API |
| 技能详情 | 侧边面板 | 技能描述、参数、示例 |
| 技能导入 | 上传按钮 | 支持 .skill.md 文件上传 |

#### 3.2.8 配置中心 (`/config`)

| Agent 能力项 | WebUI 展示组件 | 交互说明 |
|------------|--------------|---------|
| config.yaml 全量配置 | 分组表单（React Hook Form） | **始终可编辑**。所有配置项以表单形式完整展示。 |
| 配置验证 | Zod Schema 校验 | **始终可见**。实时校验规则，若当前配置存在错误，以红色边框标注并显示错误信息。 |
| YAML 导入/导出 | CodeMirror 编辑器 | **导入/导出均始终可用**。 |
| 配置迁移 | 按钮 | **始终可用**。调用 `hermes config migrate`。 |
| `hermes config list` | 当前配置预览 | **始终可见**。以只读表格展示关键配置项的当前值。 |

> **交互原则**：配置中心所有内容对所有用户**完全可编辑**，无需任何激活检查。

#### 3.2.9 密钥管理 (`/keys`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| `.env` 中的 API Key | 加密输入框 | 支持 OpenAI、Anthropic、OpenRouter、自定义端点等 13+ 种 Provider |
| 一键跳转申请 | 外链按钮 | 跳转到各 Provider 的 Key 申请页面 |
| 连接测试 | 测试按钮 | 验证 Key 是否有效 |
| 权限掩码 | 文件权限提示 | 提示 .env 应为 0600 |

#### 3.2.10 内存管理 (`/memory`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| 持久化记忆存储 | 记忆列表 | 记忆片段、创建时间、关联会话 |
| 向量检索 | 搜索框 | 基于 FTS5 的语义搜索 |
| 用户档案 | 档案卡片 | Honcho 辩证用户建模数据 |
| 记忆清理 | 按钮 | 按时间/类型批量删除 |
| 记忆重建 | 按钮 | 触发重新索引 |
| 记忆字符数限制 | 进度条 | memory_char_limit / user_char_limit 使用情况 |

#### 3.2.11 工具调用 (`/tools`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| 40+ 内置工具 | 工具列表（分组） | 终端、文件、浏览器、搜索、代码等工具集 |
| 工具启用/禁用 | Switch 开关 | 对应 toolsets 配置 |
| 工具执行日志 | 日志流 | 最近 N 次工具调用记录 |
| MCP 服务器管理 | 配置表单 | 连接外部 MCP 服务器，扩展工具 |
| 工具测试 | "测试调用"按钮 | 发送测试指令，查看返回结果 |

#### 3.2.12 终端界面 (`/terminal`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| 6 种终端后端 | 后端选择器 | local / docker / ssh / singularity / modal / daytona |
| 实时 PTY 终端 | xterm.js | WebSocket 连接 Agent 终端 |
| 后端配置 | 表单 | SSH 主机、Docker 容器名等 |
| 命令历史 | 侧边栏 | 最近执行的命令列表 |

#### 3.2.13 消息网关 (`/gateway`)

| Agent 能力项 | WebUI 展示组件 | 数据说明 |
|------------|--------------|---------|
| 多平台接入配置 | 平台卡片列表 | Telegram、Discord、Slack、WhatsApp、微信、飞书、钉钉、Signal |
| 平台开关 | Switch | 启用/禁用某平台接入 |
| 平台配置表单 | 动态表单 | Bot Token、Webhook URL 等 |
| 连接状态 | 状态指示灯 | 在线/离线/错误 |
| 网关日志 | 日志面板 | 各平台消息收发记录 |

#### 3.2.14 子 Agent 委派 (`/delegation`)

| Agent 能力项 | WebUI 展示组件 | 交互说明 |
|------------|--------------|---------|
| 子代理概览 | 子代理卡片列表 | **始终可见**。可自由创建新的子代理（最多 3 个）、可自由删除任意子代理。 |
| 子代理配置 | 配置表单 + 任务分发 | **始终可操作**。可配置模型/工具集、分发任务、查看结果。 |
| 创建子代理 | 按钮 | **始终可用**。显示「+ 新建子代理」，点击弹出配置表单。 |
| 删除子代理 | 按钮 | **始终可用**。每个子代理卡片显示删除按钮，点击后移除该子代理（至少保留 1 个）。 |
| 任务分发 | 表单 | **所有已创建的子代理均可操作**。 |
| 结果汇总 | 折叠面板 | **始终可见**。汇总展示所有已创建子代理的任务结果。 |

> **交互原则**：子代理功能对所有用户开放，可自由创建、删除子代理（上限 3 个）。

#### 3.2.14.x 子代理状态可视化约束（约束性条款）

子代理的状态呈现必须严格基于 Hermes Agent 实际暴露的信息，**禁止虚构 Agent 不具备的状态语义**。

**合规状态映射表**：

| 真实可获取的数据 | 允许的 UI 呈现方式 | 数据来源 |
|-----------------|-------------------|---------|
| 子代理是否已创建 | 卡片点亮/置灰状态 | `/api/delegation` 列表查询 |
| 是否正在执行任务 | "工作中"状态指示器 | 任务分发 API 的 `pending` 状态 |
| 任务是否已完成 | 结果摘要面板展开/折叠 | 任务返回的 `status: completed` |
| 任务是否失败 | 错误状态标识与错误信息展示 | 任务返回的 `status: failed` |

#### 3.2.15 系统设置 (`/settings`)

| 功能项 | WebUI 展示组件 | 交互说明 |
|--------|---------------|---------|
| 主题切换 | Segmented 控件 | **始终可操作**。亮色/暗色/跟随系统。 |
| 语言切换 | 下拉选择 | **始终可操作**。预留多语言（当前仅中文）。 |
| 配置项编辑 | 各类配置表单 | **始终可编辑**。 |
| 关于 | 版本信息 | **始终可见**。WebUI 版本、Agent 版本。 |

> **核心交互原则**：系统设置页面的所有内容**始终可编辑**，无需任何激活检查。

#### 3.2.16 系统维护 (`/startup`)

本页面包含三个子功能，通过 Tab 切换：

**启动后端**

|| 功能项 | WebUI 展示组件 | 交互说明 |
||--------|---------------|---------|
| 后端状态 | 状态指示器 | **始终可见**。显示 Hermes Gateway 后端当前运行状态（运行中/已停止）。 |
| 启动按钮 | 按钮 | **始终可操作**。点击启动 Hermes Gateway 后端进程（`hermes gateway start`）。 |
| 停止按钮 | 按钮 | **始终可操作**。点击停止 Hermes Gateway 后端进程。 |
| 状态看板联动 | 连接状态同步 | 后端运行后，状态看板上显示 Gateway 连接状态为"已连接"。 |

**配置急救**

|| 功能项 | WebUI 展示组件 | 交互说明 |
||--------|---------------|---------|
| 检查配置 | 按钮 | **始终可操作**。执行 `hermes config check`，扫描 config.yaml 检测缺失或过时的配置项。 |
| 一键修复 | 按钮 | **发现问题后可见**。自动备份当前配置 → 执行 migrate → 验证结果。原配置备份至 `~/.hermes/config.yaml.backup.{timestamp}`。 |
| 迁移配置 | 按钮 | **始终可操作**。执行 `hermes config migrate`，自动更新配置文件添加新版本来新增的选项（不删除现有配置）。 |

**检查更新**

|| 功能项 | WebUI 展示组件 | 交互说明 |
||--------|---------------|---------|
| 当前版本 | 版本卡片 | **始终可见**。显示 Hermes Agent 当前安装版本。 |
| 更新源选择 | 下拉选择 | **始终可见**。可选 GitHub 官方 / Ghproxy 加速 / Gitee 镜像。 |
| 检查更新 | 按钮 | **始终可操作**。连接远程仓库检查是否有新版本可用。 |
| 执行更新 | 按钮 | **有可用更新时可见**。执行 `hermes update` 拉取最新代码并重新安装依赖，更新过程中 Gateway 自动重启。 |

> **核心交互原则**：系统维护功能独立于系统设置，是独立的顶级页面。页面立即渲染，不依赖后端服务。

#### 3.2.16.x 输入框 UI 设计指引（非约束性）

对话界面底部的消息输入框是高频操作区域，为保障输入体验，建议遵循以下视觉规范：

| 设计项 | 建议值 | 说明 |
|--------|--------|------|
| 最小高度 | ≥ 80px | 避免单行输入框造成的局促感 |
| 最大高度 | ≤ 30vh | 防止在小屏设备上过度挤压对话历史可视区域 |
| 内边距 | `p-4` 或 `px-5 py-3` | 保证输入文字与边框的呼吸空间 |
| 宽度约束 | 与上方对话气泡容器一致（如 `max-w-4xl`） | 维持视觉对齐的一致性 |
| 字体 | `font-mono` | 延续 Hermes TUI 的等宽字体风格 |
| 分隔 | 顶部 `border-t` 分隔线 | 明确区分输入区与对话历史区 |

> **说明**：本指引不涉及功能增删，不违反宪法"100% 功能映射"原则。开发者可根据实际交互反馈灵活调整具体数值。

---

## 第四章：技术架构宪法

### 4.1 技术栈（不可变核心）

| 层级 | 技术选型 | 约束 |
|------|---------|------|
| 框架 | React 18 + Vite | 不得降级至 CRA |
| 语言 | TypeScript | 禁止使用 any 类型（除非有充分注释） |
| UI 组件库 | shadcn/ui + Tailwind CSS | 禁止引入 Ant Design / MUI 等重型替代 |
| 路由 | React Router 6 | 保持扁平路由结构 |
| 状态管理 | Zustand（全局）+ TanStack Query（服务端） | 禁止引入 Redux |
| 图表 | Recharts | 轻量优先 |
| 终端模拟 | xterm.js | 用于日志和终端页面 |
| 代码编辑 | CodeMirror | 用于 YAML 配置编辑 |
| 表单 | React Hook Form + Zod | 所有表单必须带验证 |

### 4.2 目录结构（强制遵循）

```
src/
├── app/                      # 应用入口、路由、布局
│   ├── layout/               # 主布局、侧边栏、头部
│   └── pages/               # 15 个页面入口（每个页面一个文件夹）
├── features/                 # 功能模块（按领域拆分，可包含自己的 components/hooks/store）
│   ├── gateway/              # 消息网关模块
│   └──...
├── components/               # 全局共享组件
│   ├── ui/                  # shadcn/ui 基础组件（自动生成）
│   ├── common/              # 通用业务组件
│   ├── charts/              # 图表组件封装
│   ├── editor/              # 编辑器封装
│   ├── terminal/            # 终端封装
│   └── layout/              # 布局相关组件
├── hooks/                   # 全局自定义 Hooks
├── lib/                     # 工具库
│   ├── api/                 # Axios 客户端、API 函数
│   ├── store/               # Zustand stores
│   ├── utils/               # 工具函数
│   ├── constants/           # 常量定义
│   └── i18n/                # 国际化
├── types/                   # 全局 TypeScript 类型
└── styles/                  # 全局样式（仅 Tailwind 入口）
```

### 4.3 API 接口约定（直接读写 state.db）

所有 API 请求均由 hermes-cn-webUI 后端（Express 服务器）直接处理，数据来源为 `~/.hermes/state.db`（SQLite，只读）和 `~/.hermes/config.yaml`、`~/.hermes/.env` 等配置文件。

**设计原则**：不依赖 Hermes Gateway 进程是否运行，WebUI 可独立启动并展示 Agent 历史数据。

| 端点 | 方法 | 数据来源 |
|------|------|---------|
| `/api/status` | GET | 系统信息（Python/Node 进程） + Hermes 版本号 |
| `/api/sessions` | GET | state.db 会话查询 |
| `/api/sessions/:id` | GET | state.db 会话详情 + 消息记录 |
| `/api/analytics/usage` | GET | state.db 会话汇总统计 |
| `/api/logs/stream` | WS | Hermes 日志文件（`~/.hermes/logs/`） |
| `/api/cron` | CRUD | state.db cron 表 + `hermes schedule` CLI |
| `/api/skills` | GET/PUT | `~/.hermes/skills/` 目录扫描 + config.yaml |
| `/api/config` | GET/PUT | `~/.hermes/config.yaml` |
| `/api/keys` | GET/PUT | `~/.hermes/.env` |
| `/api/memory` | GET/DELETE/POST | state.db 记忆存储（FTS5） |
| `/api/tools/toolsets` | GET/PUT | hermes tools list + config.yaml |
| `/api/terminal` | WS | node-pty PTY 连接 |
| `/api/gateway` | GET/PUT | config.yaml gateway 配置块 |
| `/api/delegation` | POST/GET | 子任务记录（state.db 或内存） |
| `/api/cron/jobs` | CRUD | state.db cron 表 + hermes schedule CLI |
| `/v1/chat/completions` | POST (SSE) | 调用 Hermes CLI 或直接路由到 LLM Provider（Agent 模式） |
| `/api/chat/direct` | POST (SSE) | 直接路由到 LLM Provider（普通模式，无 Agent） |

> **说明**：所有数据读写均通过 hermes-cn-webUI 后端直接操作 `~/.hermes/` 下的文件完成，无需 Hermes Gateway 进程在运行。后端服务器承担"数据视图"角色，Hermes CLI/Agent 本身承担写入角色。

---

### 4.4 Hermes Agent 技术参考

本节摘录自 `hermes-agent` 源码（`/Users/macbook/hermes-agent/`），作为 hermes-ourmar 开发的权威技术依据。

#### 4.4.1 项目结构

```
hermes-agent/
├── run_agent.py           # AIAgent class — 核心对话循环
├── model_tools.py         # 工具编排，_discover_tools()，handle_function_call()
├── toolsets.py            # 工具集定义，_HERMES_CORE_TOOLS 列表
├── cli.py                 # HermesCLI class — 交互式 CLI 编排器
├── hermes_state.py        # SessionDB — SQLite 会话存储（FTS5 搜索）
├── hermes_cli/            # CLI 子命令
│   ├── config.py          # DEFAULT_CONFIG, OPTIONAL_ENV_VARS, 配置迁移
│   ├── commands.py        # 斜杠命令定义
│   ├── skills_config.py   # `hermes skills` — 按平台启用/禁用技能
│   ├── tools_config.py    # `hermes tools` — 按平台启用/禁用工具集
│   └── auth.py            # Provider 凭证解析
├── tools/                 # 工具实现（每个文件一个工具）
│   ├── registry.py        # 中心化工具注册表
│   ├── file_tools.py      # 文件读写/搜索/补丁
│   ├── web_tools.py       # Web 搜索/提取
│   ├── browser_tool.py    # Browserbase 浏览器自动化
│   ├── delegate_tool.py   # 子 Agent 委派
│   └── mcp_tool.py       # MCP 客户端
├── gateway/              # 消息平台网关
│   ├── run.py             # 主循环，斜杠命令，消息分发
│   ├── session.py         # SessionStore — 对话持久化
│   └── platforms/         # 适配器：telegram, discord, slack, whatsapp 等
├── cron/                 # 调度器（jobs.py, scheduler.py）
└── acp_adapter/          # ACP 服务器（VS Code / Zed / JetBrains 集成）
```

**用户配置**：`~/.hermes/config.yaml`（设置），`~/.hermes/.env`（API 密钥）

#### 4.4.2 state.db 数据库模式（hermes_state.py）

```
位置：~/.hermes/state.db
WAL 模式：并发读 + 单写
FTS5：全文搜索（messages_fts 虚拟表 + 触发器自动同步）

sessions 表：
  id TEXT PRIMARY KEY
  source TEXT          -- 'cli', 'telegram', 'discord' 等
  user_id TEXT
  model TEXT
  model_config TEXT
  system_prompt TEXT
  parent_session_id TEXT
  started_at REAL      -- Unix 时间戳
  ended_at REAL
  end_reason TEXT
  message_count INTEGER DEFAULT 0
  tool_call_count INTEGER DEFAULT 0
  input_tokens INTEGER DEFAULT 0
  output_tokens INTEGER DEFAULT 0
  cache_read_tokens INTEGER DEFAULT 0
  cache_write_tokens INTEGER DEFAULT 0
  reasoning_tokens INTEGER DEFAULT 0
  billing_provider TEXT
  billing_base_url TEXT
  billing_mode TEXT
  estimated_cost_usd REAL
  actual_cost_usd REAL
  cost_status TEXT
  cost_source TEXT
  pricing_version TEXT
  title TEXT

messages 表：
  id INTEGER PRIMARY KEY AUTOINCREMENT
  session_id TEXT NOT NULL REFERENCES sessions(id)
  role TEXT NOT NULL        -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT
  tool_call_id TEXT
  tool_calls TEXT            -- JSON 数组字符串
  tool_name TEXT
  timestamp REAL NOT NULL
  token_count INTEGER
  finish_reason TEXT
  reasoning TEXT
  reasoning_details TEXT
  codex_reasoning_items TEXT
```

#### 4.4.3 Gateway 运行时状态（gateway/status.py）

```
PID 文件：~/.hermes/gateway.pid
状态文件：~/.hermes/gateway_state.json（kind: "hermes-gateway"）

状态字段：
  gateway_state: "starting" | "running" | "stopping" | "stopped"
  exit_reason: string | null
  restart_requested: boolean
  active_agents: number
  platforms: { [platform]: { state, error_code, error_message, updated_at } }
  updated_at: ISO8601 时间戳
```

#### 4.4.4 DEFAULT_CONFIG 关键配置（hermes_cli/config.py）

```python
DEFAULT_CONFIG = {
    "model": "",                    # 默认模型
    "providers": {},                # Provider 配置
    "fallback_providers": [],
    "toolsets": ["hermes-cli"],    # 默认启用工具集
    "agent": {
        "max_turns": 90,           # 最大对话轮次
        "gateway_timeout": 1800,    # Gateway 超时（秒），0=无限
        "restart_drain_timeout": 60,
        "tool_use_enforcement": "auto",  # 强制工具调用
        "gateway_timeout_warning": 900,
        "gateway_notify_interval": 600,
    },
    "terminal": {
        "backend": "local",
        "cwd": ".",
        "timeout": 180,
        "persistent_shell": True,
        "container_cpu": 1,
        "container_memory": 5120,  # MB
        "container_disk": 51200,   # MB
    },
    "browser": {
        "inactivity_timeout": 120,
        "command_timeout": 30,
        "record_sessions": False,
        "allow_private_urls": False,
    },
    "checkpoints": {
        "enabled": True,
        "max_snapshots": 50,
    },
    "file_read_max_chars": 100_000,  # 单次读取最大字符数
    "compression": {
        "enabled": True,
        "threshold": 0.50,         # 上下文超过 50% 时压缩
        "target_ratio": 0.20,
        "protect_last_n": 20,
    },
}
```

---

## 第五章：代码质量宪法

### 5.1 代码风格

- **Prettier**：所有代码格式化
- **ESLint**：TypeScript/JavaScript linting
- **禁止 `any` 类型**：除非有充分注释说明原因
- **组件文件命名**：PascalCase（如 `ChatPage.tsx`）
- **工具函数文件命名**：camelCase（如 `useChatStream.ts`）

### 5.2 前端依赖管理

- **禁止引入重型 UI 库**：Ant Design、MUI 等不允许使用（已使用 shadcn/ui）
- **禁止引入 Redux**：已使用 Zustand + TanStack Query
- **禁止引入 jQuery**：纯 React 生态

### 5.3 安全性约束

- **API Key 保密**：前端绝不存储明文 API Key
- **XSS 防护**：所有用户输入内容必须经过转义
- **CSRF 防护**：关键操作需验证 session

---

## 第六章：前端无 "browser" 依赖约束

### 6.1 约束说明

前端代码中**不得**存在名为 `browser` 的模块、组件、工具函数或环境判断（如 `window.browser`、`browser` 对象、浏览器兼容性检测库）。

如果原用于检测浏览器能力（如语音识别），必须替换为标准 Web API 检测（`window.SpeechRecognition` 等）。

### 6.2 允许的 Web API

以下标准 Web API 可以直接使用，无需额外 polyfill：

| API | 用途 |
|-----|------|
| `window.SpeechRecognition` / `window.webkitSpeechRecognition` | 语音识别 |
| `window.matchMedia` | 媒体查询（主题检测） |
| `navigator.clipboard` | 剪贴板访问 |
| `navigator.mediaDevices` | 媒体设备访问 |
| `window.indexedDB` | 本地数据库 |

---

*本宪法由项目维护者共同遵守，如有修改需经过代码审查流程。*
