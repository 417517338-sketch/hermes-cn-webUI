import { Router } from 'express'
import { readdirSync, statSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export const skillsRouter = Router()

const SKILLS_DIR = join(process.env.HOME || '', '.hermes', 'skills')

function parseSkillFile(name, filePath) {
  try {
    const stat = statSync(filePath)
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
      name,
      description,
      category,
      enabled: true, // Skills are file-based; all discovered skills are considered "enabled"
    }
  } catch {
    return {
      name,
      description: '',
      category: 'custom',
      enabled: true,
    }
  }
}

function listSkillsFromDisk(search, category) {
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
          // This directory is a skill (e.g. apple-notes, github-pr-workflow)
          const skill = parseSkillFile(entry, skillMd)
          // Use parent category as fallback if skill has no category
          if (!skill.category || skill.category === 'custom') {
            skill.category = parentCategory || 'custom'
          }
          skills.push(skill)
        } else {
          // Recurse into subdirectory (category folder)
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

// PUT /api/skills/toggle — enable/disable a skill
skillsRouter.put('/toggle', (req, res) => {
  const { name, enabled } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  // Skills are file-based; runtime toggle is acknowledged but not persisted
  // In a real implementation this would update config.yaml or a skills.json
  res.json({ ok: true })
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
    name,
    description: content.slice(0, 200).replace(/[#*`\n]/g, '').trim(),
    category,
    enabled: true,
  }

  res.json(skill)
})
