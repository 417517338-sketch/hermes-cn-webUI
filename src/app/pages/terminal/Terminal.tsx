/**
 * 终端界面对应 Agent 能力：6 种终端后端
 * @see CONSTITUTION.md 第二章 2.2.13
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Server, Terminal as TerminalIcon } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

const NEEDS_RESTORE_KEY = 'hermes-terminal-needs-restore'
const BUFFER_KEY = 'hermes-terminal-buffer'
const BUFFER_MAX = 200

const BACKENDS = [
  { id: 'local', label: 'Local', desc: '本地 Shell' },
  { id: 'docker', label: 'Docker', desc: 'Docker 容器' },
  { id: 'ssh', label: 'SSH', desc: '远程 SSH' },
  { id: 'singularity', label: 'Singularity', desc: 'Singularity 容器' },
  { id: 'modal', label: 'Modal', desc: 'Modal 云端' },
  { id: 'daytona', label: 'Daytona', desc: 'Daytona 云 IDE' },
]

interface PtyMessage {
  type: 'start' | 'input' | 'resize' | 'started' | 'resumed' | 'output' | 'exit' | 'error'
  data?: string
  cols?: number
  rows?: number
  backend?: string
  exitCode?: number
  signal?: number
  message?: string
}

export function Terminal() {
  return <TerminalContent />
}

function TerminalContent() {
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [backend, setBackend] = useState('local')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle')
  const xtermRef = useRef<XTerm | null>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputQueueRef = useRef<string[]>([])
  const ptyReadyRef = useRef(false)
  // 每次 connect() 调用递增，用于让过期的 onopen no-op
  const connectionIdRef = useRef(0)
  // 是否需要 localStorage 恢复（只在全新挂载时为 true，reconnect 时为 false）
  const needsLocalRestoreRef = useRef(false)

  const flushInputQueue = useCallback(() => {
    if (!ptyReadyRef.current) return
    const queue = inputQueueRef.current
    inputQueueRef.current = []
    for (const data of queue) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data } satisfies PtyMessage))
      }
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    ptyReadyRef.current = false

    // 使之前的 onopen/onmessage 变成 no-op
    connectionIdRef.current += 1
    const myConnectionId = connectionIdRef.current

    setStatus('connecting')
    const ws = new WebSocket('/ws/terminal')
    wsRef.current = ws

    ws.onopen = () => {
      if (myConnectionId !== connectionIdRef.current) return

      setStatus('connected')
      if (!xtermRef.current) return
      const xterm = xtermRef.current
      const fit = fitAddonRef.current
      if (fit) {
        try { fit.fit() } catch { /* ignore */ }
      }
      const cols = xterm.cols
      const rows = xterm.rows

      // 只有全新 PTY 启动时才恢复 localStorage；reconnect 时跳过
      if (needsLocalRestoreRef.current) {
        needsLocalRestoreRef.current = false
        const savedBuffer = localStorage.getItem(BUFFER_KEY) || ''
        if (savedBuffer) {
          xterm.write(savedBuffer + '\r\n')
          localStorage.setItem(NEEDS_RESTORE_KEY, '0')
        }
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start', backend, cols, rows } satisfies PtyMessage))
      }
    }

    ws.onmessage = (event) => {
      if (myConnectionId !== connectionIdRef.current) return

      let msg: PtyMessage
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        case 'started': {
          ptyReadyRef.current = true
          xtermRef.current?.write('\r\n')
          flushInputQueue()
          break
        }
        case 'resumed': {

          if (xtermRef.current) {
            xtermRef.current.reset()
          }
          ptyReadyRef.current = true
          break
        }
        case 'output':
          if (msg.data) {
            xtermRef.current?.write(msg.data)
          }
          break
        case 'exit':
          xtermRef.current?.write(`\r\n\x1b[33m[PTY 已退出，code=${msg.exitCode} signal=${msg.signal}]\x1b[0m\r\n`)
          setStatus('disconnected')
          ptyReadyRef.current = false
          break
        case 'error':
          xtermRef.current?.write(`\r\n\x1b[31m错误: ${msg.message}\x1b[0m\r\n`)
          break
      }
    }

    ws.onerror = () => {
      if (myConnectionId !== connectionIdRef.current) return
      xtermRef.current?.write('\r\n\x1b[33mWebSocket 连接失败\x1b[0m\r\n')
      setStatus('disconnected')
      ptyReadyRef.current = false
    }

    ws.onclose = () => {
      if (myConnectionId !== connectionIdRef.current) return
      ptyReadyRef.current = false
    }
  }, [backend, flushInputQueue])

  useEffect(() => {
    if (!terminalRef.current) return

    const savedNeedsRestore = localStorage.getItem(NEEDS_RESTORE_KEY) === '1'
    const savedBuffer = localStorage.getItem(BUFFER_KEY) || ''



    // 全新挂载且有保存内容时恢复 localStorage；reconnect 时 needsLocalRestoreRef = false
    needsLocalRestoreRef.current = savedNeedsRestore && savedBuffer.length > 0

    const xterm = new XTerm({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0f172a',
        selectionBackground: '#38bdf880',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      fontFamily: '"Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
    })

    const fit = new FitAddon()
    const links = new WebLinksAddon()

    xterm.loadAddon(fit)
    xterm.loadAddon(links)
    xterm.open(terminalRef.current)

    try { fit.fit() } catch { /* ignore */ }

    xtermRef.current = xterm
    fitAddonRef.current = fit

    xterm.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && ptyReadyRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'input', data } satisfies PtyMessage))
      } else {
        inputQueueRef.current.push(data)
      }
    })

    xterm.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows } satisfies PtyMessage))
      }
    })

    xterm.onTitleChange(() => { /* ignore */ })

    connect()

    return () => {
      if (xtermRef.current) {
        const buffer = xtermRef.current.buffer.active
        const lines: string[] = []
        const totalLines = buffer.length
        const start = Math.max(0, totalLines - BUFFER_MAX)
        for (let i = start; i < totalLines; i++) {
          lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
        }
        const content = lines
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .join('\n')
          .replace(/^\n+/, '')
        localStorage.setItem(BUFFER_KEY, content)
        localStorage.setItem(NEEDS_RESTORE_KEY, '1')
        xtermRef.current.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBackendChange = useCallback((newBackend: string) => {
    setBackend(newBackend)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    setStatus('connecting')
  }, [])

  const statusColor = {
    idle: 'bg-muted',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
  }[status]

  const statusLabel = {
    idle: '待机',
    connecting: '连接中...',
    connected: '已连接',
    disconnected: '已断开',
  }[status]

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">终端界面</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${statusColor} ${status === 'connected' ? 'animate-pulse' : ''}`} />
            <span className="text-xs text-muted-foreground">{statusLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <select
              value={backend}
              onChange={(e) => handleBackendChange(e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              {BACKENDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} — {b.desc}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => { try { fitAddonRef.current?.fit() } catch { /* ignore */ } }}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            title="调整终端大小"
          >
            Fit
          </button>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TerminalIcon className="h-3 w-3" />
            <span>xterm.js + node-pty</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded border border-border bg-[#0f172a]">
        <div ref={terminalRef} className="h-full w-full" />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          后端: <span className="text-foreground">{BACKENDS.find(b => b.id === backend)?.label}</span>
          {' | '}
          快捷键: Ctrl+C 中断 | Ctrl+D 退出 | Ctrl+L 清屏
        </span>
        <button
          onClick={() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.close()
            } else {
              connect()
            }
          }}
          className="hover:text-foreground"
        >
          {status === 'connected' ? '断开连接' : '重新连接'}
        </button>
      </div>
    </div>
  )
}
