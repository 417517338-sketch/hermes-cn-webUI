/**
 * Startup 路由
 * @description 宪法 3.2.16 系统维护 (/startup)
 * 前端 Startup.tsx 调用 /api/startup/*，转发到 gateway 逻辑或返回占位数据
 */
import { Router } from 'express'
import { spawn, execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export const startupRouter = Router()

const HERMES_HOME = join(homedir(), '.hermes')
const GATEWAY_PID_FILE = join(HERMES_HOME, 'gateway.pid')

// ─── Banner helpers (check_for_updates) ──────────────────────────────────────

/**
 * 调用 Hermes Agent 的 check_for_updates()，返回落后 commit 数。
 * Returns null on failure (非 git 安装或离线).
 */
function checkAgentUpdates() {
  const python = join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python')
  const scriptPath = '/tmp/hermes_check_updates.py'
  const scriptContent = [
    'import sys',
    `sys.path.insert(0, "${HERMES_HOME}")`,
    'from hermes_cli.banner import check_for_updates',
    'result = check_for_updates()',
    'print(result if result is not None else "null")',
  ].join('\n')
  try {
    writeFileSync(scriptPath, scriptContent, 'utf8')
    const output = execSync(`"${python}" "${scriptPath}"`, {
      cwd: HERMES_HOME,
      encoding: 'utf-8',
      timeout: 20,
    })
    const val = output.trim()
    if (val === 'null') return null
    const n = parseInt(val, 10)
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

// ─── Gateway 状态 ────────────────────────────────────────────────────────────

function getGatewayPid() {
  try {
    if (!existsSync(GATEWAY_PID_FILE)) return null
    const content = readFileSync(GATEWAY_PID_FILE, 'utf8').trim()
    // PID 文件可能是纯数字（旧格式）或 JSON（新格式）
    const parsed = JSON.parse(content)
    const pid = parsed.pid || parsed
    if (pid && pid > 0) return pid
    // 纯数字格式
    const num = parseInt(content, 10)
    if (num && num > 0) return num
    return null
  } catch {
    return null
  }
}

function isGatewayRunning() {
  return getGatewayPid() !== null
}

// ─── Gateway 进程管理 ────────────────────────────────────────────────────────

function startGateway() {
  if (isGatewayRunning()) {
    stopGateway()
    const stall = Date.now()
    while (Date.now() - stall < 5000) {
      if (!isGatewayRunning()) break
      execSync('sleep 0.5')
    }
  }

  const python = join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python')
  const shellCmd = `exec "${python}" -m hermes_cli.main gateway run --replace`
  const proc = spawn('sh', ['-c', shellCmd], {
    cwd: HERMES_HOME,
    env: { ...process.env, HERMES_HOME },
    detached: true,
    stdio: 'ignore',
  })

  proc.unref()

  const pid = proc.pid
  if (pid) {
    writeFileSync(GATEWAY_PID_FILE, String(pid), 'utf8')
    return { success: true, pid }
  }

  return { success: false, error: 'Failed to start gateway process' }
}

function stopGateway() {
  const pid = getGatewayPid()
  if (!pid) return { success: false, error: 'Gateway is not running' }

  try {
    process.kill(pid, 0) // 验证进程是否存在
  } catch {
    // 进程不存在，清理 PID 文件
    try { unlinkSync(GATEWAY_PID_FILE) } catch {}
    return { success: true } // 已经是停止状态
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    // 进程不存在，清理 PID 文件
    try { unlinkSync(GATEWAY_PID_FILE) } catch {}
    return { success: true }
  }

  // 等待最多5秒让进程自然退出
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0) // 测试进程是否还在
      execSync('sleep 0.3')
    } catch {
      // 进程已退出
      try { unlinkSync(GATEWAY_PID_FILE) } catch {}
      return { success: true }
    }
  }

  // 强制 kill
  try {
    process.kill(pid, 'SIGKILL')
    try { unlinkSync(GATEWAY_PID_FILE) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to kill gateway: ${err.message}` }
  }
}

// ─── 路由实现 ─────────────────────────────────────────────────────────────────

// GET /api/startup/status
startupRouter.get('/status', (req, res) => {
  const pid = getGatewayPid()
  res.json({
    running: pid !== null,
    pid,
    state: pid ? 'running' : 'stopped',
    exit_reason: null,
    updated_at: null,
  })
})

// POST /api/startup/start
startupRouter.post('/start', (req, res) => {
  const result = startGateway()
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.error, pid: null })
  }
  res.json({ success: true, message: 'Gateway started', pid: result.pid })
})

// POST /api/startup/stop
startupRouter.post('/stop', (req, res) => {
  const result = stopGateway()
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.error, pid: null })
  }
  res.json({ success: true, message: 'Gateway stopped', pid: null })
})

// POST /api/startup/restart
startupRouter.post('/restart', (req, res) => {
  stopGateway()
  const stall = Date.now()
  while (Date.now() - stall < 3000) {
    if (!isGatewayRunning()) break
    execSync('sleep 0.3')
  }
  const result = startGateway()
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.error, pid: null })
  }
  res.json({ success: true, message: 'Gateway restarted', pid: result.pid })
})

// ─── 占位路由（功能待实现） ────────────────────────────────────────────────────

// GET /api/startup/version
startupRouter.get('/version', (req, res) => {
  res.json({ version: '2.0.0' })
})

// GET /api/startup/mirrors
startupRouter.get('/mirrors', (req, res) => {
  res.json({
    mirrors: [
      { id: 'github', label: 'GitHub 官方' },
      { id: 'ghproxy', label: 'Ghproxy 镜像' },
      { id: 'gitee', label: 'Gitee 镜像' },
    ],
  })
})

// POST /api/startup/config-check
startupRouter.post('/config-check', (req, res) => {
  res.json({ success: true, output: '配置检查功能开发中', hasIssues: false })
})

// POST /api/startup/config-migrate
startupRouter.post('/config-migrate', (req, res) => {
  res.json({ success: true, output: '配置迁移功能开发中', migrated: false })
})

// POST /api/startup/config-fix
startupRouter.post('/config-fix', (req, res) => {
  res.json({ success: true, fixed: false, message: '配置修复功能开发中', backupPath: null, checkOutput: '' })
})

// POST /api/startup/check-update
startupRouter.post('/check-update', (req, res) => {
  const behind = checkAgentUpdates()

  if (behind === null) {
    return res.json({ output: '无法检查更新（非 git 安装或离线）', updateAvailable: false })
  }

  if (behind === 0) {
    return res.json({ output: '已是最新版本（当前 HEAD = origin/main）', updateAvailable: false, behind: 0 })
  }

  return res.json({
    output: `本地版本落后 origin/main ${behind} 个提交，建议执行更新`,
    updateAvailable: true,
    behind,
  })
})

// POST /api/startup/do-update
startupRouter.post('/do-update', (req, res) => {
  // 启动更新进程（异步，不阻塞响应）
  const python = join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python')
  const updateCmd = `exec "${python}" -m hermes_cli.main update`
  const proc = spawn('sh', ['-c', updateCmd], {
    cwd: HERMES_HOME,
    env: { ...process.env, HERMES_HOME },
    detached: true,
    stdio: 'ignore',
  })
  proc.unref()

  return res.json({ message: '更新进程已在后台启动，Gateway 将自动重启' })
})
