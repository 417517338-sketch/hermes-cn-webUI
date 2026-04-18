/**
 * 对话界面 - openclaw style
 * @description 重写自 hermes-ourmar 对话页面，采用 Catppuccin Mocha 配色和 openclaw 风格
 * - 普通模式：前端直接调用底层模型 API（无 Agent），快速响应
 * - Agent 模式：启用工具调用、多步推理等高级能力
 * - 所有功能默认开放，无激活限制
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Send, Square, Command, Copy, Check, Trash2,
  Download, Sparkles, Zap, ChevronRight,
  Bot, User, Paperclip, XCircle, X,
  ToggleLeft, ToggleRight
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// ============================================================================
// 类型定义
// ============================================================================

type ChatMode = 'direct' | 'agent'

interface Attachment {
  name: string
  size: number
  url: string
  content?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; name: string; args: unknown }>
  name?: string
  isComplete?: boolean
  attachments?: Attachment[]
}

interface SlashCommand {
  id: string
  label: string
  description: string
  isAdvanced?: boolean
  icon?: React.ReactNode
  action: () => void
}

interface ModelOption {
  id: string
  name: string
  provider: string
  provider_name: string
}

interface ModelsAPIResponse {
  current: {
    model: string
    provider: string
    base_url: string
  }
  quick_selection: ModelOption[]
  all_models: ModelOption[]
}

type BotStatus = 'idle' | 'thinking' | 'calling_tool' | 'uploading_memory' | 'outputting'

// ============================================================================
// 常量定义
// ============================================================================

/** 斜杠命令 */
const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'help', label: '/help', description: '显示所有可用命令', action: () => {} },
  { id: 'clear', label: '/clear', description: '清空当前对话', action: () => {} },
  { id: 'model', label: '/model', description: '切换当前使用的 AI 模型', action: () => {} },
  { id: 'usage', label: '/usage', description: '查看当月用量统计', action: () => {} },
  { id: 'tools', label: '/tools', description: '查看可用工具列表', action: () => {} },
  { id: 'skills', label: '/skills', description: '查看和管理已安装技能', action: () => {} },
  { id: 'delegation', label: '/delegation', description: '打开子 Agent 委派面板', action: () => {} },
  { id: 'export', label: '/export', description: '导出当前对话', action: () => {} },
  { id: 'session', label: '/session', description: '管理会话历史', action: () => {} },
]

/** 模式切换说明 */
const MODE_INFO = {
  direct: {
    label: '普通模式',
    description: '直连模型，响应快',
    color: '#60a5fa',
  },
  agent: {
    label: 'Agent 模式',
    description: '启用工具调用',
    color: '#cba6f7',
  },
}

/** 最大 token 使用量 */
const MAX_TOKEN = 128000

// Catppuccin Mocha 配色
const COLORS = {
  background: '#1a1a22',
  surface: '#313244',
  surfaceHover: '#3b3b52',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  muted: '#6c7086',
  purple: '#cba6f7',
  userBubble: '#1a6b3a',     // 微信绿深色，白字
  userText: '#ffffff',
  userBorder: '#2d8a4e',
  assistantBubble: '#1a365d', // 深蓝色气泡
  assistantText: '#ffffff',  // 白色文字
  blue: '#60a5fa',
  green: '#41d484',
  amber: '#fbbf24',
  red: '#f38ba8',
  border: '#45475a',
}

// ============================================================================
// API 函数
// ============================================================================

async function fetchModels(): Promise<ModelsAPIResponse> {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}

// ============================================================================
// 子组件
// ============================================================================

