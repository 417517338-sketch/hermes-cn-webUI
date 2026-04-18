import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import jsyaml from 'js-yaml'

export const configRouter = Router()

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERMES_HOME = process.env.HERMES_HOME || join(process.env.HOME || '~', '.hermes')
const CONFIG_PATH = join(HERMES_HOME, 'config.yaml')

// Read YAML — js-yaml handles all escape/quote edge cases correctly.
// Using JSON_SCHEMA to keep all scalar values as-is (no YAML 1.1 type inference
// like yes/no → boolean, which avoids silent type changes on round-trip).
function parseYaml(content) {
  try {
    return jsyaml.load(content, { schema: jsyaml.JSON_SCHEMA })
  } catch (err) {
    // Fallback: return empty object so the server still starts
    console.error('YAML parse error:', err.message)
    return {}
  }
}

// Write YAML — js-yaml.dump produces correct YAML 1.1 double-quoted strings
// with proper escape sequences for all special characters. This is symmetric
// with js-yaml.load and eliminates the quote-escaping bugs in the old
// hand-rolled serializer.
function serializeYaml(obj) {
  return jsyaml.dump(obj, {
    quotingType: '"',
    lineWidth: -1,      // no wrapping
    noRefs: true,       // no YAML anchors/references
    sortKeys: false,    // preserve key order
    schema: jsyaml.JSON_SCHEMA,
  })
}

// GET /api/config - Read current config
configRouter.get('/', (req, res) => {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const config = parseYaml(content)
    res.json({ config })
  } catch (err) {
    console.error('Error reading config:', err)
    res.status(500).json({ error: 'Failed to read config', details: err.message })
  }
})

// PUT /api/config - Write config (merge with existing)
configRouter.put('/', (req, res) => {
  try {
    const newConfig = req.body

    // Read existing config
    let existingConfig = {}
    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8')
      existingConfig = parseYaml(content)
    } catch {
      // File doesn't exist or can't be read, start fresh
    }

    // Deep merge: newConfig takes precedence
    const mergedConfig = deepMerge(existingConfig, newConfig)

    // Serialize back to YAML
    const yamlContent = serializeYaml(mergedConfig)

    // Write back
    writeFileSync(CONFIG_PATH, yamlContent, 'utf-8')

    res.json({ success: true, config: mergedConfig })
  } catch (err) {
    console.error('Error writing config:', err)
    res.status(500).json({ error: 'Failed to write config', details: err.message })
  }
})

// Helper: deep merge objects
function deepMerge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key]) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

// GET /api/config/raw — return raw YAML content
configRouter.get('/raw', (req, res) => {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, 'utf-8')
      res.json({ yaml: content })
    } else {
      res.json({ yaml: '' })
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read config', details: err.message })
  }
})

// PUT /api/config/raw — write raw YAML content (no parse/merge, direct write)
configRouter.put('/raw', (req, res) => {
  try {
    const { yaml_text } = req.body
    if (typeof yaml_text !== 'string') {
      return res.status(400).json({ error: 'yaml_text is required and must be a string' })
    }
    writeFileSync(CONFIG_PATH, yaml_text, 'utf-8')
    res.json({ success: true })
  } catch (err) {
    console.error('Error writing raw config:', err)
    res.status(500).json({ error: 'Failed to write config', details: err.message })
  }
})

// GET /api/config/diff - Get diff between current and default config
configRouter.get('/diff', (req, res) => {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const config = parseYaml(content)

    // Run hermes config check to get diff info
    let diff = null
    try {
      const output = execSync('hermes config check 2>&1', { encoding: 'utf-8' })
      diff = output
    } catch {
      // hermes config check might fail if config is fine
    }

    res.json({ diff, config })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get config diff', details: err.message })
  }
})
