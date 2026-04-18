/**
 * Platforms 路由 - 网关平台消息
 * @description 获取各消息平台（微信/飞书）的会话和消息
 */
import { Router } from 'express'
import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'

export const platformsRouter = Router()

const DB_PATH = join(homedir(), '.hermes', 'state.db')

function getDb() {
  return new Database(DB_PATH, { readonly: true })
}

function unixToISO(unix) {
  if (!unix) return null
  return new Date(unix * 1000).toISOString()
}

// GET /api/platforms - 列出所有平台及其最新会话
platformsRouter.get('/', (req, res) => {
  try {
    const db = getDb()

    // 获取各平台最新会话
    const stmt = db.prepare(`
      SELECT s.* FROM sessions s
      WHERE s.source IN ('weixin', 'feishu')
      AND s.id = (
        SELECT s2.id FROM sessions s2
        WHERE s2.source = s.source
        ORDER BY s2.started_at DESC
        LIMIT 1
      )
      ORDER BY s.started_at DESC
    `)
    const rows = stmt.all()

    // 获取每个平台的未读消息数（简单的启发式：最近5分钟内的新消息）
    const fiveMinAgo = Date.now() / 1000 - 300
    const platformSessions = rows.map(row => {
      const msgCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND timestamp > ?'
      ).get(row.id, fiveMinAgo)
      return {
        id: row.id,
        source: row.source,
        user_id: row.user_id,
        title: row.title || '无标题',
        started_at: unixToISO(row.started_at),
        last_active: unixToISO(row.ended_at || row.started_at),
        message_count: row.message_count || 0,
        recent_count: msgCount?.cnt || 0,
      }
    })

    db.close()
    res.json({ platforms: platformSessions })
  } catch (err) {
    console.error('Failed to fetch platforms:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/platforms/:source/messages - 获取指定平台的消息
platformsRouter.get('/:source/messages', (req, res) => {
  try {
    const { source } = req.params
    const db = getDb()

    // 获取该平台最新的会话
    const sessionStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE source = ?
      ORDER BY started_at DESC
      LIMIT 1
    `)
    const session = sessionStmt.get(source)

    if (!session) {
      db.close()
      return res.status(404).json({ error: 'No session found for this platform', source })
    }

    // 获取消息
    const messagesStmt = db.prepare(`
      SELECT role, content, tool_calls, tool_call_id, tool_name, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `)
    const messages = messagesStmt.all(session.id)

    db.close()

    res.json({
      session: {
        id: session.id,
        source: session.source,
        user_id: session.user_id,
        title: session.title || '无标题',
        started_at: unixToISO(session.started_at),
        last_active: unixToISO(session.ended_at || session.started_at),
        message_count: session.message_count || 0,
      },
      messages: messages.map(m => ({
        role: m.role,
        content: m.content || '',
        tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        tool_call_id: m.tool_call_id || undefined,
        tool_name: m.tool_name || undefined,
        timestamp: m.timestamp ? m.timestamp * 1000 : undefined,
      })),
    })
  } catch (err) {
    console.error('Failed to fetch platform messages:', err)
    res.status(500).json({ error: err.message })
  }
})
