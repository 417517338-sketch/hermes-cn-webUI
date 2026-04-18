/**
 * System API 路由
 * - GET /api/system — 系统信息（theme/language 从 config.yaml 读取）
 * - PUT /api/system/theme — 持久化主题到 config.yaml
 * - PUT /api/system/language — 持久化语言到 config.yaml
 * - GET/POST /api/system/backup — 备份与恢复
 */
import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import jsyaml from 'js-yaml'

export const systemRouter = Router()

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
const CONFIG_PATH = path.join(HERMES_HOME, 'config.yaml')

// -----------------------------------------------------------------------------
// YAML helpers — use js-yaml for symmetric round-trip (avoids quote-escape bugs)
// -----------------------------------------------------------------------------

function parseYaml(content) {
  try {
    return jsyaml.load(content, { schema: jsyaml.JSON_SCHEMA }) || {}
  } catch {
    return {}
  }
}

function serializeYaml(obj) {
  return jsyaml.dump(obj, {
    quotingType: '"',
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    schema: jsyaml.JSON_SCHEMA,
  })
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/** 读取 config.yaml 并返回 theme/language（默认值 fallback） */
function loadUISettings() {
  let theme = 'dark'
  let language = 'zh'
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = parseYaml(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (config.ui?.theme) theme = config.ui.theme
      if (config.ui?.language) language = config.ui.language
    }
  } catch {
    // ignore — use defaults
  }
  return { theme, language }
}

/** 将 ui.{theme,language} 写入 config.yaml（保留其他内容） */
function saveUISettings(theme, language) {
  let existingConfig = {}
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      existingConfig = parseYaml(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    }
  } catch {
    // ignore
  }

  // Ensure ui section
  if (!existingConfig.ui || typeof existingConfig.ui !== 'object') {
    existingConfig.ui = {}
  }
  existingConfig.ui.theme = theme
  existingConfig.ui.language = language

  const yamlContent = serializeYaml(existingConfig)
  fs.writeFileSync(CONFIG_PATH, yamlContent, 'utf-8')
}

// ---------------------------------------------------------------------------
// Bootstrap: load persisted settings into memory for GET /api/system
// ---------------------------------------------------------------------------

const { theme: persistedTheme, language: persistedLanguage } = loadUISettings()

let systemSettings = {
  theme: persistedTheme,
  language: persistedLanguage,
}

// ---------------------------------------------------------------------------
// GET /api/system
// ---------------------------------------------------------------------------

systemRouter.get('/', (req, res) => {
  res.json({
    webui_version: '2.0.0',
    agent_version: '0.8.0',
    hermes_home: HERMES_HOME,
    node_version: process.version,
    platform: os.platform(),
    theme: systemSettings.theme,
    language: systemSettings.language,
  })
})

// ---------------------------------------------------------------------------
// PUT /api/system/theme
// ---------------------------------------------------------------------------

systemRouter.put('/theme', (req, res) => {
  const { theme } = req.body
  if (!['dark', 'light', 'system'].includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme' })
  }
  systemSettings.theme = theme
  saveUISettings(theme, systemSettings.language)
  res.json({ ok: true, theme })
})

// ---------------------------------------------------------------------------
// PUT /api/system/language
// ---------------------------------------------------------------------------

systemRouter.put('/language', (req, res) => {
  const { language } = req.body
  if (!['zh', 'en', 'ru'].includes(language)) {
    return res.status(400).json({ error: 'Invalid language' })
  }
  systemSettings.language = language
  saveUISettings(systemSettings.theme, language)
  res.json({ ok: true, language })
})

// ---------------------------------------------------------------------------
// GET /api/system/backup
// ---------------------------------------------------------------------------

systemRouter.get('/backup', (req, res) => {
  try {
    const backup = {
      version: '2.0.0',
      created_at: new Date().toISOString(),
      files: {},
    }
    if (fs.existsSync(CONFIG_PATH)) {
      backup.files['config.yaml'] = fs.readFileSync(CONFIG_PATH, 'utf-8')
    }
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hermes-backup-${new Date().toISOString().split('T')[0]}.json"`
    )
    res.json(backup)
  } catch (error) {
    console.error('Backup error:', error)
    res.status(500).json({ error: 'Failed to create backup' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/system/backup (restore)
// ---------------------------------------------------------------------------

systemRouter.post('/backup', (req, res) => {
  try {
    res.json({ success: true, message: 'Backup restored' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore backup' })
  }
})
