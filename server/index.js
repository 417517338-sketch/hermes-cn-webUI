import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { statusRouter } from './routes/status.js'
import { sessionsRouter } from './routes/sessions.js'
import { analyticsRouter } from './routes/analytics.js'
import { memoryRouter } from './routes/memory.js'
import { skillsRouter } from './routes/skills.js'
import { toolsRouter } from './routes/tools.js'
import { configRouter } from './routes/config.js'
import { keysRouter } from './routes/keys.js'
import { cronRouter } from './routes/cron.js'

import { gatewayRouter } from './routes/gateway.js'
import browserRouter from './routes/browser.js'
import chatRouter from './routes/chat.js'
import chatDirectRouter from './routes/chat/direct.js'
import { systemRouter } from './routes/system.js'
import { delegationRouter } from './routes/delegation.js'
import { startupRouter } from './routes/startup.js'
import modelsRouter from './routes/models.js'
import { setupTerminalWs } from './ws/terminal.js'
import { setupLogsWs } from './ws/logs.js'
import { logsRouter } from './routes/logs.js'
import { platformsRouter } from './routes/platforms.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API routes
app.use('/api/status', statusRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/memory', memoryRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/tools/toolsets', toolsRouter)
app.use('/api/config', configRouter)
app.use('/api/keys', keysRouter)
app.use('/api/cron', cronRouter)

app.use('/api/gateway', gatewayRouter)
app.use('/api/browser', browserRouter)
app.use('/api/chat/completions', chatRouter)
app.use('/api/chat/direct', chatDirectRouter)
app.use('/api/system', systemRouter)
app.use('/api/delegation', delegationRouter)
app.use('/api/logs', logsRouter)
app.use('/api/models', modelsRouter)
app.use('/api/platforms', platformsRouter)
app.use('/api/startup', startupRouter)

// WebSocket endpoints
const server = createServer(app)

// WebSocket upgrade handling - manual routing instead of deprecated `path` option
setupTerminalWs(server)
setupLogsWs(server)

server.listen(PORT, () => {
  console.log(`Hermes WebUI server running on http://localhost:${PORT}`)
})