/** Bot 状态徽章 - 彩色动画点 */
function BotStatusBadge({ status }: { status: BotStatus }) {
  const config: Record<BotStatus, { label: string; bg: string; color: string; dot: string }> = {
    idle: { label: '空闲', bg: 'rgba(108, 112, 134, 0.2)', color: '#6c7086', dot: '#6c7086' },
    thinking: { label: '正在调用模型', bg: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa', dot: '#60a5fa' },
    calling_tool: { label: '正在调用技能', bg: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', dot: '#fbbf24' },
    uploading_memory: { label: '上传记忆', bg: 'rgba(203, 166, 247, 0.2)', color: '#cba6f7', dot: '#cba6f7' },
    outputting: { label: '正在输出', bg: 'rgba(65, 212, 132, 0.2)', color: '#41d484', dot: '#41d484' },
  }

  if (status === 'idle') return null

  const { label, bg, color, dot } = config[status]
  const isAnimated = status === 'thinking' || status === 'calling_tool' || status === 'uploading_memory'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${isAnimated ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: dot }}
      />
      {label}
    </span>
  )
}

/** Token 进度条 */
function TokenProgressBar({ used, max }: { used: number; max: number }) {
  const percent = Math.min((used / max) * 100, 100)
  const getColor = () => {
    if (percent > 90) return COLORS.red
    if (percent > 70) return COLORS.amber
    return COLORS.blue
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full"
        style={{ backgroundColor: COLORS.surface }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: getColor() }}
        />
      </div>
      <span className="text-xs" style={{ color: COLORS.muted }}>
        {used.toLocaleString()}/{max.toLocaleString()}
      </span>
    </div>
  )
}

