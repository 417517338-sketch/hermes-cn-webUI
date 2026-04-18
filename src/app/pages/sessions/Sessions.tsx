/**
 * 会话管理页面对应 Agent 能力：state.db 会话查询、FTS5 全文搜索
 * @see CONSTITUTION.md 第二章 2.2.3
 */
import { useQuery } from '@tanstack/react-query'
import { Search, Trash2, X, MessageSquare, Clock, Hash, Zap } from 'lucide-react'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { SessionListItem } from '@/lib/api'

type Session = SessionListItem

type SessionDetail = Session & {
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string | null }>
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

const platformLabels: Record<string, { label: string; color: string }> = {
  cli: { label: 'CLI', color: 'bg-blue-500/10 text-blue-500' },
  telegram: { label: 'Telegram', color: 'bg-sky-500/10 text-sky-500' },
  discord: { label: 'Discord', color: 'bg-indigo-500/10 text-indigo-500' },
  slack: { label: 'Slack', color: 'bg-purple-500/10 text-purple-500' },
  wechat: { label: 'WeChat', color: 'bg-green-500/10 text-green-500' },
  feishu: { label: '飞书', color: 'bg-orange-500/10 text-orange-500' },
}

export function Sessions() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions', debouncedSearch],
    queryFn: () => api.getSessions(50, 0, debouncedSearch || undefined),
  })

  const handleRowClick = async (session: Session) => {
    setDetailLoading(true)
    setSelectedSession(null)
    try {
      const detail = await api.getSessionMessages(session.id)
      setSelectedSession({ ...session, messages: detail.messages || [] })
    } catch (e) {
      console.error('Failed to load session detail:', e)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCloseDetail = () => {
    setSelectedSession(null)
  }

  const filteredSessions = data?.sessions || []

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">会话管理</h2>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索会话标题... (FTS5 全文搜索)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredSessions.length} 个会话
        </span>
      </div>

      {/* Sessions Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium">摘要</th>
              <th className="px-4 py-3 text-left text-sm font-medium">平台</th>
              <th className="px-4 py-3 text-left text-sm font-medium">消息数</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Token</th>
              <th className="px-4 py-3 text-right text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-destructive">
                  获取会话失败
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无会话记录
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(session)}
                >
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {formatDate(session.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="truncate max-w-[300px] block">
                      {session.title || '无标题'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        platformLabels[session.platform || '']?.color || 'bg-gray-500/10 text-gray-500'
                      }`}
                    >
                      {session.platform || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{session.message_count || 0}</td>
                  <td className="px-4 py-3 text-sm">{formatTokens(session.token_used || 0)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="删除会话"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={handleCloseDetail}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Drawer */}
          <div
            className="relative w-full max-w-2xl bg-background border-l border-border overflow-y-auto animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-background">
              <div>
                <h3 className="font-semibold text-lg">
                  {selectedSession.title || '无标题会话'}
                </h3>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(selectedSession.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {selectedSession.message_count} 条消息
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {formatTokens(selectedSession.token_used)} tokens
                  </span>
                </div>
              </div>
              <button
                onClick={handleCloseDetail}
                className="rounded-lg p-2 hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Message Thread */}
            <div className="p-4 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">加载消息历史...</div>
                </div>
              ) : selectedSession.messages?.length > 0 ? (
                selectedSession.messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : msg.role === 'assistant'
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {msg.role === 'user' ? 'U' : msg.role === 'assistant' ? 'A' : 'S'}
                    </div>
                    <div
                      className={`flex-1 rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无消息记录
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 p-4 border-t border-border bg-background">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm"
              >
                关闭
              </button>
              <button className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                继续对话
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
