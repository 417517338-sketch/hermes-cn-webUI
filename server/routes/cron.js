/**
 * 定时任务路由 — 真实执行版
 *
 * 功能：
 * - CRUD 任务（内存 + JSON 持久化）
 * - node-cron 定时调度（启动时加载所有 enabled 任务）
 * - 真实 spawn hermes-agent cli.py 执行 prompt
 * - 执行历史写入 ~/.hermes/cron_history/{job_id}.json
 *
 * @see CONSTITUTION.md 第二章 2.2.6
 */
import { Router } from 'express'
import cron from 'node-cron'
import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const cronRouter = Router()

// ---------------------------------------------------------------------------
// 常量 & 路径
// ---------------------------------------------------------------------------

const HERMES_HOME = join(homedir(), '.hermes')
const HERMES_AGENT_CLI = join(HERMES_HOME, 'hermes-agent', 'cli.py')
const HERMES_PYTHON = join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python')
const CRON_HISTORY_DIR = join(HERMES_HOME, 'cron_history')
const CRON_JOBS_FILE = join(HERMES_HOME, 'cron_jobs.json')

// 确保目录存在
if (!existsSync(CRON_HISTORY_DIR)) {
  mkdirSync(CRON_HISTORY_DIR, { recursive: true })
}

// ---------------------------------------------------------------------------
// 数据结构
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CronJob
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {{ kind: string, expr: string, display: string }} schedule
 * @property {string} schedule_display
 * @property {boolean} enabled
 * @property {'idle'|'running'|'error'} state
 * @property {string|null} deliver
 * @property {string|null} last_run_at
 * @property {string|null} next_run_at
 * @property {string|null} last_error
 * @property {number} [repeat]
 * @property {{ provider: string, model: string }} [model]
 * @property {string[]} [skills]
 * @property {string} created_at
 */

/**
 * @typedef {Object} Execution
 * @property {string} id
 * @property {string} job_id
 * @property {string} started_at
 * @property {string|null} finished_at
 * @property {'success'|'error'|'running'} status
 * @property {string|null} log_summary
 * @property {string|null} error
 */

// ---------------------------------------------------------------------------
// 内存中的任务存储
// ---------------------------------------------------------------------------

/** @type {CronJob[]} */
let cronJobs = []

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

function loadJobs() {
  try {
    if (existsSync(CRON_JOBS_FILE)) {
      const raw = readFileSync(CRON_JOBS_FILE, 'utf-8')
      cronJobs = JSON.parse(raw)
    } else {
      cronJobs = getDefaultJobs()
    }
  } catch {
    cronJobs = getDefaultJobs()
  }
}

function saveJobs() {
  try {
    writeFileSync(CRON_JOBS_FILE, JSON.stringify(cronJobs, null, 2), 'utf-8')
  } catch (err) {
    console.error('[cron] Failed to save jobs:', err.message)
  }
}

function getDefaultJobs() {
  return [
    {
      id: 'cron_001',
      name: '每日用量报告',
      prompt: '生成每日用量分析报告并发送给我',
      schedule: { kind: 'cron', expr: '0 9 * * *', display: '每天 09:00' },
      schedule_display: '每天 09:00',
      enabled: true,
      state: 'idle',
      deliver: 'local',
      last_run_at: '2026-04-14T09:00:00Z',
      next_run_at: '2026-04-15T09:00:00Z',
      last_error: null,
      created_at: '2026-04-01T00:00:00Z',
    },
    {
      id: 'cron_002',
      name: '每周会话清理',
      prompt: '清理超过30天的会话记录',
      schedule: { kind: 'cron', expr: '0 2 * * 0', display: '每周日 02:00' },
      schedule_display: '每周日 02:00',
      enabled: true,
      state: 'idle',
      deliver: 'local',
      last_run_at: '2026-04-13T02:00:00Z',
      next_run_at: '2026-04-20T02:00:00Z',
      last_error: null,
      created_at: '2026-04-01T00:00:00Z',
    },
    {
      id: 'cron_003',
      name: '定时健康检查',
      prompt: '检查系统各项指标是否正常',
      schedule: { kind: 'cron', expr: '*/15 * * * *', display: '每 15 分钟' },
      schedule_display: '每 15 分钟',
      enabled: false,
      state: 'idle',
      deliver: 'local',
      last_run_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      next_run_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      last_error: 'Connection timeout after 30s',
      created_at: '2026-04-01T00:00:00Z',
    },
  ]
}

