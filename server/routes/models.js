/**
 * Models API 路由
 * @description 获取当前配置的模型和可用模型列表
 */
import { Router } from 'express'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import jsyaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = Router()

const CONFIG_PATH = resolve(homedir(), '.hermes', 'config.yaml')

/**
 * 常用模型列表（用于快速选择）
 * 实际可用模型由 provider 决定
 */
const COMMON_MODELS = [
  // MiniMax
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', provider: 'minimax-cn', provider_name: 'MiniMax China' },
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax-cn', provider_name: 'MiniMax China' },
  // Anthropic
  { id: 'anthropic/claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', provider_name: 'Anthropic' },
  { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', provider_name: 'Anthropic' },
  { id: 'anthropic/claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', provider_name: 'Anthropic' },
  { id: 'anthropic/claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', provider_name: 'Anthropic' },
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', provider_name: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', provider_name: 'OpenAI' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', provider_name: 'OpenAI' },
  // OpenRouter
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6 (OR)', provider: 'openrouter', provider_name: 'OpenRouter' },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', provider: 'openrouter', provider_name: 'OpenRouter' },
  { id: 'google/gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro', provider: 'openrouter', provider_name: 'OpenRouter' },
  { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', provider: 'openrouter', provider_name: 'OpenRouter' },
  // Nous
  { id: 'nousresearch/hermes-3-llama-3.1-405b', name: 'Hermes 3 405B', provider: 'nous', provider_name: 'Nous' },
  { id: 'nousresearch/hermes-2-llama-3-70b', name: 'Hermes 2 70B', provider: 'nous', provider_name: 'Nous' },
  // Local / Custom — Ollama 等本地模型（base_url 必填）
  { id: 'llama3', name: 'Llama 3 (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'llama3.1', name: 'Llama 3.1 (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'codellama', name: 'CodeLlama (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'mistral', name: 'Mistral (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'qwen2.5', name: 'Qwen 2.5 (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'qwen2.5-coder', name: 'Qwen2.5-Coder (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'deepseek-coder', name: 'DeepSeek-Coder (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'phi3', name: 'Phi-3 (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'gemma2', name: 'Gemma 2 (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
  { id: 'mixtral', name: 'Mixtral (Ollama)', provider: 'custom', provider_name: 'Local/Ollama' },
]

/**
 * 使用 jsyaml 解析 config.yaml 中的 model 配置
 * 避免行解析导致的引号/转义嵌套污染问题
 */
function parseModelConfig(content) {
  let model = 'MiniMax-M2.7-highspeed'
  let provider = 'minimax-cn'
  let baseUrl = ''

  try {
    // 使用与 config.js 完全相同的 jsyaml 解析逻辑
    const parsed = jsyaml.load(content, { schema: jsyaml.JSON_SCHEMA })
    if (parsed && parsed.model) {
      model = parsed.model.default || model
      provider = parsed.model.provider || provider
      baseUrl = parsed.model.base_url || ''
    }
  } catch (err) {
    console.error('parseModelConfig: YAML parse error:', err.message)
  }

  return { model, provider, base_url: baseUrl }
}

/**
 * GET /api/models
 * 获取当前配置的模型和可用模型列表
 */
router.get('/', async (req, res) => {
  try {
    let currentConfig = { model: 'MiniMax-M2.7-highspeed', provider: 'minimax-cn', base_url: '' }

    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8')
      currentConfig = parseModelConfig(content)
    } catch (e) {
      // Config not found, use defaults
    }

    // Filter models by current provider for quick selection
    const quickModels = COMMON_MODELS.filter(m => m.provider === currentConfig.provider)

    res.json({
      current: currentConfig,
      quick_selection: quickModels.length > 0 ? quickModels : COMMON_MODELS.slice(0, 5),
      all_models: COMMON_MODELS,
    })
  } catch (error) {
    console.error('Models API error:', error)
    res.status(500).json({ error: 'Failed to load models' })
  }
})

/**
 * GET /api/models/current
 * 获取当前模型（简化版）
 */
router.get('/current', async (req, res) => {
  try {
    let currentConfig = { model: 'MiniMax-M2.7-highspeed', provider: 'minimax-cn' }

    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8')
      currentConfig = parseModelConfig(content)
    } catch (e) {
      // Use defaults
    }

    res.json({
      model: currentConfig.model,
      provider: currentConfig.provider,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to load current model' })
  }
})

export default router
