import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import { cpus } from 'os'

// Track active PTY sessions per backend ID (persists across WebSocket reconnections)
// sessionId -> { pty, backend, ws, outputBuffer }
const sessionMap = new Map()

// Ring buffer for offline output (last 5000 lines per session)
const OUTPUT_MAX = 5000

/**
 * Spawn a PTY for the given backend type.
 * Falls back to local bash if backend is unavailable.
 */
function spawnPty(backend, cols = 80, rows = 30) {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
  const shellArgs = []

  switch (backend) {
    case 'local':
    default:
      return pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      })

    // Docker backend: spawn bash inside a generic container
    // In production, this would use a configurable image
    case 'docker': {
      // Check if docker is available
      try {
        const dockerPty = pty.spawn('docker', ['run', '--rm', '-it', '--network=host', 'alpine:latest', 'sh'], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: '/',
          env: { ...process.env, TERM: 'xterm-256color' },
        })
        return dockerPty
      } catch {
        // Fallback to local if docker fails
        return pty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: process.env.HOME || '/',
          env: { ...process.env, TERM: 'xterm-256color' },
        })
      }
    }

    // SSH backend: spawn ssh to configured host
    // In production, use configured SSH host/user/key
    case 'ssh':
      // Demo: spawn local shell labelled as SSH
      // Real impl: pty.spawn('ssh', ['user@host'], { ... })
      return pty.spawn('bash', ['-c', 'echo "SSH backend - configure SSH connection in settings" && exec bash'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/',
        env: { ...process.env, TERM: 'xterm-256color' },
      })

    // Singularity backend
    case 'singularity':
      return pty.spawn('bash', ['-c', 'echo "Singularity backend - configure container image in settings" && exec bash'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/',
        env: { ...process.env, TERM: 'xterm-256color' },
      })

    // Modal backend (cloud compute)
    case 'modal':
      return pty.spawn('bash', ['-c', 'echo "Modal backend - configure Modal token in settings" && exec bash'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/',
        env: { ...process.env, TERM: 'xterm-256color' },
      })

    // Daytona backend (cloud IDE)
    case 'daytona':
      return pty.spawn('bash', ['-c', 'echo "Daytona backend - configure Daytona server in settings" && exec bash'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/',
        env: { ...process.env, TERM: 'xterm-256color' },
      })
  }
}

/**
 * Send a JSON message safely, ignoring if socket is not open.
 */
function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(obj))
    } catch {
      // ignore
    }
  }
}

export function setupTerminalWs(httpServer) {
  const wss = new WebSocketServer({ noServer: true })

  // Handle WebSocket upgrade requests manually (path option is deprecated in ws 8.x)
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/terminal') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }
  })

  wss.on('connection', (ws) => {
    console.log('[terminal] WebSocket connected')
    let currentSession = null // { pty, backend, ws, outputBuffer[] }

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      switch (msg.type) {
        case 'start': {
          const sessionId = msg.backend || 'local'
          const cols = msg.cols || 80
          const rows = msg.rows || 30

          // If session already exists with a live PTY, reattach to it
          if (sessionMap.has(sessionId)) {
            currentSession = sessionMap.get(sessionId)
            console.log(`[terminal] Reattaching to existing PTY session="${sessionId}"`)
            currentSession.ws = ws

            // Flush buffered output AFTER sending resumed, so frontend clears first
            // then writes buffer on top of a clean terminal
            safeSend(ws, { type: 'resumed', backend: sessionId })
            if (currentSession.outputBuffer && currentSession.outputBuffer.length > 0) {
              const buffered = currentSession.outputBuffer.join('')
              currentSession.outputBuffer = []
              safeSend(ws, { type: 'output', data: buffered })
            }
            // PTY is already running — no need to respawn
            break
          }

          // No existing session — spawn new PTY
          console.log(`[terminal] Spawning new PTY session="${sessionId}" cols=${cols} rows=${rows}`)

          let newPty
          try {
            newPty = spawnPty(sessionId, cols, rows)
          } catch (err) {
            console.error('[terminal] PTY spawn error:', err)
            safeSend(ws, { type: 'error', message: `Failed to start ${sessionId}: ${err.message}` })
            break
          }

          currentSession = {
            pty: newPty,
            backend: sessionId,
            ws,
            outputBuffer: [],
          }
          sessionMap.set(sessionId, currentSession)

          newPty.onData((data) => {
            if (currentSession && currentSession.ws && currentSession.ws.readyState === ws.OPEN) {
              safeSend(currentSession.ws, { type: 'output', data })
            } else if (currentSession) {
              // Offline — buffer the output (ring buffer)
              currentSession.outputBuffer.push(data)
              if (currentSession.outputBuffer.length > OUTPUT_MAX) {
                currentSession.outputBuffer.shift()
              }
            }
          })

          newPty.onExit(({ exitCode, signal }) => {
            console.log(`[terminal] PTY exited session="${sessionId}" code=${exitCode} signal=${signal}`)
            safeSend(ws, { type: 'exit', exitCode, signal })
            sessionMap.delete(sessionId)
            currentSession = null
          })

          safeSend(ws, { type: 'started', backend: sessionId })
          break
        }

        case 'input': {
          if (currentSession?.pty) {
            currentSession.pty.write(msg.data)
          }
          break
        }

        case 'resize': {
          if (currentSession?.pty) {
            currentSession.pty.resize(msg.cols || 80, msg.rows || 30)
          }
          break
        }

        default:
          break
      }
    })

    ws.on('close', () => {
      console.log('[terminal] WebSocket disconnected — keeping PTY alive')
      // Detach: keep PTY running, just clear the ws reference
      if (currentSession) {
        currentSession.ws = null
        // Clear outputBuffer since we don't want stale content after long offline periods
        currentSession.outputBuffer = []
      }
    })

    ws.on('error', (err) => {
      console.error('[terminal] WebSocket error:', err.message)
    })
  })

  // Expose helper for graceful shutdown
  wss.shutdown = () => {
    for (const [sessionId, session] of sessionMap) {
      try { session.pty.kill() } catch { /* ignore */ }
      sessionMap.delete(sessionId)
    }
    wss.close()
  }

  return wss
}