function loadHistory(jobId) {
  const file = join(CRON_HISTORY_DIR, `${jobId}.json`)
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return []
}

function saveHistory(jobId, executions) {
  const file = join(CRON_HISTORY_DIR, `${jobId}.json`)
  try {
    // 保留最近 100 条
    writeFileSync(file, JSON.stringify(executions.slice(-100), null, 2), 'utf-8')
  } catch (err) {
    console.error('[cron] Failed to save history:', err.message)
  }
}

// ---------------------------------------------------------------------------
// CLI 执行
// ---------------------------------------------------------------------------

function parseResponse(output) {
  // 匹配 bordered box 中的响应内容（与 chat.js 保持一致）
  const boxMatch = output.match(/╭[─]*\s*⚕\s*Hermes[─]*[\s\S]*?╰[─]*/)
  if (!boxMatch) return null
  const box = boxMatch[0]
  const lines = box.split('\n')
  const contentLines = lines.slice(1, -1).map(l =>
    l.replace(/^[│├└].*[│├└]$/, '').trim()
  )
  let start = 0
  let end = contentLines.length - 1
  while (start <= end && !contentLines[start]) start++
  while (end >= start && !contentLines[end]) end--
  if (start > end) return null
  return contentLines.slice(start, end + 1).join('\n').trim()
}

/**
 * 运行单个 cron 任务
 * @param {CronJob} job
 * @param {boolean} isManual 是否为手动触发
 */
async function runJob(job, isManual = false) {
  const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const startedAt = new Date().toISOString()

  // 写一条 running 状态到历史
  const history = loadHistory(job.id)
  history.push({
    id: execId,
    job_id: job.id,
    started_at: startedAt,
    finished_at: null,
    status: 'running',
    log_summary: null,
    error: null,
  })
  saveHistory(job.id, history)

  // 更新任务状态
  job.state = 'running'
  job.last_run_at = startedAt
  saveJobs()

  return new Promise((resolve) => {
    const args = [HERMES_AGENT_CLI, '--query', job.prompt, '--compact', '--quiet']
    const proc = spawn(HERMES_PYTHON, args, {
      cwd: HERMES_HOME,
      env: { ...process.env, HERMES_HOME },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      finishWithError('执行超时（120s）')
    }, 120_000)

    const finishWithError = (errMsg) => {
      clearTimeout(timeout)
      const finishedAt = new Date().toISOString()
      const hist = loadHistory(job.id)
      const entry = hist.find(e => e.id === execId)
      if (entry) {
        entry.finished_at = finishedAt
        entry.status = 'error'
        entry.error = errMsg.slice(0, 200)
        saveHistory(job.id, hist)
      }
      job.state = 'idle'
      job.last_error = errMsg.slice(0, 200)
      job.next_run_at = calcNextRun(job.schedule.expr)
      saveJobs()
      resolve({ execId, status: 'error', summary: errMsg })
    }

    proc.on('close', (code) => {
      clearTimeout(timeout)
      const finishedAt = new Date().toISOString()
      const fullOutput = stdout + stderr
      const responseText = parseResponse(fullOutput)
      const summary = responseText
        ? responseText.slice(0, 200) + (responseText.length > 200 ? '…' : '')
        : (stderr || 'Agent 未返回有效响应').slice(0, 200)

      // 更新历史
      const hist = loadHistory(job.id)
      const entry = hist.find(e => e.id === execId)
      if (entry) {
        entry.finished_at = finishedAt
        entry.status = code === 0 || responseText ? 'success' : 'error'
        entry.log_summary = summary
        entry.error = code !== 0 && !responseText ? stderr.slice(0, 200) : null
        saveHistory(job.id, hist)
      }

      // 更新任务
      job.state = 'idle'
      job.last_error = code !== 0 && !responseText ? stderr.slice(0, 200) : null
      job.next_run_at = calcNextRun(job.schedule.expr)
      saveJobs()

      resolve({ execId, status: entry?.status || 'error', summary })
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      const finishedAt = new Date().toISOString()
      const hist = loadHistory(job.id)
      const entry = hist.find(e => e.id === execId)
      if (entry) {
        entry.finished_at = finishedAt
        entry.status = 'error'
        entry.error = err.message.slice(0, 200)
        saveHistory(job.id, hist)
      }
      job.state = 'idle'
      job.last_error = err.message.slice(0, 200)
      job.next_run_at = calcNextRun(job.schedule.expr)
      saveJobs()
      resolve({ execId, status: 'error', summary: err.message })
    })
  })
}

