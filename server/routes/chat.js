/**
 * Chat Completions API 路由
 * @description 提供 OpenAI 兼容的 /v1/chat/completions 流式接口
 * @description 真实集成：Spawn Hermes Agent CLI 子进程，解析 CLI 输出中的响应文本
 * @see CONSTITUTION.md 第二章 2.2.15
 */
import { Router } from 'express'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = Router()

// Hermes Agent CLI 路径
const HERMES_AGENT_CLI = resolve(homedir(), '.hermes', 'hermes-agent', 'cli.py')
const HERMES_HOME = join(homedir(), '.hermes')
// 使用 venv 中的 Python（hermes-agent 依赖都在 venv 中）
const HERMES_PYTHON = resolve(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python3')

/**
 * 从 CLI stdout 输出中解析响应文本
 * CLI 输出格式（v0.9.0）：
 *   ─  ⚕ Hermes  ─────────────────────────────────────────────────────────────────
 *   响应文本（多行）
 *   ──────────────────────────────────────────────────────────────────────────────
 */
function parseResponse(output) {
  // 先尝试匹配 bordered box 格式（标准输出）
  // 格式1: ╭...⚕ Hermes...╰ (旧版本)
  // 格式2: ─  ⚕ Hermes  ─ (v0.9.0)
  const boxMatch = output.match(/[╭─]\s*[─]*\s*⚕\s*Hermes\s*[─]*[\s\S]*?(?:╰[─]*|─{10,})/)
  if (boxMatch) {
    const box = boxMatch[0]
    const lines = box.split('\n')
    const contentLines = lines.slice(1, -1)
      .map(l => l.replace(/^[│├└╭╰─]\s*[─]*.*[─]*[│├└╰─]$/, '').trim())
      .filter(l => l && !/^[-─]{10,}$/.test(l))
    let start = 0
    let end = contentLines.length - 1
    while (start <= end && !contentLines[start]) start++
    while (end >= start && !contentLines[end]) end--
    if (start > end) return null
    return contentLines.slice(start, end + 1).join('\n').trim()
  }

  // 回退：处理纯文本格式（--compact --quiet 输出）
  // 去掉 session_id 行，取第一行作为响应
  const lines = output.trim().split('\n').filter(l => !l.startsWith('session_id:'))
  if (lines.length > 0) {
    return lines[0].trim()
  }

  return null
}

/**
 * 估算 token 数量（粗略）
 */
function countTokens(text) {
  return Math.ceil(text.length / 4)
}

/**
 * POST /api/chat/completions
 * 创建流式对话响应（真实 CLI 调用）
 */
router.post('/', async (req, res) => {
  const { messages, model, stream = true, temperature = 0.7, max_tokens } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: 'messages is required and must be an array',
        type: 'invalid_request_error',
      },
    })
  }

  const lastMessage = messages[messages.length - 1]
  const userContent = lastMessage?.content || ''

  // 从 messages 构建对话上下文（用于 CLI）
  const conversationText = messages
    .filter(m => m.role !== 'system' || !m.content?.includes('__HERMES_INTERNAL__'))
    .map(m => {
      if (m.role === 'user') return `User: ${m.content}`
      if (m.role === 'assistant') return `Assistant: ${m.content}`
      return `${m.role}: ${m.content}`
    })
    .join('\n')

  // 设置 SSE 流式响应
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 安全 flush — 兼容 Express 4.x / 5.x
    const flush = () => {
      try { res.flush?.() } catch (_) {}
      try { res.res?.flush?.() } catch (_) {}
    }

    // 立即发送 thinking 状态，让前端显示"思考中"
    res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`)
    flush()

    // 心跳保活
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
      flush()
    }, 10000)

    try {
      // 实时流式处理 CLI 输出
      await streamHermesCLI(conversationText, model, res, flush)

      clearInterval(heartbeat)
      res.write('data: [DONE]\n\n')
      flush()
      res.end()
    } catch (error) {
      clearInterval(heartbeat)
      console.error('Chat CLI error:', error.message)
      res.write(`data: ${JSON.stringify({ error: `Agent 执行失败: ${error.message}` })}\n\n`)
      flush()
      res.write('data: [DONE]\n\n')
      flush()
      res.end()
    }
  } else {
    // 非流式响应
    try {
      const { stdout, stderr } = await runHermesCLI(conversationText, model)
      const fullOutput = stdout + stderr
      const responseText = parseResponse(fullOutput) || 'Agent 未返回有效响应'

      res.json({
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'hermes-default',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: countTokens(conversationText),
          completion_tokens: countTokens(responseText),
          total_tokens: countTokens(conversationText) + countTokens(responseText),
        },
      })
    } catch (error) {
      console.error('Chat CLI error:', error.message)
      res.status(500).json({
        error: {
          message: `Agent 执行失败: ${error.message}`,
          type: 'internal_error',
        },
      })
    }
  }
})

/**
 * 流式运行 Hermes Agent CLI — 实时推送 stdout 块
 * @param {string} conversationText - 对话文本
 * @param {string} model - 模型名称（可选）
 * @param {import('express').Response} res - Express Response 对象
 * @param {Function} flush - 安全刷新函数
 */
function streamHermesCLI(conversationText, model, res, flush) {
  return new Promise((resolve, reject) => {
    const args = [
      HERMES_AGENT_CLI,
      '--query', conversationText,
      '--compact',
      '--quiet',
    ]

    if (model) {
      args.push('--model', model)
    }

    // -u: 强制 stdout/stderr 无缓冲，流式输出必须
    const proc = spawn(HERMES_PYTHON, ['-u', HERMES_AGENT_CLI, ...args], {
      cwd: HERMES_HOME,
      env: { ...process.env, HERMES_HOME },
    })

    let buffer = ''       // 用于拼接收尾的文本块
    let sentFirstChunk = false
    let totalCompletionTokens = 0   // 累计输出 token（估算）
    let completionBuffer = ''       // 收集完整输出用于最终统计

    proc.stdout.on('data', (data) => {
      buffer += data.toString()
      // 按行分割处理
      const lines = buffer.split('\n')
      // 保留最后一行（可能不完整）
      buffer = lines.pop()

      // 先把每行提取的内容收集起来，拼上原始换行符
      const extractedParts = []
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const text = extractResponseText(trimmed)
        if (text) extractedParts.push(text)
      }

      if (extractedParts.length === 0) return

      // 用 \n 拼接各行（保留换行结构），作为单个 SSE 事件发送
      const fullText = extractedParts.join('\n')
      res.write(`data: ${JSON.stringify({ content: fullText })}\n\n`)
      flush()
      sentFirstChunk = true
      completionBuffer += fullText + '\n'
      totalCompletionTokens = countTokens(completionBuffer)
    })

    proc.stderr.on('data', (data) => {
      // 忽略 stderr，只监控 stdout
    })

    proc.on('error', (err) => {
      reject(new Error(`CLI 启动失败: ${err.message}`))
    })

    proc.on('close', (code) => {
      // 处理剩余 buffer（可能是多行）
      const remaining = buffer.trim()
      if (remaining) {
        const textParts = remaining.split('\n').map((l) => extractResponseText(l.trim())).filter(Boolean)
        if (textParts.length > 0) {
          const fullText = textParts.join('\n')
          res.write(`data: ${JSON.stringify({ content: fullText })}\n\n`)
          flush()
          completionBuffer += fullText + '\n'
          totalCompletionTokens = countTokens(completionBuffer)
        }
      }

      // 发送最终 usage 统计
      const promptTokens = countTokens(conversationText)
      const completionTokens = totalCompletionTokens
      res.write(`data: ${JSON.stringify({
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        }
      })}\n\n`)
      flush()

      if (code === 0 || sentFirstChunk) {
        resolve()
      } else {
        reject(new Error(`CLI 异常退出 (code=${code})`))
      }
    })

    // 超时保护
    setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Agent 执行超时（120s）'))
    }, 120 * 1000)
  })
}

/**
 * 运行 Hermes Agent CLI 子进程（完整输出，用于非流式响应）
 * @param {string} conversationText - 对话文本
 * @param {string} model - 模型名称（可选）
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runHermesCLI(conversationText, model) {
  return new Promise((resolve, reject) => {
    const args = [
      HERMES_AGENT_CLI,
      '--query', conversationText,
      '--compact',
      '--quiet',
    ]

    if (model) {
      args.push('--model', model)
    }

    const proc = spawn(HERMES_PYTHON, args, {
      cwd: HERMES_HOME,
      env: { ...process.env, HERMES_HOME },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', data => { stdout += data.toString() })
    proc.stderr.on('data', data => { stderr += data.toString() })

    proc.on('error', err => {
      reject(new Error(`CLI 启动失败: ${err.message}`))
    })

    proc.on('close', code => {
      if (code === 0 || stdout) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`CLI 异常退出 (code=${code}): ${stderr.slice(0, 200)}`))
      }
    })

    // 超时保护
    setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Agent 执行超时（120s）'))
    }, 120 * 1000)
  })
}

/**
 * 从 CLI 单行输出中提取响应文本
 * 兼容 bordered box 格式和纯文本格式
 */
function extractResponseText(line) {
  // 跳过 session_id 行和元信息行
  if (line.startsWith('session_id:') || line.startsWith('╭') || line.startsWith('╰') || line.startsWith('─')) {
    return null
  }
  // 过滤边框字符
  const cleaned = line.replace(/^[│├└╭╰─]\s*[─]*.*[─]*[│├└╰─]$/, '').trim()
  if (!cleaned || /^[-─]{10,}$/.test(cleaned)) return null
  return cleaned
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default router
