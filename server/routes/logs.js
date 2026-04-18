import { Router } from 'express'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export const logsRouter = Router()

const HERMES_HOME = process.env.HERMES_HOME || join(homedir(), '.hermes')
const LOG_DIR = join(HERMES_HOME, 'logs')

// GET /api/logs — read log file
logsRouter.get('/', (req, res) => {
  try {
    const { file: fileName, lines = 200, level, component } = req.query

    let logFile = fileName
    if (!logFile) {
      // Find most recent log file
      const logFiles = ['agent.log', 'hermes.log', 'app.log']
      for (const f of logFiles) {
        const p = join(LOG_DIR, f)
        if (existsSync(p)) {
          logFile = f
          break
        }
      }
      if (!logFile) {
        return res.json({ file: '', lines: [] })
      }
    }

    const filePath = join(LOG_DIR, logFile)
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' })
    }

    // Read last N lines
    const content = readFileSync(filePath, 'utf-8')
    let allLines = content.split('\n').filter(l => l.trim())

    // Filter by level if specified
    if (level && level !== 'ALL') {
      allLines = allLines.filter(l => l.toUpperCase().includes(`[${level.toUpperCase()}]`))
    }

    // Filter by component if specified
    if (component && component !== 'all') {
      allLines = allLines.filter(l => l.includes(component))
    }

    // Take last N lines
    const lastLines = allLines.slice(-Math.min(parseInt(lines, 10), 1000))

    res.json({ file: logFile, lines: lastLines })
  } catch (err) {
    console.error('Error reading logs:', err)
    res.status(500).json({ error: 'Failed to read logs', details: err.message })
  }
})
