/**
 * 内存管理页面对应 Agent 能力：持久化记忆、FTS5 检索、用户档案
 * @see CONSTITUTION.md 第二章 2.2.10
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Trash2, RefreshCw, User, AlertTriangle, Loader2, Trash, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'

interface MemoryEntry {
  id: string
  content: string
  created_at: string
  session_id?: string
  type: 'memory' | 'user'
}

export function Memory() {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery<{
    memories: MemoryEntry[]
    stats: {
      memory: { used: number; limit: number; percentage: number }
      user: { used: number; limit: number; percentage: number }
    }
  }>({
    queryKey: ['memory'],
    queryFn: api.getMemory,
  })

  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState<'memory' | 'user' | 'both' | null>(null)
  const stats = data?.stats

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory'] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: (type: 'memory' | 'user' | 'both') => api.clearMemory(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory'] })
      setConfirmClear(null)
    },
  })

  const rebuildMutation = useMutation({
    mutationFn: api.rebuildMemoryIndex,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory'] })
    },
  })

  const handleDelete = (id: string) => {
    if (confirm(`确定删除这条记忆？`)) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">获取记忆失败</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">无法连接到服务器，请检查服务状态。</p>
        <button
          onClick={() => refetch()}
          className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <RefreshCw className="h-4 w-4" />
          重试
        </button>
      </div>
    )
  }

  const memories = data?.memories || []

  const filteredMemories = memories.filter((m) =>
    m.content?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">内存管理</h2>

      {/* Clear confirmation modal */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-destructive/50 bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <h3 className="font-semibold text-lg">确认清空记忆</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {confirmClear === 'memory' && '确定清空所有普通记忆？此操作不可恢复。'}
              {confirmClear === 'user' && '确定清空所有用户档案？此操作不可恢复。'}
              {confirmClear === 'both' && '确定清空所有记忆和用户档案？此操作不可恢复。'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClear(null)}
                className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={() => clearMutation.mutate(confirmClear)}
                disabled={clearMutation.isPending}
                className="flex-1 rounded bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {clearMutation.isPending ? '清空中...' : '确认清空'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">记忆片段</p>
          <p className="text-2xl font-bold">{memories.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">记忆字符限制</p>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${stats?.memory?.percentage ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.memory?.used ?? 0} / {stats?.memory?.limit ?? 2200} ({stats?.memory?.percentage ?? 0}% 已用)
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">用户字符限制</p>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-secondary"
              style={{ width: `${stats?.user?.percentage ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.user?.used ?? 0} / {stats?.user?.limit ?? 1375} ({stats?.user?.percentage ?? 0}% 已用)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索记忆..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm"
          />
        </div>
        <button
          onClick={() => rebuildMutation.mutate()}
          disabled={rebuildMutation.isPending}
          className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${rebuildMutation.isPending ? 'animate-spin' : ''}`} />
          重建索引
        </button>
        <button
          onClick={() => setConfirmClear('both')}
          className="flex items-center gap-2 rounded border border-destructive/50 px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          清空全部
        </button>
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-4 border-b border-border bg-muted/50 p-4">
          <User className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">用户档案</p>
            <p className="text-sm text-muted-foreground">基于对话历史自动生成</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filteredMemories.length} 条记忆</span>
            {rebuildMutation.isSuccess && (
              <span className="text-green-500">重建成功</span>
            )}
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {filteredMemories.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">暂无记忆数据</p>
              <p className="mt-1 text-sm text-muted-foreground">
                与 Agent 对话后，记忆将自动保存到这里
              </p>
            </div>
          ) : (
            filteredMemories.map((memory) => (
              <div
                key={memory.id}
                className="group relative border-b border-border p-4 last:border-0 hover:bg-muted/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm">{memory.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {memory.created_at}
                      {memory.session_id && ` · 会话 ${memory.session_id.slice(0, 8)}...`}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {memory.type === 'user' ? '用户档案' : '记忆'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    disabled={deleteMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-opacity"
                  >
                    <Trash className="h-3 w-3" />
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
