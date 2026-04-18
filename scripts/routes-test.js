#!/usr/bin/env node
/**
 * Routes verification script
 * Starts the Hermes WebUI server and tests API routes that are ACTUALLY CALLED by frontend pages.
 *
 * Usage: node scripts/routes-test.js
 *
 * @see CONSTITUTION.md 第零章 — 开发规范
 */

import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const BASE = 'http://localhost:3001'

// ---------------------------------------------------------------------------
// Static route tests
// ---------------------------------------------------------------------------

const staticRoutes = [
  ['GET',    '/api/status',                                 null,                    200, 'Status'],
  ['GET',    '/api/system',                                 null,                    200, 'System info'],
  ['GET',    '/api/license',                               null,                    200, 'License (L1)'],
  ['POST',   '/api/license/activate',
   JSON.stringify({ key: 'invalid-key-format' }),                                     400, 'License activate (invalid)'],
  ['GET',    '/api/sessions?limit=20&offset=0',            null,                    200, 'Sessions list'],
  ['GET',    '/api/sessions?limit=50&offset=0',            null,                    200, 'Sessions list (paginated)'],
  ['POST',   '/api/chat/completions',
   JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),             200, 'Chat completions'],
  ['GET',    '/api/analytics/usage?days=30',               null,                    200, 'Analytics usage'],
  ['GET',    '/api/memory',                                 null,                    200, 'Memory list'],
  ['POST',   '/api/memory/rebuild',                         null,                    200, 'Memory rebuild'],
  ['GET',    '/api/skills',                                 null,                    200, 'Skills list'],
  ['GET',    '/api/tools/toolsets',                          null,                    200, 'Toolsets list'],
  ['GET',    '/api/config',                                 null,                    200, 'Config'],
  ['PUT',    '/api/config',
   JSON.stringify({ config: { ui: { theme: 'dark' } } }),                           200, 'Config save'],
  ['GET',    '/api/keys',                                   null,                    200, 'Keys list'],
  ['GET',    '/api/cron',                                   null,                    200, 'Cron jobs list'],
  ['POST',   '/api/cron/convert',
   JSON.stringify({ text: '每5分钟' }),                                              200, 'Cron convert NL→cron'],
  ['GET',    '/api/delegation',                             null,                    200, 'Delegation list'],
  ['GET',    '/api/gateway',                                null,                    200, 'Gateway status'],
  ['GET',    '/api/logs?lines=20',                          null,                    200, 'Logs'],
  ['GET',    '/api/browser/sessions',                        null,                    200, 'Browser sessions'],
]

// ---------------------------------------------------------------------------
// Dynamic tests (dependent on prior API responses)
// ---------------------------------------------------------------------------

/** @returns {Promise<Array<[string,string,null|string,number,string]>>} */
async function getDynamicRoutes(createdJobId) {
  return [
    ['POST',  `/api/cron/${createdJobId}/pause`,     null, 200, `Cron pause (id=${createdJobId})`],
    ['POST',  `/api/cron/${createdJobId}/resume`,     null, 200, `Cron resume (id=${createdJobId})`],
    ['DELETE', `/api/cron/${createdJobId}`,           null, 200, `Cron delete (id=${createdJobId})`],
  ]
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function request(method, path, body, expectedStatus) {
  const url = `${BASE}${path}`
  const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) }
  if (body) opts.body = body

  let res, data
  try {
    res = await fetch(url, opts)
    const text = await res.text()
    try { data = JSON.parse(text) } catch { data = text }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  }

  const ok = res.status === expectedStatus
    const snippet = (data && typeof data === 'object')
    ? JSON.stringify(data).slice(0, 600)
    : String(data).slice(0, 200)
  return { ok, status: res.status, expected: expectedStatus, snippet }
}

function pad(s, n) { return String(s).padEnd(n, ' ') }

function printResult(method, path, label, result) {
  const mark   = result.ok ? '✅' : '❌'
  const status = result.ok
    ? `\x1b[32m${result.status}\x1b[0m`
    : `\x1b[31m${result.status} (exp ${result.expected})\x1b[0m`
  const detail = result.error || (!result.ok ? `← ${result.snippet}` : '')
  console.log(`  ${mark} [${status}] ${pad(method, 7)} ${pad(path, 55)} ${pad(label, 32)} ${detail}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🚀 Starting Hermes WebUI server...\n')

  const serverProc = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3001', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverOutput = ''
  serverProc.stdout.on('data', d => { serverOutput += d.toString() })
  serverProc.stderr.on('data', d => { serverOutput += d.toString() })

  for (let i = 0; i < 30; i++) {
    await sleep(500)
    try {
      const res = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) { console.log(`✅ Server ready on port 3001\n`); break }
    } catch {}
    if (i === 29) {
      console.error('❌ Server failed to start.\nStderr:', serverOutput.slice(-500))
      serverProc.kill(); process.exit(1)
    }
  }

  console.log('📋 Running static route tests...\n')
  console.log(`  ${pad('STATUS', 14)} ${pad('METHOD', 9)} ${pad('PATH', 57)} ${pad('LABEL', 34)} DETAIL`)
  console.log('  ' + '─'.repeat(145))

  const results = []

  // Static routes
  for (const [method, path, body, expected, label] of staticRoutes) {
    const result = await request(method, path, body, expected)
    results.push({ method, path, label, result })
    printResult(method, path, label, result)
  }

  // Dynamic: create a cron job then test pause/resume/delete with real ID
  const createResult = await request(
    'POST', '/api/cron',
    JSON.stringify({
      name: 'Route Test Job',
      prompt: 'health check',
      schedule: { kind: 'cron', expr: '*/10 * * * *', display: '每10分钟' },
      enabled: true,
    }),
    201
  )
  printResult('POST', '/api/cron', 'Cron create (dynamic id)', createResult)

  let createdJobId = null
  if (createResult.ok && createResult.snippet) {
    try {
      const json = JSON.parse(createResult.snippet)
      createdJobId = json?.id
      console.log(`  ℹ️  Created job ID: ${createdJobId}`)
    } catch (e) {
      console.log(`  ⚠️  Could not parse create response: ${createResult.snippet.slice(0, 80)}`)
    }
  }

  if (createdJobId) {
    const dynamicRoutes = await getDynamicRoutes(createdJobId)
    console.log('\n📋 Running dynamic route tests (using created job id)...\n')
    console.log('  ' + '─'.repeat(145))
    for (const [method, path, body, expected, label] of dynamicRoutes) {
      const result = await request(method, path, body, expected)
      results.push({ method, path, label, result })
      printResult(method, path, label, result)
    }
  } else {
    console.log('\n⚠️  Could not extract created job ID — skipping pause/resume/delete tests')
  }

  console.log('\n  ' + '─'.repeat(145))
  const passed = results.filter(r => r.result.ok).length
  const failed = results.filter(r => !r.result.ok).length
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`)

  if (failed > 0) {
    console.log('❌ Failed routes:\n')
    for (const r of results.filter(r => !r.result.ok)) {
      console.log(`  ${r.method} ${r.path}`)
      console.log(`    Status: ${r.result.status} (expected ${r.result.expected})`)
      console.log(`    Detail: ${r.result.error || r.result.snippet}\n`)
    }
  }

  serverProc.kill()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('Script error:', err); process.exit(1) })
