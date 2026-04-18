import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export const keysRouter = Router()

const HERMES_HOME = process.env.HERMES_HOME || join(process.env.HOME || '~', '.hermes')
const ENV_PATH = join(HERMES_HOME, '.env')

const PROVIDER_PATTERNS = [
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/keys', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'OpenAI', key: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Anthropic', key: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/settings/keys', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Google AI', key: 'GOOGLE_API_KEY', url: 'https://aistudio.google.com/app/apikey', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com/api_keys', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Groq', key: 'GROQ_API_KEY', url: 'https://console.groq.com/keys', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Mistral', key: 'MISTRAL_API_KEY', url: 'https://console.mistral.ai/api-keys/', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Tavily', key: 'TAVILY_API_KEY', url: 'https://app.tavily.com/home', category: 'provider', is_password: true, tools: ['web'], advanced: false },
  { name: 'Serper', key: 'SERPER_API_KEY', url: 'https://serper.dev/api-key', category: 'provider', is_password: true, tools: ['web'], advanced: false },
  { name: 'Firecrawl', key: 'FIRECRAWL_API_KEY', url: 'https://www.firecrawl.dev/dashboard', category: 'provider', is_password: true, tools: ['web'], advanced: false },
  { name: 'Exa', key: 'EXA_API_KEY', url: 'https://exa.ai', category: 'provider', is_password: true, tools: ['web'], advanced: false },
  { name: 'Browserbase', key: 'BROWSERBASE_API_KEY', url: 'https://www.browserbase.com', category: 'provider', is_password: true, tools: ['browser'], advanced: true },
  { name: 'FAL', key: 'FAL_API_KEY', url: 'https://fal.ai', category: 'provider', is_password: true, tools: ['image_gen'], advanced: false },
  { name: 'Hugging Face', key: 'HF_TOKEN', url: 'https://huggingface.co/settings/tokens', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'Kimi/Moonshot', key: 'KIMI_API_KEY', url: 'https://platform.kimi.ai', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'MiniMax', key: 'MINIMAX_API_KEY', url: 'https://www.minimax.io', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'MiniMax CN', key: 'MINIMAX_CN_API_KEY', url: 'https://www.minimax.io', category: 'provider', is_password: true, tools: [], advanced: false },
  { name: 'GLM/z.ai', key: 'GLM_API_KEY', url: 'https://z.ai', category: 'provider', is_password: true, tools: [], advanced: false },
]

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

function serializeEnvFile(keys) {
  const lines = ['# Hermes Agent Environment Configuration', '# Copy this file to .env and fill in your API keys', '']
  for (const [key, value] of Object.entries(keys)) {
    if (value && value.length > 0) {
      if (value.includes(':') || value.includes(' ') || value.includes('"')) {
        lines.push(`${key}="${value.replace(/"/g, '\\"')}"`)
      } else {
        lines.push(`${key}=${value}`)
      }
    }
  }
  return lines.join('\n') + '\n'
}

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  if (key.startsWith('sk-') || key.startsWith('sk-ant') || key.startsWith('sk-or')) {
    return key.slice(0, 6) + '••••••••••••••••'
  }
  return key.slice(0, 4) + '••••••••••••••••'
}

// GET /api/keys — list all known API keys as Record<string, EnvVarInfo>
keysRouter.get('/', (req, res) => {
  try {
    let envKeys = {}
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8')
      envKeys = parseEnvFile(content)
    }

    const keys = []
    for (const provider of PROVIDER_PATTERNS) {
      const value = envKeys[provider.key] || ''
      keys.push({
        id: provider.key,
        name: provider.name,
        key: provider.key,
        value: null,
        masked: value ? maskKey(value) : null,
        hasKey: !!value,
        valid: undefined,
        url: provider.url,
      })
    }

    const knownKeys = new Set(PROVIDER_PATTERNS.map(p => p.key))
    for (const [key, value] of Object.entries(envKeys)) {
      if (!knownKeys.has(key) && value) {
        keys.push({
          id: key,
          name: key,
          key: key,
          value: null,
          masked: maskKey(value),
          hasKey: true,
          valid: undefined,
          url: null,
        })
      }
    }

    res.json({ keys })
  } catch (err) {
    console.error('Error reading keys:', err)
    res.status(500).json({ error: 'Failed to read keys', details: err.message })
  }
})

// PUT /api/keys — update a specific API key
keysRouter.put('/', (req, res) => {
  try {
    const { key, value } = req.body
    if (!key) return res.status(400).json({ error: 'Key name is required' })

    let envKeys = {}
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8')
      envKeys = parseEnvFile(content)
    }

    if (value === null || value === undefined || value === '') {
      delete envKeys[key]
    } else {
      envKeys[key] = value
    }

    writeFileSync(ENV_PATH, serializeEnvFile(envKeys), 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    console.error('Error writing keys:', err)
    res.status(500).json({ error: 'Failed to write keys', details: err.message })
  }
})

// POST /api/keys/test — validate an API key by making a test request
keysRouter.post('/test', async (req, res) => {
  try {
    const { key } = req.body
    if (!key) return res.status(400).json({ success: false, message: 'Key is required' })

    // Detect provider from key format
    let provider = 'unknown'
    let testUrl = ''
    let testHeaders = {}
    let testBody = null

    if (key.startsWith('sk-') || key.startsWith('sk-ant') || key.startsWith('sk-or')) {
      // Could be OpenAI, Anthropic, or OpenRouter — try OpenAI format first
      provider = 'openai'
      testUrl = 'https://api.openai.com/v1/models'
      testHeaders = { 'Authorization': `Bearer ${key}`, 'Content-Length': '0' }
    } else if (key.startsWith('AIza')) {
      provider = 'google'
      testUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + key
      testHeaders = {}
    } else if (key.startsWith('sk-')) {
      provider = 'openrouter'
      testUrl = 'https://openrouter.ai/api/v1/models'
      testHeaders = { 'Authorization': `Bearer ${key}` }
    } else if (key.startsWith('sk-ant-api')) {
      provider = 'anthropic'
      testUrl = 'https://api.anthropic.com/v1/messages'
      testHeaders = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
      testBody = JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
    } else {
      // Generic test — try OpenAI as most common
      provider = 'openai'
      testUrl = 'https://api.openai.com/v1/models'
      testHeaders = { 'Authorization': `Bearer ${key}`, 'Content-Length': '0' }
    }

    try {
      const fetchOptions = {
        method: testBody ? 'POST' : 'GET',
        headers: testHeaders,
      }
      if (testBody) fetchOptions.body = testBody

      const response = await fetch(testUrl, fetchOptions)
      if (response.ok) {
        res.json({ success: true, message: `${provider} key is valid` })
      } else {
        const errorText = await response.text().catch(() => 'Unknown error')
        let message = `${provider} key validation failed (${response.status})`
        try {
          const errJson = JSON.parse(errorText)
          if (errJson.error?.message) message = errJson.error.message
          else if (errJson.error) message = errJson.error
        } catch {}
        res.json({ success: false, message })
      }
    } catch (fetchErr) {
      res.json({ success: false, message: `Connection failed: ${fetchErr.message}` })
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/keys — delete a key
keysRouter.delete('/', (req, res) => {
  try {
    const { key } = req.body
    if (!key) return res.status(400).json({ error: 'Key name is required' })

    let envKeys = {}
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8')
      envKeys = parseEnvFile(content)
    }

    delete envKeys[key]
    writeFileSync(ENV_PATH, serializeEnvFile(envKeys), 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting key:', err)
    res.status(500).json({ error: 'Failed to delete key', details: err.message })
  }
})
