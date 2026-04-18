import { WebSocketServer } from 'ws'
import fs from 'fs'
import path from 'path'
import os from 'os'

const LOGS_DIR = path.join(os.homedir(), '.hermes', 'logs')
const INITIAL_LINES = 50

// Track file positions for tail behavior
const filePositions = new Map()

function getLogFiles() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      return []
    }
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => path.join(LOGS_DIR, f))
      .sort()
    return files
  } catch {
    return []
  }
}

function readLastLines(filePath, count) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    return lines.slice(-count)
  } catch {
    return []
  }
}

function readNewLines(filePath, fromPosition) {
  try {
    const stats = fs.statSync(filePath)
    const currentSize = stats.size

    if (currentSize < fromPosition) {
      // File was rotated/truncated, start from beginning
      filePositions.set(filePath, 0)
      fromPosition = 0
    }

    if (currentSize === fromPosition) {
      return { lines: [], newPosition: fromPosition }
    }

    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(currentSize - fromPosition)
    fs.readSync(fd, buffer, 0, buffer.length, fromPosition)
    fs.closeSync(fd)

    const content = buffer.toString('utf-8')
    const lines = content.split('\n').filter(l => l.trim())

    return { lines, newPosition: currentSize }
  } catch {
    return { lines: [], newPosition: fromPosition }
  }
}

export function setupLogsWs(httpServer) {
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set()

  // Initialize file positions to end of files
  function initFilePositions() {
    filePositions.clear()
    const files = getLogFiles()
    for (const file of files) {
      try {
        const stats = fs.statSync(file)
        filePositions.set(file, stats.size)
      } catch {
        filePositions.set(file, 0)
      }
    }
  }

  // Send initial batch of logs to a client
  function sendInitialLogs(ws) {
    const files = getLogFiles()

    if (files.length === 0) {
      ws.send(JSON.stringify({
        type: 'info',
        message: 'No log files found in ' + LOGS_DIR
      }))
      return
    }

    // Collect last N lines from each file
    const allLines = []
    for (const file of files) {
      const lines = readLastLines(file, INITIAL_LINES)
      allLines.push(...lines)
    }

    // Sort by timestamp if possible, otherwise keep order
    allLines.sort((a, b) => {
      const timeA = a.match(/^\d{4}-\d{2}-\d{2}[T ]/)
      const timeB = b.match(/^\d{4}-\d{2}-\d{2}[T ]/)
      if (timeA && timeB) {
        return timeA[0].localeCompare(timeB[0])
      }
      return 0
    })

    // Send the last INITIAL_LINES total
    const toSend = allLines.slice(-INITIAL_LINES)
    for (const line of toSend) {
      ws.send(JSON.stringify({ line }))
    }
  }

  // Broadcast to all connected clients
  function broadcast(message) {
    for (const client of clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message)
      }
    }
  }

  // Handle WebSocket upgrade requests
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/logs/stream') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }
  })

  wss.on('connection', (ws) => {
    console.log('Logs WebSocket connected')

    clients.add(ws)
    initFilePositions()
    sendInitialLogs(ws)

    ws.on('close', () => {
      clients.delete(ws)
      console.log('Logs WebSocket disconnected')
    })

    ws.on('error', (err) => {
      console.error('Logs WebSocket error:', err.message)
      clients.delete(ws)
    })
  })

  // Poll for new log content
  const pollInterval = setInterval(() => {
    if (clients.size === 0) return

    const files = getLogFiles()

    for (const file of files) {
      if (!filePositions.has(file)) {
        // New file discovered
        filePositions.set(file, 0)
      }

      const { lines, newPosition } = readNewLines(file, filePositions.get(file))

      if (lines.length > 0) {
        filePositions.set(file, newPosition)
        for (const line of lines) {
          broadcast(JSON.stringify({ line, file: path.basename(file) }))
        }
      }
    }
  }, 1000)

  // Watch for new files in the logs directory
  let watchFd = null
  try {
    if (fs.existsSync(LOGS_DIR)) {
      watchFd = fs.watch(LOGS_DIR, (eventType, filename) => {
        if (filename && filename.endsWith('.log')) {
          // A new or modified log file
          const filePath = path.join(LOGS_DIR, filename)
          if (!filePositions.has(filePath)) {
            // New file discovered - initialize position
            try {
              const stats = fs.statSync(filePath)
              filePositions.set(filePath, stats.size)
            } catch {
              filePositions.set(filePath, 0)
            }
          }
        }
      })
    }
  } catch (err) {
    console.warn('Unable to watch logs directory:', err.message)
  }

  // Cleanup on server close (if exposed)
  if (wss.close) {
    const originalClose = wss.close.bind(wss)
    wss.close = (...args) => {
      clearInterval(pollInterval)
      if (watchFd) watchFd.close()
      return originalClose(...args)
    }
  }

  return wss
}