// ---------------------------------------------------------------------------
// node-cron 调度器
// ---------------------------------------------------------------------------

/** @type {Map<string, cron.ScheduledTask>} */
const scheduledTasks = new Map()

function calcNextRun(expr) {
  // 粗略估算：取表达式第一个时间位，在下一个匹配点
  // node-cron 没有直接 API，用 cron-parser 的思路手算简化版
  try {
    // 对于标准 cron，计算下一个触发时间（简化实现）
    const parts = expr.trim().split(/\s+/)
    if (parts.length < 5) return null
    const [min, hour, day, month, dow] = parts
    const now = new Date()
    // 简单向前搜索（最多 7 天）
    for (let i = 0; i < 7 * 24 * 60; i++) {
      const d = new Date(now.getTime() + i * 60_000)
      if (matchesCronPart(min, d.getMinutes()) &&
          matchesCronPart(hour, d.getHours()) &&
          matchesCronPart(day, d.getDate()) &&
          matchesCronPart(month, d.getMonth() + 1) &&
          matchesCronPart(dow, d.getDay())) {
        return d.toISOString()
      }
    }
  } catch {
    // ignore
  }
  return null
}

function matchesCronPart(part, val) {
  if (part === '*') return true
  if (part.includes('/')) {
    const [, step] = part.split('/')
    return val % parseInt(step, 10) === 0
  }
  if (part.includes(',')) {
    return part.split(',').map(Number).includes(val)
  }
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(Number)
    return val >= start && val <= end
  }
  return parseInt(part, 10) === val
}

function scheduleJob(job) {
  if (!job.enabled || !job.schedule?.expr) return
  // 取消旧任务（如果存在）
  cancelJob(job.id)
  try {
    const task = cron.schedule(job.schedule.expr, () => {
      runJob(job, false)
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai',
    })
    scheduledTasks.set(job.id, task)
    // 启动时更新 next_run_at（下次触发时间）并持久化
    job.next_run_at = calcNextRun(job.schedule.expr)
    saveJobs()
  } catch (err) {
    console.error(`[cron] Failed to schedule job ${job.id}:`, err.message)
  }
}

function cancelJob(jobId) {
  const existing = scheduledTasks.get(jobId)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(jobId)
  }
}

// ---------------------------------------------------------------------------
// 启动时加载所有 enabled 任务
// ---------------------------------------------------------------------------

loadJobs()
cronJobs.forEach(job => {
  if (job.enabled) {
    scheduleJob(job)
  }
})

// ---------------------------------------------------------------------------
// 自然语言 → cron 转换
// ---------------------------------------------------------------------------

cronRouter.post('/convert', (req, res) => {
  const { text } = req.body
  const lower = (text || '').toLowerCase()
  let expr = '0 9 * * *'
  if (lower.includes('每 15 分钟') || lower.includes('every 15')) expr = '*/15 * * * *'
  else if (lower.includes('每 5 分钟') || lower.includes('every 5')) expr = '*/5 * * * *'
  else if (lower.includes('每 30 分钟') || lower.includes('every 30')) expr = '*/30 * * * *'
  else if (lower.includes('每小时') || lower.includes('hourly')) expr = '0 * * * *'
  else if (lower.includes('每天') || lower.includes('daily')) expr = '0 9 * * *'
  else if (lower.includes('每周') || lower.includes('weekly')) expr = '0 9 * * 1'
  else if (lower.includes('每月') || lower.includes('monthly')) expr = '0 9 1 * *'
  res.json({ schedule: { kind: 'cron', expr, display: expr } })
})

