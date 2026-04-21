# hermes-cn-webUI 跨平台支持说明

## 支持的操作系统

✅ **macOS** (10.15+) - 原生支持  
✅ **Linux** (Ubuntu 18.04+, Debian 10+, CentOS 7+) - 原生支持  
✅ **Windows** (10/11, WSL2) - 完全支持

---

## 跨平台实现细节

### 1. 路径处理
- 使用 Node.js `path.join()` 和 `path.resolve()` 处理所有文件路径
- 配置文件路径通过 `os.homedir()` 动态获取用户主目录
- 环境变量 `HERMES_HOME` 可覆盖默认配置路径

### 2. 进程管理
- **Unix (macOS/Linux)**: 使用 `sh -c` 和 `exec` 启动后台进程
- **Windows**: 使用 PowerShell `Start-Process` 启动后台进程
- 进程查找：`pgrep` (Unix) / `tasklist` (Windows)
- 进程终止：`pkill` (Unix) / `taskkill` (Windows)

### 3. Python 虚拟环境
- **Unix**: `~/.hermes/hermes-agent/venv/bin/python`
- **Windows**: `~/.hermes\hermes-agent\venv\Scripts\python.exe`

### 4. 部署脚本
- `scripts/deploy.sh` - Linux/macOS 一键部署（支持 systemd）
- `scripts/deploy.js` - 跨平台部署（Node.js 实现）
- `hermes-cnweb.js` - 跨平台启动脚本（Windows/Linux/macOS 通用）

---

## 安装方式

### 方式 1: 全局安装（推荐）

```bash
# Linux/macOS
cd ~/Desktop/hermes-cn-webui
sudo npm install -g

# 或使用 pnpm
pnpm add -g
```

安装后全局命令：
```bash
hermes-cnweb start    # 启动
hermes-cnweb stop     # 停止
hermes-cnweb restart  # 重启
```

### 方式 2: 本地运行

```bash
cd ~/Desktop/hermes-cn-webui

# 安装依赖
pnpm install

# 启动（开发模式）
pnpm run dev:all

# 或使用跨平台脚本
node hermes-cnweb.js start
```

### 方式 3: 一键部署（Linux 服务器）

```bash
# 自动安装 Node.js 20+、pnpm，克隆代码，配置 systemd
curl -s https://raw.githubusercontent.com/417517338-sketch/hermes-cn-webUI/master/scripts/deploy.sh | bash
```

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `HERMES_HOME` | Hermes Agent 安装目录 | `~/.hermes` |
| `PORT` | 后端服务端口 | `3001` |
| `VITE_API_BASE` | 前端 API 代理目标 | `http://localhost:3001` |

---

## 已知限制

1. **`hermes-cnweb` 脚本**（Bash）仅在 Unix 系统可用
   - Windows 用户使用 `hermes-cnweb.js` 或 `npx hermes-cnweb`

2. **systemd 服务** 仅在 Linux 可用
   - macOS 使用 `launchd` 或 `pm2`
   - Windows 使用 `NSSM` 或 `Windows Service`

3. **Terminal 启动脚本**（`scripts/start-backend.sh`）使用 macOS Terminal.app
   - 跨平台替代：`node hermes-cnweb.js start`

---

## 验证跨平台兼容性

运行以下命令验证：

```bash
# 检查 Node.js 版本（需要 20+）
node --version

# 运行 TypeScript 编译检查
pnpm run build

# 运行测试
pnpm test

# 检查路径处理
node -e "import('path').then(p => console.log('OS:', process.platform, 'Home:', p.join(p.homedir(), '.hermes')))"
```

---

## 故障排查

### Windows 无法启动

1. 确保已安装 Node.js 20+ 和 pnpm
2. 使用 PowerShell 或 WSL2 运行
3. 检查防火墙是否允许 3000/3001 端口

### Linux 权限问题

```bash
# 添加执行权限
chmod +x hermes-cnweb.js
chmod +x hermes-cnweb

# 或使用 sudo 安装
sudo npm install -g
```

### macOS 安全提示

如果遇到"无法打开应用"提示：
```bash
# 解除隔离
sudo xattr -rd com.apple.quarantine ./hermes-cnweb.js
```

---

## 贡献跨平台改进

如果发现新的平台兼容性问题：
1. 提交 Issue 说明操作系统版本和错误信息
2. 提供复现步骤
3. 如有修复方案，提交 PR

---

**最后更新**: 2026-04-22  
**版本**: 2.0.0
