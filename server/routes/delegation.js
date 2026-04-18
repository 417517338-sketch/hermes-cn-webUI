/**
 * 子 Agent 委派路由
 * @description 真实集成：Spawn Hermes Agent CLI 子进程执行并行任务
 * @description 任务状态持久化到 ~/.hermes/delegation_tasks.json
 * @see CONSTITUTION.md 第二章 2.2.15
 */
import { Router } from 'express'
import { spawn } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

export const delegationRouter = Router()

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERMES_HOME = join(homedir(), '.hermes')
const TASKS_FILE = join(HERMES_HOME, 'delegation_tasks.json')
const HERMES_AGENT_CLI = join(HERMES_HOME, 'hermes-agent', 'cli.py')
const HERMES_PYTHON = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python3')

// ---------------------------------------------------------------------------
// Sub-agents configuration
// ---------------------------------------------------------------------------

const SUB_AGENTS = [
  {
    id: 'claude-sonnet',
    name: 'Claude',
    icon: '🤖',
    description: 'Anthropic Claude 3.5 Sonnet',
    model: 'anthropic/claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    color: '#FF6B35',
    capabilities: ['代码', '分析', '创意写作'],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    icon: '🧠',
    description: 'OpenAI GPT-4o',
    model: 'gpt-4o',
    provider: 'openai',
    color: '#10A37F',
    capabilities: ['通用', '推理', '对话'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔵',
    description: 'DeepSeek V3',
    model: 'deepseek/deepseek-chat-v3-0324',
    provider: 'openrouter',
    color: '#0066FF',
    capabilities: ['编程', '数学', '推理'],
  },
  {
    id: 'hermes',
    name: 'Hermes',
    icon: '⚕',
    description: 'Nous Hermes 3',
    model: 'nousresearch/hermes-3-llama-3.1-405b',
    provider: 'nous',
    color: '#9333EA',
    capabilities: ['研究', '分析', '长上下文'],
  },
  {
    id: 'local',
    name: 'Local',
    icon: '💻',
    description: '本地 Ollama',
    model: 'llama3',
    provider: 'custom',
    color: '#6B7280',
    capabilities: ['离线', '隐私', '自定义'],
  },
]

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Load tasks from disk, returns Map<id, task> */
function loadTasks() {
  try {
    if (!existsSync(TASKS_FILE)) return new Map()
    const raw = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    const map = new Map()
    if (Array.isArray(raw)) {
      for (const t of raw) {
        if (t.id) map.set(t.id, t)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Save all tasks to disk.
 * Removes _proc/_stderr/_stdout internal fields before writing.
 */
function saveTasks(tasksMap) {
  try {
    mkdirSync(HERMES_HOME, { recursive: true })
    const arr = Array.from(tasksMap.values()).map(t => {
      // Strip internal fields
      const { _proc, _stderr, _stdout, ...pub } = t
      return pub
    })
    writeFileSync(TASKS_FILE, JSON.stringify(arr, null, 2), 'utf-8')
  } catch (err) {
    console.error('[delegation] failed to save tasks:', err.message)
  }
}

/** Remove tasks older than 7 days (only finished/cancelled/error) */
function pruneOldTasks(tasksMap) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const [id, t] of tasksMap) {
    if (t.status !== 'running' && t.finished_at) {
      try {
        if (new Date(t.finished_at).getTime() < cutoff) {
          tasksMap.delete(id)
        }
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const activeProcesses = new Map()   // taskId → proc
const tasks = loadTasks()           // Map<id, task>
pruneOldTasks(tasks)
if (tasks.size > 0) {
  console.log(`[delegation] loaded ${tasks.size} tasks from disk`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publicTask(t) {
  return {
    id: t.id,
    goal: t.goal,
    context: t.context,
    model: t.model,
    provider: t.provider,
    toolsets: t.toolsets,
    status: t.status,
    created_at: t.created_at,
    finished_at: t.finished_at,
    result: t.result || null,
    error: t.error || null,
  }
}

function parseResponse(output) {
  const boxMatch = output.match(/[╭─]\s*[─]*\s*⚕\s*Hermes\s*[─]*[\s\S]*?(?:╰[─]*|─{10,})/)
  if (!boxMatch) {
    // Fallback for compact --quiet output (plain text)
    const lines = output.trim().split('\n').filter(l => !l.startsWith('session_id:'))
    if (lines.length > 0) {
      return lines.slice(0, -1).join('\n').trim() // Remove last line (session_id)
    }
    return null
  }
  const box = boxMatch[0]
  const lines = box.split('\n').slice(1, -1)
  const contentLines = lines
    .map(l => l.replace(/^[│├└╭╰─]\s*[─]*.*[─]*[│├└╰─]$/, '').trim())
    .filter(l => l.length > 0 && !/^[-─]{10,}$/.test(l))
  return contentLines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/delegation/agents
 * 获取子 Agent 列表
 */
delegationRouter.get('/agents', (req, res) => {
  res.json({
    agents: SUB_AGENTS,
    max_parallel: 3,
  })
})

/**
 * GET /api/delegation
 * 列出所有任务（含重启后恢复的历史）
 */
delegationRouter.get('/', (req, res) => {
  const taskList = Array.from(tasks.values()).map(publicTask)
  // Sort by created_at desc
  taskList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  res.json({ tasks: taskList })
})

/**
 * POST /api/delegation
 * 创建并启动子 Agent 任务
 */
delegationRouter.post('/', async (req, res) => {
  const { goal, context, model, provider, toolsets } = req.body

  if (!goal) {
    return res.status(400).json({ error: 'goal is required' })
  }

  const runningCount = Array.from(tasks.values()).filter(t => t.status === 'running').length
  if (runningCount >= 3) {
    return res.status(429).json({ error: '最多同时运行 3 个子 Agent，请等待现有任务完成' })
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const cliArgs = [HERMES_AGENT_CLI, '--query', goal, '--compact', '--quiet']
  if (model) cliArgs.push('--model', model)
  if (provider) cliArgs.push('--provider', provider)
  if (toolsets) cliArgs.push('--toolsets', toolsets)

  const proc = spawn(HERMES_PYTHON, cliArgs, {
    cwd: HERMES_HOME,
    env: { ...process.env, HERMES_HOME },
  })

  const task = {
    id: taskId,
    goal,
    context,
    model,
    provider,
    toolsets,
    status: 'running',
    created_at: new Date().toISOString(),
    finished_at: null,
    result: null,
    error: null,
    // Internal — not written to disk
    _proc: proc,
  }

  tasks.set(taskId, task)
  activeProcesses.set(taskId, proc)

  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', data => { stdout += data.toString() })
  proc.stderr.on('data', data => { stderr += data.toString() })

  proc.on('error', err => {
    task.status = 'error'
    task.error = `进程启动失败: ${err.message}`
    task.finished_at = new Date().toISOString()
    // Update public view and persist
    tasks.set(taskId, task)
    saveTasks(tasks)
    activeProcesses.delete(taskId)
  })

  proc.on('close', code => {
    activeProcesses.delete(taskId)

    if (code === 0) {
      const responseText = parseResponse(stdout + stderr)
      task.status = 'done'
      task.result = responseText || stdout.slice(-500) || '任务完成（无文本输出）'
    } else {
      task.status = 'error'
      task.error = `CLI 退出 (code=${code}): ${stderr.slice(0, 300)}`
    }
    task.finished_at = new Date().toISOString()
    tasks.set(taskId, task)
    saveTasks(tasks)
  })

  // Persist the new task immediately
  saveTasks(tasks)

  res.json({ id: taskId, status: 'running', error: null })
})

/**
 * POST /api/delegation/chat
 * 直接与子 Agent 对话（流式响应）
 */
delegationRouter.post('/chat', async (req, res) => {
  const { message, agent_id, context } = req.body

  if (!message) {
    return res.status(400).json({ error: 'message is required' })
  }

  // 找到对应的子 agent 配置
  const agent = SUB_AGENTS.find(a => a.id === agent_id)
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const taskId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // 构建查询字符串，包含 context
  let query = message
  if (context) {
    query = `Context: ${context}\n\nQuestion: ${message}`
  }

  const cliArgs = [HERMES_AGENT_CLI, '--query', query, '--compact', '--quiet']
  if (agent.model) cliArgs.push('--model', agent.model)
  if (agent.provider) cliArgs.push('--provider', agent.provider)

  const proc = spawn(HERMES_PYTHON, cliArgs, {
    cwd: HERMES_HOME,
    env: { ...process.env, HERMES_HOME },
  })

  let stdout = ''
  let stderr = ''
  let responseText = ''

  proc.stdout.on('data', data => {
    const chunk = data.toString()
    stdout += chunk
    // 实时流式转发到前端
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
  })

  proc.stderr.on('data', data => {
    stderr += data.toString()
  })

  proc.on('error', err => {
    if (!res.headersSent) {
      res.status(500).json({ error: `进程启动失败: ${err.message}` })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`)
      res.end()
    }
  })

  proc.on('close', code => {
    if (code === 0) {
      responseText = parseResponse(stdout) || stdout.slice(-500) || '完成'
    } else {
      responseText = `错误: CLI 退出 (code=${code})`
      if (stderr) responseText += `\n${stderr.slice(0, 200)}`
    }
    res.write(`data: ${JSON.stringify({ type: 'done', result: responseText, agent_id })}\n\n`)
    res.end()
  })

  // 设置超时（60秒）
  setTimeout(() => {
    if (!proc.killed) {
      proc.kill('SIGTERM')
      if (!res.headersSent) {
        res.status(504).json({ error: 'Agent 响应超时' })
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: '响应超时' })}\n\n`)
        res.end()
      }
    }
  }, 60000)
})

/**
 * GET /api/delegation/:id
 * 查询任务状态和结果
 */
delegationRouter.get('/:id', (req, res) => {
  const task = tasks.get(req.params.id)
  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }
  res.json(publicTask(task))
})

/**
 * DELETE /api/delegation/:id
 * 取消/删除任务（运行中任务将被 kill）
 */
delegationRouter.delete('/:id', (req, res) => {
  const task = tasks.get(req.params.id)
  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }

  if (task.status === 'running') {
    const proc = activeProcesses.get(req.params.id)
    if (proc) {
      try { proc.kill('SIGTERM') } catch {}
      activeProcesses.delete(req.params.id)
    }
    task.status = 'cancelled'
    task.finished_at = new Date().toISOString()
    task.error = '任务已被用户取消'
  }

  tasks.delete(req.params.id)
  saveTasks(tasks)
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Graceful shutdown: kill running tasks
// ---------------------------------------------------------------------------

process.on('exit', () => {
  for (const [id, proc] of activeProcesses) {
    try { proc.kill('SIGTERM') } catch {}
  }
})