/** 工具调用面板 - 折叠展开 */
function ToolCallPanel({ toolCalls }: { toolCalls: Array<{ id: string; name: string; args: unknown }> }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mt-3 overflow-hidden rounded-lg" style={{ backgroundColor: COLORS.background }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/5"
        style={{ color: COLORS.amber }}
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        />
        <Zap className="h-3 w-3" />
        <span>工具调用 ({toolCalls.length})</span>
      </button>

      {isExpanded && (
        <div className="space-y-2 px-3 pb-3">
          {toolCalls.map((tool, i) => {
            const argsObj = tool.args as Record<string, unknown> | null
            return (
              <div
                key={tool.id || i}
                className="rounded-lg p-3"
                style={{ backgroundColor: COLORS.surface }}
              >
                <p className="font-mono text-xs font-medium" style={{ color: COLORS.purple }}>
                  {tool.name}
                </p>
                {argsObj && typeof argsObj === 'object' && (
                  <pre
                    className="mt-2 overflow-x-auto text-xs"
                    style={{ color: COLORS.subtext }}
                  >
                    {JSON.stringify(argsObj, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 消息气泡 - openclaw 风格，头像与气泡同行 */
function MessageBubble({
  msg,
  isStreaming,
  botStatus,
  onCopy,
}: {
  msg: Message
  isStreaming: boolean
  botStatus: BotStatus
  onCopy: (content: string, id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const isAssistant = msg.role === 'assistant'

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy(content, id)
  }

  return (
    <div className={`group relative flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 头像 */}
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: isUser ? COLORS.userBubble : COLORS.assistantBubble }}
      >
        {isUser 
          ? <User className="h-4 w-4" style={{ color: COLORS.userText }} /> 
          : <Bot className="h-4 w-4" style={{ color: COLORS.assistantText }} />}
      </div>

      <div
        className="relative max-w-[80%] rounded-2xl px-3 py-2"
        style={{
          backgroundColor: isUser ? COLORS.userBubble : COLORS.assistantBubble,
          borderLeft: isUser ? `3px solid ${COLORS.userBorder}` : 'none',
          borderRadius: isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
        }}
      >
        {/* 悬浮复制按钮 */}
        {msg.content && (
          <button
            onClick={() => handleCopy(msg.content, msg.id)}
            className={`absolute top-1 rounded-lg p-1 opacity-0 transition-all duration-200 hover:bg-white/10 group-hover:opacity-100 ${isUser ? '-left-10' : '-right-10'}`}
            style={{ color: COLORS.muted }}
            title="复制"
          >
            {copied ? (
              <Check className="h-4 w-4" style={{ color: COLORS.green }} />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}

        {/* 消息内容 */}
        {isAssistant ? (
          <div
            className="whitespace-pre-wrap break-words"
            style={{ color: COLORS.assistantText, fontSize: '0.75rem', lineHeight: '1.6' }}
          >
            {/* 流式中：纯<div>文本不过 markdown 解析，完整保留空白字符 */}
            {isStreaming && !msg.isComplete ? (
              <div
                style={{
                  color: COLORS.assistantText,
                  fontSize: '0.75rem',
                  lineHeight: '1.6',
                  margin: 0,
                  padding: 0,
                  background: 'transparent',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                }}
              >
                {msg.content}
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const { onClick, ...rest } = props as { onClick?: () => void }
                    const match = /language-(\w+)/.exec(className || '')
                    const codeString = String(children).replace(/\n$/, '')
                    const isInline = !match && !className

                    if (isInline) {
                      return (
                        <code
                          className="rounded px-1 py-0.5 font-mono text-xs"
                          style={{ backgroundColor: COLORS.background }}
                          {...rest}
                        >
                          {children}
                        </code>
                      )
                    }

                    return (
                      <div className="group/code relative">
                        <button
                          onClick={() => handleCopy(codeString, `${msg.id}_code`)}
                          className="absolute right-2 top-2 z-10 rounded-lg p-1 opacity-0 transition-all duration-200 hover:bg-white/10 group-hover/code:opacity-100"
                          style={{ color: COLORS.muted, backgroundColor: COLORS.surface }}
                          title="复制代码"
                        >
                          {copied ? (
                            <Check className="h-4 w-4" style={{ color: COLORS.green }} />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match ? match[1] : 'text'}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: '0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: COLORS.background,
                          }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    )
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            )}

            {/* 流式输出指示器 */}
            {isStreaming && !msg.isComplete && (
              <span className="ml-1 inline-block h-3 w-3 animate-pulse" style={{ color: COLORS.green }}>
                ▊
              </span>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: isUser ? COLORS.userText : COLORS.assistantText }}>
            {msg.content}
          </p>
        )}

        {/* 附件 */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {msg.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all hover:bg-white/10"
                style={{ backgroundColor: COLORS.surface, color: COLORS.blue }}
                download={att.name}
              >
                <Paperclip className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{att.name}</span>
                <span style={{ color: COLORS.muted }}>({(att.size / 1024).toFixed(1)}KB)</span>
              </a>
            ))}
          </div>
        )}

        {/* 工具调用 */}
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <ToolCallPanel toolCalls={msg.tool_calls} />
        )}

        {/* 流式状态指示 */}
        {isAssistant && isStreaming && !msg.isComplete && (
          <div className="mt-2">
            <BotStatusBadge status={botStatus} />
          </div>
        )}
      </div>
    </div>
  )
}

/** 斜杠命令面板 */
function SlashPanel({
  commands,
  selectedIndex,
  onExecute,
  onClose,
}: {
  commands: SlashCommand[]
  selectedIndex: number
  onExecute: (cmd: SlashCommand) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border shadow-xl"
      style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${COLORS.border}` }}
      >
        <span className="text-xs" style={{ color: COLORS.muted }}>
          {commands.length} 个命令
        </span>
        <button
          onClick={onClose}
          className="rounded-lg p-1 transition-colors hover:bg-white/10"
          style={{ color: COLORS.muted }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 命令列表 */}
      <div className="max-h-64 overflow-y-auto py-1">
        {commands.map((cmd, index) => {
          return (
            <button
              key={cmd.id}
              onClick={() => onExecute(cmd)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
              style={{
                backgroundColor: index === selectedIndex ? COLORS.surface : 'transparent',
                color: COLORS.text,
                cursor: 'pointer',
              }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs font-medium"
                style={{ backgroundColor: COLORS.surface, color: COLORS.purple }}
              >
                {cmd.label}
              </span>
              <span className="flex-1" style={{ color: COLORS.text }}>
                {cmd.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export function Chat(props: {
  tabId?: string
  tabTitle?: string
  tabs?: { id: string; title: string }[]
  isActive?: boolean
  onNewTab?: () => void
  onSwitchTab?: (tabId: string) => void
  onCloseTab?: (tabId: string) => void
  availablePlatforms?: Array<{
    id: string
    source: string
    user_id: string
    title: string
    started_at: string
    recent_count: number
  }>
}) {
  const {
    tabId = 'default',
    tabTitle = '对话 1',
    tabs = [],
    isActive = true,
    onNewTab,
    onSwitchTab,
    onCloseTab,
    availablePlatforms = [],
  } = props

  // -------------------------------------------------------------------------
  // localStorage keys
  // -------------------------------------------------------------------------
  const messagesKey = useMemo(() => `hermes_chat_messages_${tabId}`, [tabId])
  const inputKey = useMemo(() => `hermes_chat_input_${tabId}`, [tabId])
  // -------------------------------------------------------------------------
  // 服务端状态 (useQuery)
  // -------------------------------------------------------------------------
  const { data: modelsData } = useQuery<ModelsAPIResponse>({
    queryKey: ['models'],
    queryFn: fetchModels,
    staleTime: 60 * 60 * 1000,
  })

  // -------------------------------------------------------------------------
  // 客户端状态 (useState)
  // -------------------------------------------------------------------------

  /** 消息列表 */
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(messagesKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return parsed as Message[]
        }
      }
    } catch { /* ignore */ }
    return []
  })

  /** 输入框内容 */
  const [input, setInput] = useState<string>(() => {
    try { return localStorage.getItem(inputKey) || '' } catch { return '' }
  })

  /** 是否正在流式生成 */
  const [isStreaming, setIsStreaming] = useState(false)

  /** 当前复制的消息 ID */
  const [copiedId, setCopiedId] = useState<string | null>(null)

  /** 是否显示斜杠命令面板 */
  const [showSlashPanel, setShowSlashPanel] = useState(false)

  /** 斜杠命令过滤关键词 */
  const [slashFilter, setSlashFilter] = useState('')

  /** 斜杠命令选中索引 */
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)

  // -------------------------------------------------------------------------
  // 平台标签页消息查询（仅 platformTab 模式）
  // -------------------------------------------------------------------------
  /** Token 使用量 */
  const [tokenUsage, setTokenUsage] = useState({ used: 0, max: MAX_TOKEN })

  /** 选中的模型 */
  const [selectedModel, setSelectedModel] = useState<string>('')

  /** 是否正在导出 */
  const [isExporting, setIsExporting] = useState(false)

  /** 机器人实时状态 */
  const [botStatus, setBotStatus] = useState<BotStatus>('idle')

  /** 附件列表 */
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashPanelRef = useRef<HTMLDivElement>(null)
  const compositionInputRef = useRef<string>('')

  // -------------------------------------------------------------------------
  // 派生状态
  // -------------------------------------------------------------------------
  /** 对话模式：普通模式(direct) 或 Agent 模式(agent) */
  const [chatMode, setChatMode] = useState<ChatMode>('direct')

  const tokenPercent = Math.min((tokenUsage.used / tokenUsage.max) * 100, 100)

  /** 当前消息列表 */
  const currentMessages = messages

  /** 合并后的所有命令列表 */
  const allCommands = SLASH_COMMANDS

  /** 过滤后的斜杠命令 */
  const filteredSlashCommands = allCommands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
      cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  )

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /** 持久化消息列表 */
  useEffect(() => {
    try { localStorage.setItem(messagesKey, JSON.stringify(messages)) } catch {}
  }, [messages, messagesKey])

  /** 持久化输入框 */
  useEffect(() => {
    try { localStorage.setItem(inputKey, input) } catch {}
  }, [input, inputKey])

  /** 当 tab 变为非激活时，清空输入框 */
  useEffect(() => {
    if (!isActive) setInput('')
  }, [isActive])

  /** 滚动到底部 */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  /** 自动调整 textarea 高度 */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, window.innerHeight * 0.3)}px`
    }
  }, [input])

  /** 初始化 selectedModel */
  useEffect(() => {
    if (modelsData?.current?.model && !selectedModel) {
      setSelectedModel(modelsData.current.model)
    }
  }, [modelsData, selectedModel])

  /** 点击外部关闭斜杠命令面板 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (slashPanelRef.current && !slashPanelRef.current.contains(e.target as Node)) {
        const textarea = textareaRef.current
        if (textarea && !textarea.contains(e.target as Node)) {
          closeSlashPanel()
        }
      }
    }
    if (showSlashPanel) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSlashPanel])

  // -------------------------------------------------------------------------
  // 回调函数
  // -------------------------------------------------------------------------

  /** 关闭斜杠命令面板 */
  const closeSlashPanel = () => {
    setShowSlashPanel(false)
    setSlashFilter('')
    setSlashSelectedIndex(0)
  }

  /** 打开斜杠命令面板 */
  const openSlashPanel = () => {
    setSlashFilter('')
    setShowSlashPanel(true)
    setSlashSelectedIndex(0)
    textareaRef.current?.focus()
  }

  /** 复制到剪贴板 */
  const handleCopyToClipboard = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* ignore */ }
  }

  /** 清空对话 */
  const handleClearChat = () => {
    setMessages([])
  }

  /** 输入框变化处理 */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    const lastLine = value.split('\n').pop() || ''
    if (lastLine.startsWith('/')) {
      setSlashFilter(lastLine.slice(1))
      setShowSlashPanel(true)
      setSlashSelectedIndex(0)
    } else {
      if (showSlashPanel) closeSlashPanel()
    }
  }

  /** 键盘事件处理 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashPanel) {
      const filtered = filteredSlashCommands
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSelectedIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); executeSlashCommand(filtered[slashSelectedIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); closeSlashPanel(); return }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const trimmed = input.trim()
      if (trimmed) {
        e.preventDefault()
        handleSendMessage()
      }
      return
    }
  }

  /** compositionend：IME 组词完成 */
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    compositionInputRef.current = e.currentTarget.value
  }

  /** compositionstart：IME 开始 */
  const handleCompositionStart = () => {
    compositionInputRef.current = ''
  }

  /** 执行斜杠命令 */
  const executeSlashCommand = (cmd: SlashCommand) => {
    switch (cmd.id) {
      case 'clear':
        setMessages([])
        break
      case 'help':
        setInput('/help — 显示帮助\n/list — 列出所有命令\n/model [模型名] — 切换模型\n/tools — 显示可用工具\n/session — 管理会话\n/clear — 清空对话')
        break
      case 'tools': setInput('/tools — 查看可用工具列表'); break
      case 'model': setInput('/model — 切换当前使用的 AI 模型'); break
      case 'export': handleExport('markdown'); break
      case 'skills': setInput('/skills — 查看和管理已安装技能'); break
      case 'delegation': setInput('/delegation — 打开子 Agent 委派面板'); break
      case 'usage': setInput('/usage — 查看当月用量统计'); break
      default: setInput(cmd.label + ' ')
    }
    closeSlashPanel()
  }

  /** 导出对话 */
  const handleExport = async (format: 'markdown' | 'json') => {
    setIsExporting(true)
    try {
      const msgs = currentMessages
      const content = format === 'markdown'
        ? msgs.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
        : JSON.stringify(msgs, null, 2)
      const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conversation_${Date.now()}.${format === 'markdown' ? 'md' : 'json'}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  /** 文件选择 */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // 使用 TextDecoder 尝试多种编码读取文件内容
    const readFileContent = (file: File): Promise<string> => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as ArrayBuffer
          // 先尝试 UTF-8
          let text = new TextDecoder('utf-8').decode(result)
          // 检测是否为乱码（包含大量替换字符）
          const garbledRatio = (text.match(/\uFFFD/g) || []).length / text.length
          if (garbledRatio > 0.05) {
            // UTF-8 乱码率高，尝试 GBK（中文 Windows 常用编码）
            text = new TextDecoder('gbk').decode(result)
          }
          resolve(text)
        }
        reader.readAsArrayBuffer(file)
      })
    }

    const processFiles = async () => {
      const fileArray = Array.from(files)
      const contents = await Promise.all(fileArray.map(f => readFileContent(f)))
      const newAttachments: Attachment[] = fileArray.map((file, i) => ({
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        content: contents[i].slice(0, 50000), // 限制文件内容大小
      }))
      setAttachments((prev) => [...prev, ...newAttachments])
    }
    processFiles()
    e.target.value = '' // 清空，允许重复选择同一文件
  }

  /** 移除附件 */
  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[index].url) // 释放对象 URL
      updated.splice(index, 1)
      return updated
    })
  }

  /** 发送消息 */
  const handleSendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return
    if (isStreaming) return
    if (showSlashPanel) closeSlashPanel()

    // 拼接附件内容到消息
    const attachmentText = attachments
      .map((att) => `【文件: ${att.name}】\n\`\`\`\n${att.content || '(无法读取文件内容)'}\n\`\`\``)
      .join('\n\n')
    const fullContent = input.trim()
      ? (attachmentText ? `${input.trim()}\n\n${attachmentText}` : input.trim())
      : attachmentText

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: fullContent,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }
    const newMessagesList = [...currentMessages, userMessage]

    setMessages(newMessagesList)
    setInput('')
    setIsStreaming(true)
    abortControllerRef.current = new AbortController()

    // 根据模式选择端点
    const apiEndpoint = chatMode === 'direct'
      ? '/api/chat/direct'
      : '/api/chat/completions'

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessagesList.map((m) => ({ role: m.role, content: m.content, name: m.name })),
          stream: true,
          model: selectedModel || undefined,
        }),
        signal: abortControllerRef.current.signal,
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage: Message = { id: `assistant_${Date.now()}`, role: 'assistant', content: '', isComplete: false }
      let hasSeenToolCalls = false
      let hasSeenContent = false

      setBotStatus('thinking')
      setMessages((prev) => [...prev, assistantMessage])

      if (reader) {
        let streamDone = false
        let leftover = ''
        while (!streamDone) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          // 拼上上次残留的碎片，以 \n\n 为分隔符（每个 SSE 事件以双换行结束）
          const events = (leftover + chunk).split('\n\n')
          leftover = events.pop() || '' // 保留最后一个不完整的，留到下次
          for (const rawEvent of events) {
            const line = rawEvent.trim()
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') {
              assistantMessage = { ...assistantMessage, isComplete: true }
              streamDone = true
              break
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.status === 'thinking') {
                setBotStatus('thinking')
              } else if (parsed.status === 'outputting') {
                setBotStatus('outputting')
              }
              // 仅当服务端没有明确指定状态时，才用内容推断（Agent 模式兼容）
              const serverStatus = parsed.status
              if (!serverStatus && parsed.content) {
                const text = parsed.content
                // 从内容文本推断状态：包含工具执行标识 → 正在调用技能
                const isToolExecution =
                  text.includes('💻') ||
                  text.includes('⚠️') ||
                  /DANGEROUS COMMAND/.test(text) ||
                  /Initializing agent/.test(text) ||
                  /\[[oO]nce\|[s]ession\|[d]eny\]/.test(text)
                if (!hasSeenContent && !isToolExecution) {
                  setBotStatus('outputting'); hasSeenContent = true
                } else if (isToolExecution && botStatus !== 'calling_tool') {
                  setBotStatus('calling_tool')
                }
              }
              if (parsed.content) {
                assistantMessage = { ...assistantMessage, content: assistantMessage.content + parsed.content }
                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIndex = updated.length - 1
                  if (lastIndex >= 0 && updated[lastIndex].id === assistantMessage.id) updated[lastIndex] = { ...assistantMessage }
                  return updated
                })
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
              }
              if (parsed.tool_calls) {
                if (!hasSeenToolCalls) { setBotStatus('calling_tool'); hasSeenToolCalls = true }
                assistantMessage = { ...assistantMessage, tool_calls: parsed.tool_calls }
                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIndex = updated.length - 1
                  if (lastIndex >= 0 && updated[lastIndex].id === assistantMessage.id) updated[lastIndex] = { ...assistantMessage }
                  return updated
                })
              }
              if (parsed.usage) {
                setTokenUsage((prev) => ({
                  ...prev,
                  used: parsed.usage.total_tokens || 0,
                }))
              }
              // 处理服务端返回的错误信息
              if (parsed.error) {
                assistantMessage = {
                  ...assistantMessage,
                  content: `⚠️ ${parsed.error}`,
                  isComplete: true,
                }
                streamDone = true
                break
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      assistantMessage.isComplete = true
      setMessages((prev) => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].id === assistantMessage.id) updated[lastIndex] = { ...assistantMessage }
        return updated
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Stream aborted by user')
      } else {
        console.error('Chat error:', error)
        setMessages((prev) => [
          ...prev,
          { id: `error_${Date.now()}`, role: 'assistant', content: '抱歉，发生了错误。请稍后重试。', isComplete: true },
        ])
      }
    } finally {
      setIsStreaming(false)
      setBotStatus('idle')
      abortControllerRef.current = null
      setAttachments([])
    }
  }

  /** 停止生成 */
  const handleStopGeneration = () => {
    if (abortControllerRef.current) { abortControllerRef.current.abort(); setIsStreaming(false) }
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold" style={{ color: COLORS.text }}>对话</h2>

          {/* 模式切换 */}
          <button
            onClick={() => setChatMode(chatMode === 'direct' ? 'agent' : 'direct')}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-opacity-80"
            style={{
              backgroundColor: chatMode === 'agent' ? COLORS.purple + '20' : 'transparent',
              borderColor: chatMode === 'agent' ? COLORS.purple : COLORS.border,
              color: chatMode === 'agent' ? COLORS.purple : COLORS.muted,
            }}
            title={chatMode === 'direct' ? '切换到 Agent 模式' : '切换到普通模式'}
          >
            {chatMode === 'direct' ? (
              <><ToggleLeft className="h-4 w-4" /> 普通</>
            ) : (
              <><ToggleRight className="h-4 w-4" /> Agent</>
            )}
          </button>

          {/* 模型信息（只读） */}
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
            style={{
              backgroundColor: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.text,
            }}
            title="当前模型（不可切换）"
          >
            <Bot className="h-3.5 w-3.5" style={{ color: COLORS.purple }} />
            <span className="font-medium">
              {modelsData?.current?.model || selectedModel || 'MiniMax-M2.7-highspeed'}
            </span>
            <span style={{ color: COLORS.muted }}>·</span>
            <span style={{ color: COLORS.muted, fontSize: '0.75rem' }}>
              {modelsData?.current?.provider || 'MiniMax'}
            </span>
          </div>

          {/* Token 进度条 */}
          <TokenProgressBar used={tokenUsage.used} max={tokenUsage.max} />

          {/* Bot 状态 */}
          <BotStatusBadge status={botStatus} />
        </div>

        <div className="flex items-center gap-2">
          {/* 导出 */}
          <button
            onClick={() => handleExport('markdown')}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-opacity-80"
            style={{
              borderColor: COLORS.border,
              color: COLORS.text,
            }}
            title="导出对话"
          >
            <Download className="h-4 w-4" />
            <span>导出</span>
          </button>

          {/* 清空 */}
          <button
            onClick={handleClearChat}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-opacity-80"
            style={{ borderColor: COLORS.border, color: COLORS.text }}
            title="清空对话"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* 斜杠命令 */}
          <button
            onClick={openSlashPanel}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-opacity-80"
            style={{ borderColor: COLORS.border, color: COLORS.text }}
          >
            <Command className="h-4 w-4" />
            <span>命令</span>
          </button>
        </div>
      </div>

      {/* 模式切换说明 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: COLORS.muted }}>模式：</span>
        <div className="flex items-center rounded-lg border px-3 py-1.5 gap-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}>
          {/* 普通模式 */}
          <button
            onClick={() => setChatMode('direct')}
            className="flex items-center gap-2 text-xs transition-all"
            style={{ color: chatMode === 'direct' ? COLORS.blue : COLORS.muted }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chatMode === 'direct' ? COLORS.blue : COLORS.muted }}
            />
            <span className="font-medium">普通模式</span>
            <span className="text-xs" style={{ color: COLORS.muted }}>直连模型，响应快</span>
          </button>

          <div className="h-4 w-px" style={{ backgroundColor: COLORS.border }} />

          {/* Agent 模式 */}
          <button
            onClick={() => setChatMode('agent')}
            className="flex items-center gap-2 text-xs transition-all"
            style={{ color: chatMode === 'agent' ? COLORS.purple : COLORS.muted }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chatMode === 'agent' ? COLORS.purple : COLORS.muted }}
            />
            <span className="font-medium">Agent 模式</span>
            <span className="text-xs" style={{ color: COLORS.muted }}>启用工具调用</span>
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div
        className="flex-1 overflow-y-auto rounded-xl border"
        style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
      >
        <div className="mx-auto flex h-full flex-col p-2" style={{ maxWidth: '90%' }}>
          {/* 空状态提示 */}
          {currentMessages.length === 0 && (
            <div
              className="flex h-full flex-col items-center justify-center rounded-xl"
              style={{ color: COLORS.muted }}
            >
              <div
                className="mb-4 rounded-full p-4"
                style={{ backgroundColor: COLORS.surface }}
              >
                <Send className="h-8 w-8" style={{ color: COLORS.purple }} />
              </div>
              <p className="text-lg font-medium" style={{ color: COLORS.subtext }}>开始一段新对话</p>
              <p className="mt-1 text-sm">输入消息开始与 AI 助手交流</p>
            </div>
          )}

          {/* 消息列表 */}
          {currentMessages.length > 0 && (
            <div className="space-y-3">
              {currentMessages.map((msg) => {
                const isLastAssistantMsg = msg.role === 'assistant' && currentMessages[currentMessages.length - 1]?.id === msg.id
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isStreaming={isStreaming && isLastAssistantMsg}
                    botStatus={botStatus}
                    onCopy={handleCopyToClipboard}
                  />
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 输入区域 */}
      <div className="mt-4 flex items-end gap-3">
        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="*/*"
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                  style={{ backgroundColor: COLORS.surface, color: COLORS.text }}
                >
                  <Paperclip className="h-3 w-3 flex-shrink-0" style={{ color: COLORS.muted }} />
                  <span className="truncate max-w-32">{att.name}</span>
                  <span className="flex-shrink-0" style={{ color: COLORS.muted }}>
                    ({(att.size / 1024).toFixed(1)}KB)
                  </span>
                  <button
                    onClick={() => handleRemoveAttachment(i)}
                    className="ml-1 rounded p-0.5 transition-all hover:bg-white/10"
                    style={{ color: COLORS.muted }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionEnd={handleCompositionEnd}
              onCompositionStart={handleCompositionStart}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行, / 打开命令)"
              className="w-full resize-none rounded-xl border p-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2"
              style={{
                backgroundColor: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.text,
                maxHeight: '30vh',
              }}
              rows={3}
              disabled={isStreaming}
            />
          </div>
          {showSlashPanel && filteredSlashCommands.length > 0 && (
            <SlashPanel
              commands={filteredSlashCommands}
              selectedIndex={slashSelectedIndex}
              onExecute={executeSlashCommand}
              onClose={closeSlashPanel}
            />
          )}
        </div>

        {/* 按钮组：靠右对齐 */}
        <div className="flex flex-col items-center gap-2">
          {/* 附件按钮 */}
          <div className="flex flex-row items-center gap-2" style={{ minWidth: '88px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              className="rounded-xl p-2.5 transition-all hover:scale-105 disabled:opacity-50"
              style={{ backgroundColor: COLORS.surface, color: COLORS.text, minWidth: '88px' }}
              title="添加附件"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>

          {/* 发送/停止按钮 */}
          {isStreaming ? (
            <button
              onClick={handleStopGeneration}
              className="rounded-xl p-2.5 transition-all hover:scale-105"
              style={{ backgroundColor: COLORS.red, color: '#fff', minWidth: '88px' }}
              title="停止生成"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() && attachments.length === 0}
              className="rounded-xl p-2.5 transition-all hover:scale-105 disabled:opacity-50"
              style={{ backgroundColor: COLORS.purple, color: COLORS.background, minWidth: '88px' }}
              title="发送消息"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}