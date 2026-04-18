import { Router } from 'express'
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'

export const analyticsRouter = Router()

const DB_PATH = join(homedir(), '.hermes', 'state.db')

function getDb() {
  return new Database(DB_PATH, { readonly: true })
}

// Cost per 1M tokens (rough approximation — matches api.ts convention)
const COST_PER_MILLION = 2.0

function calcCost(tokens) {
  return (tokens / 1_000_000) * COST_PER_MILLION
}

// GET /api/analytics/usage?days=30
analyticsRouter.get('/usage', (req, res) => {
  try {
    const db = getDb()
    const days = Math.max(1, Math.min(365, parseInt(req.query.days || '30', 10)))
    const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)

    // Totals across the period
    const totalsStmt = db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
        COALESCE(SUM(cache_write_tokens), 0) as total_cache_write,
        COALESCE(SUM(reasoning_tokens), 0) as total_reasoning,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
        COUNT(*) as total_sessions
      FROM sessions
      WHERE started_at >= ?
    `)
    const totals = totalsStmt.get(since)
    const totalTokens = totals.total_tokens || 0

    // Daily breakdown
    const dailyStmt = db.prepare(`
      SELECT
        date(started_at, 'unixepoch') as day,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COUNT(*) as sessions
      FROM sessions
      WHERE started_at >= ?
      GROUP BY date(started_at, 'unixepoch')
      ORDER BY day ASC
    `)
    const dailyRows = dailyStmt.all(since)

    // Build full N-day array (fill missing days with zeros)
    const dailyMap = new Map(dailyRows.map(r => [r.day, r]))
    const daily = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dayStr = d.toISOString().split('T')[0]
      const row = dailyMap.get(dayStr)
      daily.push({
        day: dayStr,
        input_tokens: row ? row.input_tokens : 0,
        output_tokens: row ? row.output_tokens : 0,
        cache_read_tokens: row ? row.cache_read_tokens : 0,
        reasoning_tokens: row ? row.reasoning_tokens : 0,
        estimated_cost: row ? calcCost((row.input_tokens || 0) + (row.output_tokens || 0)) : 0,
        actual_cost: row ? calcCost((row.input_tokens || 0) + (row.output_tokens || 0)) : 0,
        sessions: row ? row.sessions : 0,
      })
    }

    // By model breakdown
    const byModelStmt = db.prepare(`
      SELECT
        COALESCE(model, 'unknown') as model,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
        COUNT(*) as sessions
      FROM sessions
      WHERE started_at >= ?
      GROUP BY model
      ORDER BY total_tokens DESC
      LIMIT 20
    `)
    const modelRows = byModelStmt.all(since)
    const by_model = modelRows.map(r => ({
      model: r.model,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      estimated_cost: calcCost(r.total_tokens),
      sessions: r.sessions,
    }))

    db.close()

    res.json({
      daily,
      by_model,
      totals: {
        total_input: totals.total_input || 0,
        total_output: totals.total_output || 0,
        total_cache_read: totals.total_cache_read || 0,
        total_reasoning: totals.total_reasoning || 0,
        total_estimated_cost: calcCost(totalTokens),
        total_actual_cost: calcCost(totalTokens),
        total_sessions: totals.total_sessions || 0,
      },
    })
  } catch (err) {
    console.error('Failed to fetch analytics:', err)
    res.status(500).json({ error: 'Failed to fetch analytics', details: err.message })
  }
})
