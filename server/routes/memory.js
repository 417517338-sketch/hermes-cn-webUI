import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, statSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

export const memoryRouter = Router()

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERMES_HOME = process.env.HERMES_HOME || join(process.env.HOME || '~', '.hermes')
const MEMORIES_DIR = join(HERMES_HOME, 'memories')
const MEMORY_FILE = join(MEMORIES_DIR, 'MEMORY.md')
const USER_FILE = join(MEMORIES_DIR, 'USER.md')
const MANIFEST_FILE = join(MEMORIES_DIR, '.manifest.jsonl')

// Entry delimiter used by Hermes MemoryStore
const ENTRY_DELIMITER = '\n§\n'

// Memory character limits (from memory_tool.py)
const MEMORY_CHAR_LIMIT = 2200
const USER_CHAR_LIMIT = 1375

/**
 * Generate a stable SHA-256 based ID from entry content.
 * Uses the full content (not just first 50 chars) to avoid collisions.
 */
function generateEntryId(type, content) {
  const hash = createHash('sha256').update(content, 'utf8').digest('base64')
  const safe = hash.replace(/[/+=]/g, '_').slice(0, 16)
  return `${type}_${safe}`
}

/**
 * Robustly split a memory file into entries.
 * Handles both '§\n' and '\n§\n' delimiter patterns that Hermes produces.
 */
function splitEntries(content) {
  // Normalize: replace all variants of §+newline separators with a canonical one
  // Pattern: § followed by optional whitespace/newline variations
  const normalized = content.replace(/§\s*\n\s*/g, '§\n')
  const entries = normalized.split('\n§\n').map(e => e.trim()).filter(e => e && e !== '§')
  return entries
}

/**
 * Load manifest (id → entry mapping) for stable ID lookups.
 * Manifest format: one JSON per line: {"id": "...", "content": "...", "file": "MEMORY.md"}
 */
function loadManifest() {
  const map = new Map()
  if (!existsSync(MANIFEST_FILE)) return map
  try {
    const lines = readFileSync(MANIFEST_FILE, 'utf8').split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const { id, content, file } = JSON.parse(line)
        if (id && content) {
          map.set(id, { id, content, file })
        }
      } catch {}
    }
  } catch {}
  return map
}

/**
 * Persist manifest back to disk atomically (write to temp, then rename).
 */
function saveManifest(manifest) {
  const lines = []
  for (const entry of manifest.values()) {
    lines.push(JSON.stringify({ id: entry.id, content: entry.content, file: entry.file }))
  }
  const tmp = MANIFEST_FILE + '.tmp'
  writeFileSync(tmp, lines.join('\n'), 'utf8')
  // Atomic rename
  renameSync(tmp, MANIFEST_FILE)
}

/**
 * Sync in-memory manifest with actual file content.
 * Rebuilds manifest from current MEMORY.md and USER.md files.
 */
function syncManifest(manifest) {
  const files = [
    { path: MEMORY_FILE, type: 'memory' },
    { path: USER_FILE, type: 'user' },
  ]
  for (const { path, type } of files) {
    if (!existsSync(path)) continue
    const content = readFileSync(path, 'utf8')
    const entries = splitEntries(content)
    for (const entryContent of entries) {
      const id = generateEntryId(type, entryContent)
      manifest.set(id, { id, content: entryContent, file: path })
    }
  }
  saveManifest(manifest)
}

// In-memory manifest: id → { id, content, file }
// Lazy-initialized on first request
let _manifest = null
let _manifestLoaded = false

function getManifest() {
  if (!_manifestLoaded) {
    _manifest = loadManifest()
    _manifestLoaded = true
  }
  return _manifest
}

// Parse memory entries from a file
function parseMemoryEntries(filePath, type) {
  const entries = []
  const manifest = getManifest()

  if (!existsSync(filePath)) {
    return entries
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const fileStat = statSync(filePath)
    const fileEntries = splitEntries(content)

    for (const entryContent of fileEntries) {
      if (!entryContent.trim()) continue
      const id = generateEntryId(type, entryContent)

      // Update manifest with this entry
      manifest.set(id, { id, content: entryContent, file: filePath })

      entries.push({
        id,
        content: entryContent,
        created_at: fileStat.mtime.toISOString(),
        type,
      })
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err)
  }

  return entries
}

// Calculate memory stats using robust splitting
function getMemoryStats() {
  let memoryChars = 0
  let userChars = 0

  try {
    if (existsSync(MEMORY_FILE)) {
      const content = readFileSync(MEMORY_FILE, 'utf-8')
      const entries = splitEntries(content)
      memoryChars = entries.map(e => e.trim()).join('').length
    }

    if (existsSync(USER_FILE)) {
      const content = readFileSync(USER_FILE, 'utf-8')
      const entries = splitEntries(content)
      userChars = entries.map(e => e.trim()).join('').length
    }
  } catch (err) {
    console.error('Error calculating memory stats:', err)
  }

  return {
    memory: {
      used: memoryChars,
      limit: MEMORY_CHAR_LIMIT,
      percentage: Math.round((memoryChars / MEMORY_CHAR_LIMIT) * 100),
    },
    user: {
      used: userChars,
      limit: USER_CHAR_LIMIT,
      percentage: Math.round((userChars / USER_CHAR_LIMIT) * 100),
    },
  }
}

