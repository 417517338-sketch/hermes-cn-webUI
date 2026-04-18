/**
 * 密钥管理页面对应 Agent 能力：~/.hermes/.env
 * @see CONSTITUTION.md 第二章 2.2.9
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, ExternalLink, CheckCircle, XCircle, Shield, Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface KeyInfo {
  id: string
  name: string
  key: string
  value: string
  masked: string
  hasKey: boolean
  valid?: boolean
  url?: string
}

interface KeysResponse {
  keys: KeyInfo[]
}

async function fetchKeys(): Promise<KeysResponse> {
  const res = await fetch('/api/keys')
  if (!res.ok) throw new Error('Failed to fetch keys')
  return res.json()
}

async function testKey(key: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/keys/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  if (!res.ok) throw new Error('Failed to test key')
  return res.json()
}

async function updateKey(keyName: string, value: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/keys', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: keyName, value }),
  })
  if (!res.ok) throw new Error('Failed to update key')
  return res.json()
}

export function Keys() {
  return <KeysContent />
}

function KeysContent() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<KeysResponse>({
    queryKey: ['keys'],
    queryFn: fetchKeys,
  })

  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const testMutation = useMutation({
    mutationFn: testKey,
    onSuccess: (result) => {
      // Could show a toast here
      console.log('Test result:', result)
    },
  })

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateKey(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      setEditingKey(null)
      setEditValue('')
    },
  })

  const toggleShow = (key: string) => {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleEdit = (keyInfo: KeyInfo) => {
    setEditingKey(keyInfo.key)
    setEditValue(keyInfo.value || '')
  }

  const handleSave = () => {
    if (editingKey) {
      saveMutation.mutate({ key: editingKey, value: editValue })
    }
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleDelete = (keyName: string) => {
    if (confirm(`确定删除 ${keyName}？`)) {
      saveMutation.mutate({ key: keyName, value: '' })
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
        <span className="text-destructive font-medium">获取密钥失败</span>
        <p className="mt-1 text-sm text-muted-foreground">无法连接到服务器，请检查服务状态。</p>
      </div>
    )
  }

  const keys: KeyInfo[] = data?.keys || []

  // Group keys by category
  const llmProviders = keys.filter(k =>
    ['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'groq', 'mistral', 'kimi', 'minimax', 'minimax_cn', 'glm', 'opencode_zen', 'opencode_go'].includes(k.id)
  )
  const searchProviders = keys.filter(k =>
    ['tavily', 'serper', 'exa', 'firecrawl'].includes(k.id)
  )
  const otherProviders = keys.filter(k =>
    !['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'groq', 'mistral', 'kimi', 'minimax', 'minimax_cn', 'glm', 'opencode_zen', 'opencode_go', 'tavily', 'serper', 'exa', 'firecrawl'].includes(k.id) && k.url
  )

  const renderKeyCard = (keyInfo: KeyInfo) => (
    <div key={keyInfo.key} className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{keyInfo.name}</h3>
          {keyInfo.hasKey && (
            <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-500">已设置</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {keyInfo.url && (
            <a
              href={keyInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              申请
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <code className="block rounded bg-muted px-3 py-2 text-sm">
          {editingKey === keyInfo.key ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="输入 API Key..."
              className="w-full bg-transparent outline-none"
              autoFocus
            />
          ) : (
            <span className="font-mono">
              {showValues[keyInfo.key] ? keyInfo.value : keyInfo.masked}
            </span>
          )}
        </code>

        <div className="flex items-center gap-2">
          {editingKey === keyInfo.key ? (
            <>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? '保存中...' : '保存'}
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => toggleShow(keyInfo.key)}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                {showValues[keyInfo.key] ? (
                  <><EyeOff className="h-3 w-3" /> 隐藏</>
                ) : (
                  <><Eye className="h-3 w-3" /> 显示</>
                )}
              </button>
              <button
                onClick={() => handleEdit(keyInfo)}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                <Plus className="h-3 w-3" /> 编辑
              </button>
              {keyInfo.hasKey && (
                <>
                  <button
                    onClick={() => testMutation.mutate(keyInfo.key)}
                    disabled={testMutation.isPending}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      '测试'
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(keyInfo.key)}
                    className="flex items-center gap-1 rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {testMutation.isSuccess && testMutation.variables === keyInfo.key && (
          <div className={`mt-2 text-xs ${testMutation.data?.success ? 'text-green-500' : 'text-yellow-500'}`}>
            {testMutation.data?.message}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">密钥管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          管理 Hermes Agent 的 API 密钥，密钥存储在 ~/.hermes/.env
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>密钥文件权限应为 0600 以保护安全</span>
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">暂无密钥配置</p>
          <p className="mt-1 text-sm text-muted-foreground">
            点击上方的"申请"按钮获取 API 密钥
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {llmProviders.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold">LLM 提供商</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {llmProviders.map(renderKeyCard)}
              </div>
            </div>
          )}

          {searchProviders.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold">搜索提供商</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {searchProviders.map(renderKeyCard)}
              </div>
            </div>
          )}

          {otherProviders.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold">其他</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {otherProviders.map(renderKeyCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