// ---------------------------------------------------------------------------
// GET /api/cron — 列出所有任务
// ---------------------------------------------------------------------------

cronRouter.get('/', (req, res) => {
  res.json({ jobs: cronJobs })
})

// ---------------------------------------------------------------------------
// GET /api/cron/:id — 获取单个任务
// ---------------------------------------------------------------------------

cronRouter.get('/:id', (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

// ---------------------------------------------------------------------------
// POST /api/cron — 创建任务
// ---------------------------------------------------------------------------

cronRouter.post('/', (req, res) => {
  const { prompt, schedule, name, deliver, enabled = true } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt is required' })

  const sched = typeof schedule === 'string'
    ? { kind: 'cron', expr: schedule, display: schedule }
    : (schedule || { kind: 'cron', expr: '0 9 * * *', display: '每天 09:00' })

  const job = {
    id: `cron_${Date.now()}`,
    name: name || '未命名任务',
    prompt,
    schedule: sched,
    schedule_display: sched.display || sched.expr,
    enabled: Boolean(enabled),
    state: 'idle',
    deliver: deliver || null,
    last_run_at: null,
    next_run_at: calcNextRun(sched.expr),
    last_error: null,
    created_at: new Date().toISOString(),
  }
  cronJobs.push(job)
  saveJobs()
  if (job.enabled) scheduleJob(job)
  res.status(201).json(job)
})

// ---------------------------------------------------------------------------
// PUT /api/cron/:id — 更新任务
// ---------------------------------------------------------------------------

cronRouter.put('/:id', (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const { prompt, schedule, name, deliver, enabled } = req.body

  if (prompt !== undefined) job.prompt = prompt
  if (name !== undefined) job.name = name
  if (deliver !== undefined) job.deliver = deliver
  if (enabled !== undefined) job.enabled = enabled
  if (schedule !== undefined) {
    job.schedule = typeof schedule === 'string'
      ? { kind: 'cron', expr: schedule, display: schedule }
      : schedule
    job.schedule_display = job.schedule.display || job.schedule.expr
  }
  job.next_run_at = calcNextRun(job.schedule.expr)
  saveJobs()
  if (job.enabled) scheduleJob(job)
  else cancelJob(job.id)
  res.json(job)
})

// ---------------------------------------------------------------------------
// DELETE /api/cron/:id — 删除任务
// ---------------------------------------------------------------------------

cronRouter.delete('/:id', (req, res) => {
  const index = cronJobs.findIndex(j => j.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Job not found' })
  const [removed] = cronJobs.splice(index, 1)
  cancelJob(removed.id)
  saveJobs()
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// POST /api/cron/:id/pause
// ---------------------------------------------------------------------------

cronRouter.post('/:id/pause', (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  job.enabled = false
  job.state = 'idle'
  cancelJob(job.id)
  saveJobs()
  res.json(job)
})

// ---------------------------------------------------------------------------
// POST /api/cron/:id/resume
// ---------------------------------------------------------------------------

cronRouter.post('/:id/resume', (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  job.enabled = true
  job.state = 'idle'
  scheduleJob(job)
  job.next_run_at = calcNextRun(job.schedule.expr)
  saveJobs()
  res.json(job)
})

// ---------------------------------------------------------------------------
// POST /api/cron/:id/run — 立即执行一次（手动触发）
// ---------------------------------------------------------------------------

cronRouter.post('/:id/run', async (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  // 如果已经在运行，拒绝重复触发
  if (job.state === 'running') {
    return res.status(409).json({ error: 'Job is already running' })
  }

  // 异步执行，不阻塞响应
  runJob(job, true).catch(err => {
    console.error(`[cron] Manual run error for ${job.id}:`, err.message)
  })

  res.json({ ok: true, message: 'Job triggered' })
})

// ---------------------------------------------------------------------------
// GET /api/cron/:id/executions — 执行历史
// ---------------------------------------------------------------------------

cronRouter.get('/:id/executions', (req, res) => {
  const job = cronJobs.find(j => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const executions = loadHistory(job.id)
  res.json({ executions })
})
