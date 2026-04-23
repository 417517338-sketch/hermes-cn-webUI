import { Router } from 'express'
import { readdirSync, statSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export const skillsRouter = Router()

const SKILLS_DIR = join(process.env.HOME || '', '.hermes', 'skills')
const SKILLS_CONFIG = join(process.env.HOME || '', '.hermes', 'skills-config.json')

// Load enabled/disabled state from config file
function loadSkillsConfig() {
  try {
    if (existsSync(SKILLS_CONFIG)) {
      return JSON.parse(readFileSync(SKILLS_CONFIG, 'utf-8'))
    }
  } catch {}
  return {}
}

// Save enabled/disabled state to config file
function saveSkillsConfig(config) {
  try {
    const dir = join(process.env.HOME || '', '.hermes')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(SKILLS_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save skills config:', err)
  }
}

// Get enabled state for a skill
function isSkillEnabled(skillName, config) {
  if (config[skillName] === undefined) {
    return true
  }
  return config[skillName] === true
}

function parseSkillFile(name, filePath, config) {
  try {
    const content = readFileSync(filePath, 'utf-8')

    // Extract category from frontmatter
    const categoryMatch = content.match(/category:\s*(\S+)/)
    const category = categoryMatch ? categoryMatch[1] : 'custom'

    // Extract description — first non-empty non-frontmatter line
    const lines = content.split('\n')
    let description = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('category:') && !trimmed.startsWith('name:') && !trimmed.startsWith('trigger:')) {
        description = trimmed.slice(0, 200)
        break
      }
    }

    return {
      id: name,
      name,
      description,
      category,
      enabled: isSkillEnabled(name, config),
    }
  } catch {
    return {
      id: name,
      name,
      description: '',
      category: 'custom',
      enabled: true,
    }
  }
}

function listSkillsFromDisk(search, category) {
  const config = loadSkillsConfig()
  if (!existsSync(SKILLS_DIR)) return []

  const skills = []

  function scanDir(dir, parentCategory) {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        const skillMd = join(fullPath, 'SKILL.md')
        if (existsSync(skillMd)) {
          const skill = parseSkillFile(entry, skillMd, config)
          if (!skill.category || skill.category === 'custom') {
            skill.category = parentCategory || 'custom'
          }
          skills.push(skill)
        } else {
          scanDir(fullPath, entry)
        }
      }
    }
  }

  scanDir(SKILLS_DIR, 'custom')

  if (search) {
    const q = search.toLowerCase()
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    )
  }

  if (category && category !== 'all') {
    return skills.filter(s => s.category === category)
  }

  return skills
}

// GET /api/skills
skillsRouter.get('/', (req, res) => {
  const { search, category } = req.query
  const skills = listSkillsFromDisk(search, category)
  res.json(skills)
})

// PUT /api/skills/:id — enable/disable a skill
skillsRouter.put('/:id', (req, res) => {
  const { id } = req.params
  const { enabled } = req.body

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' })
  }

  const config = loadSkillsConfig()
  config[id] = enabled
  saveSkillsConfig(config)

  res.json({ id, enabled, ok: true })
})

// POST /api/skills/import — import a skill from content
skillsRouter.post('/import', (req, res) => {
  const { name, content } = req.body
  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required' })
  }

  // Extract category from content
  const categoryMatch = content.match(/category:\s*(\S+)/)
  const category = categoryMatch ? categoryMatch[1] : 'custom'

  const skillDir = join(SKILLS_DIR, name)
  try {
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8')
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write skill file', details: err.message })
  }

  const skill = {
    id: name,
    name,
    description: content.slice(0, 200).replace(/[#*`\n]/g, '').trim(),
    category,
    enabled: true,
  }

  res.json(skill)
})
