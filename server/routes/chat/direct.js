/**
 * Direct Chat API 路由
 * @description 非-Agent 模式的直接对话接口，跳过 Agent 循环
 * @description 直接调用底层 LLM Provider API（普通模式）
 * @description POST /api/chat/direct
 */
import { Router } from 'express'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERMES_HOME = resolve(homedir(), '.hermes')
const ENV_PATH = resolve(HERMES_HOME, '.env')
const CONFIG_PATH = resolve(HERMES_HOME, 'config.yaml')
const SCRIPT_DIR = resolve(__dirname, '..', '..', '..', 'scripts')

const router = Router()

// Provider 配置映射
const PROVIDER_CONFIG = {
  'minimax-cn': {
    envKey: 'MINIMAX_CN_API_KEY',
    baseUrlKey: 'MINIMAX_CN_BASE_URL',
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
  },
  'openai': {
    envKey: 'OPENAI_API_KEY',
    baseUrlKey: 'OPENAI_BASE_URL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
  },
  'anthropic': {
    envKey: 'ANTHROPIC_API_KEY',
    baseUrlKey: 'ANTHROPIC_BASE_URL',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    modelName: 'claude-3-5-sonnet-20241022',
    authHeader: 'x-api-key',
  },
  'openrouter': {
    envKey: 'OPENROUTER_API_KEY',
    baseUrlKey: 'OPENROUTER_BASE_URL',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    modelName: 'anthropic/claude-3.5-sonnet',
  },
  'nous': {
    envKey: 'NOUS_API_KEY',
    baseUrlKey: 'NOUS_BASE_URL',
    defaultBaseUrl: 'https://api.nousresearch.com/v1',
    modelName: 'nousresearch/hermes-3-llama-3.1-405b',
  },
}

/**
 * 解析 .env 文件
 */
function parseEnvFile(content) {
  const keys = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    keys[key] = value
  }
  return keys
}

/**
 * 解析 config.yaml 中的 model 配置
 */
function parseModelConfig(content) {
  let model = 'MiniMax-M2.7'
  let provider = 'minimax-cn'
  let baseUrl = ''

  const lines = content.split('\n')
  let inTopLevelModelSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === 'model:' && line.search(/\S/) === 0) {
      inTopLevelModelSection = true
      continue
    }

    if (line.search(/\S/) === 0 && trimmed.includes(':') && !trimmed.startsWith('#')) {
      if (inTopLevelModelSection) break
    }

    if (!inTopLevelModelSection) continue

    if (trimmed.startsWith('default:')) {
      model = trimmed.replace('default:', '').trim()
    } else if (trimmed.startsWith('provider:')) {
      provider = trimmed.replace('provider:', '').trim()
    } else if (trimmed.startsWith('base_url:')) {
      baseUrl = trimmed.replace('base_url:', '').trim().replace(/"/g, '')
    }
  }

  return { model, provider, base_url: baseUrl }
}

/**
 * 估算 token 数量（粗略）
 */
function countTokens(text) {
  return Math.ceil(text.length / 4)
}

/**
 * 获取 Provider 配置
 */
function getProviderConfig(provider, model) {
  const config = PROVIDER_CONFIG[provider]
  if (!config) {
    throw new Error(`不支持的 Provider: ${provider}`)
  }
  return config
}

/**
 * 从 credential pool 获取下一个可用 key（通过 Python bridge）
 * 失败时返回 null
 */
function getCredentialFromPool(provider) {
  try {
    const scriptPath = resolve(SCRIPT_DIR, 'get_next_credential.py')
    const output = execSync(`python3 "${scriptPath}" ${provider}`, {
      timeout: 10000,
      encoding: 'utf-8',
    })
    const result = JSON.parse(output.trim())
    const cred = result[provider]
    if (cred && cred.token && cred.token !== '***') {
      return cred
    }
    return null
  } catch (e) {
    console.error('getCredentialFromPool error:', e.message)
    return null
  }
}

/**
 * 调用 LLM API
 * @param {string} provider - Provider ID
 * @param {string} model - Model name
 * @param {Array} messages - Messages array
 * @param {boolean} stream - 是否流式
 * @param {object} options - 其他选项
 */
