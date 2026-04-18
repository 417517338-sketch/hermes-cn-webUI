/**
 * 本地测试用 Mock Server
 * 运行方式: npx tsx src/mocks/mock-server.ts
 * 或: node --loader ts-node/esm src/mocks/mock-server.ts
 * 
 * 这是一个简单的 Express 服务器，用于本地测试许可证和用量分析功能
 */

import express from 'express'
import { createServer } from 'http'

const app = express()
const PORT = 3001

// 激活码格式: HERMES-{TIER}-{YEAR}{MONTH}{DAY}-{RANDOM}
function generateActivationCode(tier: 'L1' | 'L2' | 'L3'): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `HERMES-${tier}-${year}${month}${day}-${random}`
}

// 模拟许可证数据
const mockLicense = {
  tier: 'L2',
  tier_level: 2,
  features: ['chat', 'sessions', 'config', 'skills', 'tools', 'memory', 'cron', 'browser', 'delegation', 'gateway', 'analytics', 'terminal'],
  expires_at: '2027-12-31',
  seats: 3,
  is_trial: false,
  activation_code: generateActivationCode('L2'),
  company: 'Local Test',
}

// 模拟用量数据
const generateMockUsageData = () => {
  const tokenTrend = []
  const dailyCosts = []
  const now = new Date()
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const inputTokens = Math.floor(Math.random() * 100000) + 50000
    const outputTokens = Math.floor(Math.random() * 80000) + 40000
    
    tokenTrend.push({
      date: dateStr,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    })
    
    dailyCosts.push({
      date: dateStr,
      cost_usd: parseFloat(((inputTokens * 0.0000035) + (outputTokens * 0.0000175)).toFixed(4)),
    })
  }
  
  return {
    token_trend: tokenTrend,
    cache_hit_rate: Math.floor(Math.random() * 30) + 20,
    total_today: {
      input_tokens: Math.floor(Math.random() * 200000) + 100000,
      output_tokens: Math.floor(Math.random() * 150000) + 80000,
      total_tokens: Math.floor(Math.random() * 350000) + 180000,
    },
    total_month: {
      input_tokens: Math.floor(Math.random() * 3000000) + 1500000,
      output_tokens: Math.floor(Math.random() * 2500000) + 1200000,
      total_tokens: Math.floor(Math.random() * 5500000) + 2700000,
    },
    top_models: [
      { model: 'claude-opus-4-6', tokens: Math.floor(Math.random() * 2000000) + 1000000, percent: 45 },
      { model: 'claude-sonnet-4-6', tokens: Math.floor(Math.random() * 1500000) + 800000, percent: 30 },
      { model: 'claude-haiku-4-6', tokens: Math.floor(Math.random() * 800000) + 400000, percent: 15 },
      { model: 'claude-3-5-sonnet', tokens: Math.floor(Math.random() * 400000) + 200000, percent: 10 },
    ],
    daily_costs: dailyCosts,
  }
}

// API Routes
app.get('/api/license', (req, res) => {
  console.log('[Mock] GET /api/license')
  res.json(mockLicense)
})

app.get('/api/analytics/usage', (req, res) => {
  console.log('[Mock] GET /api/analytics/usage')
  res.json(generateMockUsageData())
})

app.get('/api/status', (req, res) => {
  console.log('[Mock] GET /api/status')
  res.json({
    status: 'running',
    health: 'healthy',
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    active_sessions: 2,
    context_window: 200000,
    uptime_seconds: 86400 * 7,
    memory: {
      total_gb: 32,
      used_gb: 16,
      usage_percent: 50,
    },
    cpu: {
      count: 8,
      model: 'Apple M2 Pro',
      usage_percent: 25,
    },
    terminal_backends: ['local'],
  })
})

app.get('/api/sessions', (req, res) => {
  console.log('[Mock] GET /api/sessions')
  res.json({
    sessions: [
      {
        id: 'session-1',
        title: '测试会话 1',
        platform: 'cli',
        message_count: 42,
        updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      },
      {
        id: 'session-2',
        title: '开发任务',
        platform: 'telegram',
        message_count: 128,
        updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: 'session-3',
        title: '代码审查',
        platform: 'discord',
        message_count: 56,
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      },
    ],
  })
})

app.get('/api/skills', (req, res) => {
  console.log('[Mock] GET /api/skills')
  res.json({
    skills: [
      { name: 'terminal', enabled: true },
      { name: 'browser', enabled: true },
      { name: 'delegation', enabled: true },
    ],
  })
})

app.get('/api/tools', (req, res) => {
  console.log('[Mock] GET /api/tools')
  res.json({
    tools: [
      { name: 'execute_code', enabled: true },
      { name: 'terminal', enabled: true },
      { name: 'file_tools', enabled: true },
      { name: 'web_tools', enabled: true },
      { name: 'browser_tool', enabled: true },
      { name: 'delegate_tool', enabled: true },
    ],
  })
})

// WebSocket mock for terminal
app.get('/api/terminal', (req, res) => {
  res.status(426).json({ error: 'WebSocket upgrade required' })
})

const server = createServer(app)

server.on('upgrade', (request, socket, head) => {
  console.log('[Mock] WebSocket upgrade request')
  
  socket.on('data', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      console.log('[Mock WS] Received:', msg)
      
      if (msg.type === 'start') {
        // Send started message
        socket.write('7{"type":"started"}\n')
        
        // Send welcome message
        setTimeout(() => {
          socket.write('58{"type":"output","data":"\\r\\n\\x1b[32mHermes Terminal\x1b[0m - Local Backend Mock\\r\\n\\r\\n$ "}')
        }, 100)
      } else if (msg.type === 'input') {
        // Echo the input back
        socket.write(`9{"type":"output","data":"${msg.data}"}`)
      }
    } catch (e) {
      console.error('[Mock WS] Parse error:', e)
    }
  })
  
  socket.on('close', () => {
    console.log('[Mock WS] Client disconnected')
  })
  
  // Send HTTP 101 Switching Protocols
  socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
})

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Hermes Local Mock Server                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Status: Running                                               ║
║  Port: ${PORT}                                                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                    ║
║  - GET  /api/license        - License info (L2)                ║
║  - GET  /api/analytics/usage - Mock usage data                 ║
║  - GET  /api/status         - System status                    ║
║  - GET  /api/sessions       - Session list                     ║
║  - WS   /api/terminal      - Terminal backend                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Activation Code (L2):                                         ║
║  ${mockLicense.activation_code}
╠═══════════════════════════════════════════════════════════════╣
║  To use: Configure frontend to connect to localhost:${PORT}       ║
╚═══════════════════════════════════════════════════════════════╝
  `)
})