// GET /api/memory - List all memory entries
memoryRouter.get('/', (req, res) => {
  try {
    const memoryEntries = parseMemoryEntries(MEMORY_FILE, 'memory')
    const userEntries = parseMemoryEntries(USER_FILE, 'user')
    const stats = getMemoryStats()

    res.json({
      memories: [...memoryEntries, ...userEntries],
      stats,
    })
  } catch (err) {
    console.error('Error reading memories:', err)
    res.status(500).json({ error: 'Failed to read memories', details: err.message })
  }
})

// GET /api/memory/stats - Get memory usage stats
memoryRouter.get('/stats', (req, res) => {
  try {
    const stats = getMemoryStats()
    res.json(stats)
  } catch (err) {
    console.error('Error reading memory stats:', err)
    res.status(500).json({ error: 'Failed to read memory stats', details: err.message })
  }
})

// POST /api/memory/rebuild - Rebuild the manifest from current files
memoryRouter.post('/rebuild', (req, res) => {
  try {
    if (!existsSync(MEMORIES_DIR)) {
      res.json({ ok: true, message: 'Memory directory initialized' })
      return
    }

    // Sync manifest from current files
    const manifest = getManifest()
    manifest.clear()
    syncManifest(manifest)

    res.json({ ok: true, message: 'Memory index rebuilt from files' })
  } catch (err) {
    console.error('Error rebuilding memory index:', err)
    res.status(500).json({ ok: false, error: 'Failed to rebuild index', details: err.message })
  }
})

// DELETE /api/memory/:id - Delete a single memory entry
memoryRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ ok: false, error: 'Memory ID is required' })

    const manifest = getManifest()
    const entry = manifest.get(id)

    if (!entry) {
      return res.status(404).json({ ok: false, error: 'Memory entry not found' })
    }

    const { file: memoryFile, content: entryContent } = entry

    if (!existsSync(memoryFile)) {
      return res.status(404).json({ ok: false, error: 'Memory file not found' })
    }

    const fileContent = readFileSync(memoryFile, 'utf-8')
    const entries = splitEntries(fileContent)

    // Verify content matches before deleting
    const normalizedFile = fileContent.replace(/§\s*\n\s*/g, '§\n')
    const normalizedEntries = normalizedFile.split('\n§\n').map(e => e.trim()).filter(e => e && e !== '§')

    // Find and remove the entry by content match
    const entryIndex = normalizedEntries.findIndex(e => e === entryContent)

    if (entryIndex === -1) {
      // Content may have drifted — try to rebuild manifest
      manifest.delete(id)
      saveManifest(manifest)
      return res.status(404).json({ ok: false, error: 'Memory entry not found in file' })
    }

    // Remove the entry and write back
    normalizedEntries.splice(entryIndex, 1)
    writeFileSync(memoryFile, normalizedEntries.join(ENTRY_DELIMITER), 'utf-8')

    // Remove from manifest
    manifest.delete(id)
    saveManifest(manifest)

    res.json({ ok: true, message: 'Memory entry deleted' })
  } catch (err) {
    console.error('Error deleting memory entry:', err)
    res.status(500).json({ ok: false, error: 'Failed to delete memory entry', details: err.message })
  }
})

// POST /api/memory/clear - Clear all memory entries
memoryRouter.post('/clear', (req, res) => {
  try {
    const { type } = req.body // 'memory', 'user', or 'both'
    const manifest = getManifest()

    if (type === 'memory' || type === 'both') {
      if (existsSync(MEMORY_FILE)) {
        writeFileSync(MEMORY_FILE, '', 'utf-8')
        // Remove all memory entries from manifest
        for (const [id, entry] of manifest.entries()) {
          if (entry.file === MEMORY_FILE) manifest.delete(id)
        }
      }
    }

    if (type === 'user' || type === 'both') {
      if (existsSync(USER_FILE)) {
        writeFileSync(USER_FILE, '', 'utf-8')
        // Remove all user entries from manifest
        for (const [id, entry] of manifest.entries()) {
          if (entry.file === USER_FILE) manifest.delete(id)
        }
      }
    }

    saveManifest(manifest)
    res.json({ ok: true, message: `Cleared ${type || 'both'} memory entries` })
  } catch (err) {
    console.error('Error clearing memories:', err)
    res.status(500).json({ ok: false, error: 'Failed to clear memories', details: err.message })
  }
})