async function callLLMAPI(provider, model, messages, stream = false, options = {}) {
  const config = getProviderConfig(provider, model)

  // 读取 .env
  let envKeys = {}
  try {
    const envContent = readFileSync(ENV_PATH, 'utf-8')
    envKeys = parseEnvFile(envContent)
  } catch (e) {
    throw new Error(`无法读取 .env 文件: ${e.message}`)
  }

  // 优先从 credential pool 获取（支持 key 轮换）
  let apiKey = ''
  let baseUrl = envKeys[config.baseUrlKey] || config.defaultBaseUrl

  const poolCred = getCredentialFromPool(provider)
  if (poolCred) {
    apiKey = poolCred.token
    // base_url 仍用 .env/config 的（pool 的 inference_base_url 路径可能不对，如 /anthropic）
    console.log(`[direct] Using credential pool: label=${poolCred.label}, base_url=${baseUrl}`)
  } else {
    // Fallback: 从 .env 读取
    apiKey = envKeys[config.envKey]
    if (!apiKey) {
      throw new Error(`${config.envKey} 未设置，请先在设置中配置 API Key`)
    }
    console.log(`[direct] Using .env fallback: ${config.envKey}`)
  }

  // 读取 config.yaml 覆盖（仅当没有 pool credential 时）
  if (!poolCred) {
    try {
      const configContent = readFileSync(CONFIG_PATH, 'utf-8')
      const modelConfig = parseModelConfig(configContent)
      if (modelConfig.base_url) {
        baseUrl = modelConfig.base_url.replace(/"/g, '')
      }
    } catch (e) {
      // ignore
    }
  }

  // 构建请求
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const requestBody = {
    model: model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream,
  }

  if (options.temperature) requestBody.temperature = options.temperature
  if (options.max_tokens) requestBody.max_tokens = options.max_tokens

  const headers = {
    'Content-Type': 'application/json',
  }

  if (config.authHeader) {
    headers[config.authHeader] = apiKey
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(120 * 1000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 请求失败: HTTP ${response.status} - ${errorText.slice(0, 200)}`)
  }

  return response
}

/**
 * POST /api/chat/direct
 * 直接对话接口 - 调用底层 LLM Provider API
 */
router.post('/', async (req, res) => {
  const { messages, model, provider, stream = false, temperature, max_tokens } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: 'messages is required and must be an array',
        type: 'invalid_request_error',
      },
    })
  }

  // 获取当前配置的 provider 和 model
  let currentModel = model
  let currentProvider = provider

  if (!currentProvider) {
    try {
      const configContent = readFileSync(CONFIG_PATH, 'utf-8')
      const modelConfig = parseModelConfig(configContent)
      currentProvider = modelConfig.provider
      currentModel = currentModel || modelConfig.model
    } catch (e) {
      currentProvider = 'minimax-cn'
      currentModel = currentModel || 'MiniMax-M2.7'
    }
  }

  // 安全 flush
  const flush = () => {
    try { res.flush?.() } catch (_) {}
    try { res.res?.flush?.() } catch (_) {}
  }

  try {
    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`)
      flush()

      // 心跳保活
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n')
        flush()
      }, 15000)

      try {
        const response = await callLLMAPI(
          currentProvider,
          currentModel,
          messages,
          true,
          { temperature, max_tokens }
        )

        let fullContent = ''
        let buffer = ''

        // 处理流式响应
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6)
              if (dataStr === '[DONE]') continue

              try {
                const data = JSON.parse(dataStr)
                let content = null

                // OpenAI 格式
                if (data.choices?.[0]?.delta?.content) {
                  content = data.choices[0].delta.content
                } else if (data.content) {
                  content = data.content
                }

                if (content) {
                  fullContent += content
                  // Direct 模式不使用工具，直接标记为输出中
                  res.write(`data: ${JSON.stringify({ content, status: 'outputting' })}\n\n`)
                  flush()
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }

        // 处理剩余 buffer
        if (buffer.trim() && buffer.trim() !== '[DONE]') {
          const trimmed = buffer.trim()
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6))
              if (data.choices?.[0]?.delta?.content) {
                fullContent += data.choices[0].delta.content
              } else if (data.content) {
                fullContent += data.content
              }
            } catch (e) {}
          }
        }

        clearInterval(heartbeat)

        // 发送 usage
        const promptTokens = countTokens(JSON.stringify(messages))
        const completionTokens = countTokens(fullContent)
        res.write(`data: ${JSON.stringify({
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          }
        })}\n\n`)
        res.write('data: [DONE]\n\n')
        flush()
        res.end()

      } catch (err) {
        clearInterval(heartbeat)
        throw err
      }

    } else {
      // 非流式响应
      const response = await callLLMAPI(
        currentProvider,
        currentModel,
        messages,
        false,
        { temperature, max_tokens }
      )

      const data = await response.json()

      let content = null
      if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content
      } else if (data.content) {
        content = data.content
      }

      if (content === null) {
        throw new Error(`无效的响应格式: ${JSON.stringify(data).slice(0, 200)}`)
      }

      res.json({
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: currentModel,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        }],
        usage: data.usage || {
          prompt_tokens: countTokens(JSON.stringify(messages)),
          completion_tokens: countTokens(content),
          total_tokens: countTokens(JSON.stringify(messages)) + countTokens(content),
        },
      })
    }

  } catch (err) {
    console.error('Direct chat error:', err.message)
    // 流式模式下 headers 可能已经发送（已发送 thinking 状态）
    // 此时不能再调 res.status().json()，改为发送 SSE 错误事件
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: `LLM API 调用失败: ${err.message}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    } else {
      res.status(503).json({
        error: {
          message: `LLM API 调用失败: ${err.message}`,
          type: 'internal_error',
        },
      })
    }
  }
})

export default router
