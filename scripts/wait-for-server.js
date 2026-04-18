#!/usr/bin/env node
/**
 * wait-for-server.js
 * 等待 Hermes WebUI 前端 + 后端服务就绪，带超时兜底，永不挂死。
 *
 * 用法: node scripts/wait-for-server.js
 *   --port, -p     前端端口（默认 3000）
 *   --backend, -b  后端端口（默认 3001）
 *   --timeout, -t  超时秒数（默认 60）
 *   --interval, -i 重试间隔秒数（默认 2）
 */

import http from 'http'

// ── 配置 ──────────────────────────────────────────────
const FRONTEND_PORT = 3000
const BACKEND_PORT  = 3001
const DEFAULT_TIMEOUT  = 60   // 秒
const DEFAULT_INTERVAL = 2    // 秒

// ── 参数解析 ──────────────────────────────────────────
const argv = process.argv.slice(2)
let frontPort = FRONTEND_PORT
let backPort  = BACKEND_PORT
let timeoutSec  = DEFAULT_TIMEOUT
let intervalSec = DEFAULT_INTERVAL

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--port' || a === '-p')       frontPort   = parseInt(argv[++i], 10)
  else if (a === '--backend' || a === '-b') backPort  = parseInt(argv[++i], 10)
  else if (a === '--timeout' || a === '-t') timeoutSec = parseInt(argv[++i], 10)
  else if (a === '--interval' || a === '-i') intervalSec = parseInt(argv[++i], 10)
  else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
}

function printHelp() {
  console.log(`用法: node scripts/wait-for-server.js [选项]
  --port, -p     前端端口（默认 ${FRONTEND_PORT}）
  --backend, -b  后端端口（默认 ${BACKEND_PORT}）
  --timeout, -t  超时秒数（默认 ${DEFAULT_TIMEOUT}）
  --interval, -i 重试间隔秒数（默认 ${DEFAULT_INTERVAL}）`)
}

// ── HTTP 健康检查 ─────────────────────────────────────
function isHealthy(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: 'localhost', port, path: '/api/status', method: 'HEAD', timeout: 5000 },
      (res) => resolve(res.statusCode === 200)
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

// ── 进度打印（同一行覆盖） ────────────────────────────
function printStatus(label, ready) {
  process.stdout.write(`\r  ${ready ? '✅' : '⏳'} ${label}${' '.repeat(Math.max(0, 40 - label.length))}\r`)
}

// ── 主入口 ────────────────────────────────────────────
async function main() {
  const deadline = Date.now() + timeoutSec * 1000

  let frontReady = await isHealthy(frontPort)
  let backReady  = await isHealthy(backPort)

  if (frontReady && backReady) {
    console.log(`✅ 前端 (${frontPort}) + 后端 (${backPort}) 已就绪！`)
    process.exit(0)
  }

  console.log(`\n🔍 等待服务就绪（超时 ${timeoutSec}s）...`)
  if (!frontReady) printStatus(`前端 localhost:${frontPort}`, false)
  if (!backReady)  printStatus(`后端 localhost:${backPort}`,  false)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() >= deadline) {
      console.log(`\n\n❌ 超时（${timeoutSec}s）`)
      console.log(`   前端 localhost:${frontPort}  ${frontReady ? '✅' : '❌ 未就绪'}`)
      console.log(`   后端 localhost:${backPort}   ${backReady  ? '✅' : '❌ 未就绪'}`)
      process.exit(1)
    }

    // 等待 interval 秒（显示剩余时间）
    const sleepMs = intervalSec * 1000
    const startSleep = Date.now()
    while (Date.now() - startSleep < sleepMs) {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      process.stdout.write(`\r  ⏳ ${left > 0 ? `剩余 ${left}s` : '即将超时'}...    \r`)
      await new Promise((r) => setTimeout(r, Math.min(200, sleepMs)))
    }

    // 再次检查
    if (!frontReady) frontReady = await isHealthy(frontPort)
    if (!backReady)  backReady  = await isHealthy(backPort)

    if (frontReady) printStatus(`前端 localhost:${frontPort}`, true)
    if (backReady)  printStatus(`后端 localhost:${backPort}`,  true)

    if (frontReady && backReady) {
      const elapsed = ((Date.now() - (deadline - timeoutSec * 1000)) / 1000).toFixed(1)
      console.log(`\n\n✅ 全部就绪（耗时 ${elapsed}s）`)
      process.exit(0)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
