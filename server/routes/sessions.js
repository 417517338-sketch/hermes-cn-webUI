import { Router } from 'express'
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'

export const sessionsRouter = Router()

const DB_PATH = join(homedir(), '.hermes', 'state.db')

function getDb() {
  return new Database(DB_PATH, { readonly: true })
}

function unixToISO(unixTimestamp) {
  if (!unixTimestamp) return null
  return new Date(unixTimestamp * 1000).toISOString()
}

function mapSession(row) {
  return {
    id: row.id,
    title: row.title || '无标题',
    created_at: unixToISO(row.started_at),
    last_active: unixToISO(row.ended_at || row.started_at),
    message_count: row.message_count || 0,
    token_used: (row.input_tokens || 0) + (row.output_tokens || 0),
    model: row.model || null,
    source: row.source || null,
  }
}

// GET /api/sessions?limit=20&offset=0&search=xxx
sessionsRouter.get('/', (req, res) => {
  try {
    const db = getDb()
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)))
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10))
    const search = req.query.search

    let rows, total

    if (search) {
      const pattern = `%${search}%`
      const countStmt = db.prepare(`
        SELECT COUNT(DISTINCT s.id) as count FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        WHERE s.title LIKE ? OR m.content LIKE ?
      `)
      total = countStmt.get(pattern, pattern).count

      const stmt = db.prepare(`
        SELECT DISTINCT s.* FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        WHERE s.title LIKE ? OR m.content LIKE ?
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
      `)
      rows = stmt.all(pattern, pattern, limit, offset)
    } else {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM sessions')
      total = countStmt.get().count

      const stmt = db.prepare(`
        SELECT * FROM sessions
        ORDER BY started_at DESC
        LIMIT ? OFFSET ?
      `)
      rows = stmt.all(limit, offset)
    }

    db.close()

    res.json({
      sessions: rows.map(mapSession),
      total,
      limit,
      offset,
    })
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message })
  }
})

// GET /api/sessions/search?q=xxx
// NOTE: must be registered BEFORE /:id to avoid Express treating "search" as an :id param
sessionsRouter.get('/search', (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.json({ results: [] })

    const db = getDb()
    const pattern = `%${q}%`
    const stmt = db.prepare(`
      SELECT DISTINCT s.* FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.title LIKE ? OR m.content LIKE ?
      ORDER BY s.started_at DESC
      LIMIT 50
    `)
    const rows = stmt.all(pattern, pattern)
    db.close()

    res.json({
      results: rows.map(row => ({
        session_id: row.id,
        snippet: null,
        role: null,
        source: row.source || null,
        model: row.model || null,
        session_started: row.started_at ? row.started_at * 1000 : null,
      })),
    })
  } catch (err) {
    console.error('Failed to search sessions:', err)
    res.status(500).json({ error: 'Failed to search sessions', details: err.message })
  }
})

// GET /api/sessions/:id
sessionsRouter.get('/:id', (req, res) => {
  try {
    const db = getDb()

    const sessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
    const session = sessionStmt.get(req.params.id)

    if (!session) {
      db.close()
      return res.status(404).json({ error: 'Session not found' })
    }

    const messagesStmt = db.prepare(`
      SELECT role, content, tool_calls, tool_call_id, tool_name, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `)
    const messages = messagesStmt.all(req.params.id)

    db.close()

    res.json({
      ...mapSession(session),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        tool_call_id: m.tool_call_id || undefined,
        tool_name: m.tool_name || undefined,
        timestamp: m.timestamp ? m.timestamp * 1000 : undefined,
      })),
    })
  } catch (err) {
    console.error('Failed to fetch session detail:', err)
    res.status(500).json({ error: 'Failed to fetch session detail', details: err.message })
  }
})

// GET /api/sessions/:id/messages
sessionsRouter.get('/:id/messages', (req, res) => {
  try {
    const db = getDb()

    // Verify session exists
    const sessionStmt = db.prepare('SELECT id FROM sessions WHERE id = ?')
    const session = sessionStmt.get(req.params.id)
    if (!session) {
      db.close()
      return res.status(404).json({ error: 'Session not found' })
    }

    const messagesStmt = db.prepare(`
      SELECT role, content, tool_calls, tool_call_id, tool_name, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `)
    const messages = messagesStmt.all(req.params.id)
    db.close()

    res.json({
      session_id: req.params.id,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        tool_call_id: m.tool_call_id || undefined,
        tool_name: m.tool_name || undefined,
        timestamp: m.timestamp ? m.timestamp * 1000 : undefined,
      })),
    })
  } catch (err) {
    console.error('Failed to fetch messages:', err)
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message })
  }
})

// DELETE /api/sessions/:id
sessionsRouter.delete('/:id', (req, res) => {
  try {
    const db = getDb()

    // Delete messages first (foreign key constraint)
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(req.params.id)
    // Delete session
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id)

    db.close()

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete session:', err)
    res.status(500).json({ error: 'Failed to delete session', details: err.message })
  }
})
