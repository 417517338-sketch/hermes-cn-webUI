/**
 * 子 Agent 委派页面
 * @description 宪法 3.2.14 子 Agent 委派 (/delegation)
 * - 所有 3 个子代理始终可用，可自由创建/删除/配置
 * - 任务分发、结果汇总始终可操作
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { Bot, Play, Plus, Trash2, ChevronDown, ChevronUp, X, AlertTriangle, Settings2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface SubAgent {
  id: string
  name: string
  status: 'idle' | 'running' | 'done' | 'error'
  model?: string
  provider?: string
  task?: string
  result?: string
  toolsets?: string[]
  error?: string
  started_at?: string
  finished_at?: string
  // Slot type: active or placeholder
  isPlaceholder?: boolean
}

interface DelegationResult {
  id: string
  agent_id: string
  status: 'running' | 'done' | 'error'
  result?: string
  error?: string
}

async function createDelegationTask(task: {
  goal: string
  context?: string
  model?: string
  provider?: string
  toolsets?: string[]
}): Promise<{ id: string; status: string; error?: string }> {
  return api.createDelegation(task)
}

interface DelegationTask {
  id: string
  goal: string
  context?: string
  model?: string
  provider?: string
  toolsets?: string[]
  status: 'running' | 'done' | 'error' | 'cancelled'
  created_at: string
  finished_at?: string
  result?: string
  error?: string
}

async function fetchDelegationTasks(): Promise<DelegationTask[]> {
  const res = await fetch('/api/delegation')
  if (!res.ok) throw new Error('Failed to fetch delegation tasks')
  const data = await res.json()
  return data.tasks || []
}

// Agent Settings Modal
interface AgentSettingsModalProps {
  agent: SubAgent
  form: Partial<SubAgent>
  onChange: (form: Partial<SubAgent>) => void
  onSave: () => void
  onClose: () => void
  /** 来自 /api/models 的全部已配置模型 */
  allModels?: Array<{
    id: string
    name: string
    provider: string
    provider_name: string
  }>
}

export function Delegation() {
  const queryClient = useQueryClient()

  const { data: backendTasks = [] } = useQuery<DelegationTask[]>({
    queryKey: ['delegation-tasks'],
    queryFn: fetchDelegationTasks,
    refetchInterval: 3000,  // poll for running task updates
  })

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.getModels(),
  })

  const [subAgents, setSubAgents] = useState<SubAgent[]>([
    {
      id: '1',
      name: '子 Agent 1',
      status: 'idle',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      toolsets: ['terminal', 'file', 'web'],
      isPlaceholder: false,
    },
    {
      id: '2',
      name: '子 Agent 2',
      status: 'idle',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      toolsets: ['terminal', 'file', 'web'],
      isPlaceholder: false,
    },
    {
      id: '3',
      name: '子 Agent 3',
      status: 'idle',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      toolsets: ['terminal', 'file', 'web'],
      isPlaceholder: false,
    },
  ])

  // Sync backend tasks → subAgent slots.
  // Takes the top 3 most-recent tasks from backend and maps them to slots 1-3.
  useEffect(() => {
    if (backendTasks.length === 0) return

    setSubAgents((prev) => {
      const next = [...prev]

      // Map top-3 recent tasks to slots 0,1,2
      const slotTasks = backendTasks.slice(0, 3)

      slotTasks.forEach((btask, idx) => {
        if (idx >= next.length) return
        const slot = next[idx]

        // Only update if meaningful fields differ (avoids overwriting user settings mid-edit)
        const fieldsChanged =
          slot.status !== btask.status ||
          slot.result !== btask.result ||
          slot.error !== btask.error ||
          slot.task !== btask.goal ||
          slot.started_at !== btask.created_at ||
          slot.finished_at !== btask.finished_at

        if (fieldsChanged) {
          next[idx] = {
            ...slot,
            status: btask.status as SubAgent['status'],
            task: btask.goal,
            result: btask.result,
            error: btask.error || undefined,
            started_at: btask.created_at,
            finished_at: btask.finished_at,
          }
        }
      })

      return next
    })
  }, [backendTasks])

  const [task, setTask] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState<Partial<SubAgent>>({})

  const MAX_AGENTS = 3

  const updatePlaceholderStatus = useCallback(() => {
    setSubAgents((prev) =>
      prev.map((agent) => ({ ...agent, isPlaceholder: false }))
    )
  }, [])

  // Sync placeholder status when backend tasks change
  if (subAgents.some((a) => a.isPlaceholder)) {
    updatePlaceholderStatus()
  }

  const createMutation = useMutation({
    mutationFn: createDelegationTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delegation-tasks'] }),
  })

  const addAgent = useCallback(() => {
    if (subAgents.length >= MAX_AGENTS) return
    setSubAgents((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: `子 Agent ${prev.length + 1}`,
        status: 'idle',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        toolsets: ['terminal', 'file', 'web'],
        isPlaceholder: false,
      },
    ])
  }, [subAgents.length])

  const removeAgent = useCallback((id: string) => {
    setSubAgents((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const updateAgent = useCallback((id: string, updates: Partial<SubAgent>) => {
    setSubAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  const openSettings = useCallback((agent: SubAgent) => {
    if (agent.isPlaceholder) {
      // Placeholder card: initialize as formal sub-agent and open settings
      const newAgent: SubAgent = {
        ...agent,
        isPlaceholder: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        toolsets: ['terminal', 'file', 'web'],
        status: 'idle',
      }
      setSubAgents((prev) => prev.map((a) => (a.id === agent.id ? newAgent : a)))
      setSettingsForm({
        provider: newAgent.provider || 'anthropic',
        model: newAgent.model || 'claude-sonnet-4',
        toolsets: newAgent.toolsets || [],
      })
      setShowSettings(agent.id)
      return
    }
    setSettingsForm({
      provider: agent.provider || 'anthropic',
      model: agent.model || 'claude-sonnet-4',
      toolsets: agent.toolsets || [],
    })
    setShowSettings(agent.id)
  }, [])

  const saveSettings = useCallback((agentId: string) => {
    updateAgent(agentId, settingsForm)
    setShowSettings(null)
    setSettingsForm({})
  }, [settingsForm, updateAgent])

  const runTasks = useCallback(async () => {
    if (!task.trim()) return

    // Get only non-placeholder agents
    const activeAgents = subAgents.filter((a) => !a.isPlaceholder)
    if (activeAgents.length === 0) return

    // Mark all active sub-agents as running
    setSubAgents((agents) =>
      agents.map((a) => {
        if (a.isPlaceholder) return a
        return {
          ...a,
          status: 'running' as const,
          task,
          started_at: new Date().toISOString(),
          result: undefined,
          error: undefined,
        }
      })
    )

    // Execute tasks in parallel only for active (non-placeholder) agents
    const taskPromises = activeAgents.map(async (agent) => {
      try {
        const result = await createMutation.mutateAsync({
          goal: task,
          context: `Task assigned to ${agent.name}`,
          model: agent.model,
          provider: agent.provider,
          toolsets: agent.toolsets,
        })

        setSubAgents((agents) =>
          agents.map((a) =>
            a.id === agent.id
              ? {
                  ...a,
                  status: 'done' as const,
                  finished_at: new Date().toISOString(),
                }
              : a
          )
        )
      } catch (error) {
        setSubAgents((agents) =>
          agents.map((a) =>
            a.id === agent.id
              ? {
                  ...a,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : '未知错误',
                  finished_at: new Date().toISOString(),
                }
              : a
          )
        )
      }
    })

    await Promise.allSettled(taskPromises)
  }, [task, subAgents, createMutation])

  const stopTask = useCallback((agentId: string) => {
    setSubAgents((agents) =>
      agents.map((a) =>
        a.id === agentId
          ? { ...a, status: 'idle' as const, task: undefined, started_at: undefined }
          : a
      )
    )
  }, [])

  const isAnyRunning = subAgents.some((a) => a.status === 'running')
  const activeAgents = subAgents.filter((a) => !a.isPlaceholder)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">子 Agent 委派</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeAgents.length} 个子代理可用
          </p>
        </div>
      </div>

      {/* Task Input */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-medium">任务描述</h3>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="输入要分配给子代理的任务描述..."
          className="w-full rounded border border-input bg-background p-3 text-sm"
          rows={4}
          disabled={isAnyRunning}
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span>将分配给 {activeAgents.length} 个活跃子代理</span>
          </div>
          <button
            onClick={runTasks}
            disabled={!task.trim() || activeAgents.length === 0 || isAnyRunning}
            className="flex items-center gap-2 rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {isAnyRunning ? '执行中...' : '分配任务'}
          </button>
        </div>
      </div>

      {/* Sub Agents Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {subAgents.map((agent) => (
          <div
            key={agent.id}
            className={`rounded-lg border bg-card p-4 transition-colors ${
              agent.isPlaceholder
                ? 'border-dashed border-muted-foreground/30 opacity-60'
                : agent.status === 'running'
                ? 'border-primary'
                : agent.status === 'error'
                ? 'border-destructive/50'
                : 'border-border'
            }`}
          >
            {/* Active Agent Card */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot
                      className={`h-5 w-5 ${
                        agent.status === 'running' ? 'text-primary animate-pulse' : 'text-muted-foreground'
                      }`}
                    />
                    <span className="font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        agent.status === 'running'
                          ? 'bg-blue-500/20 text-blue-500'
                          : agent.status === 'done'
                          ? 'bg-green-500/20 text-green-500'
                          : agent.status === 'error'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {agent.status === 'running'
                        ? '运行中'
                        : agent.status === 'done'
                        ? '已完成'
                        : agent.status === 'error'
                        ? '错误'
                        : '空闲'}
                    </span>
                  </div>
                </div>

                {/* Agent Info */}
                {agent.provider && agent.model && (
                  <div className="mb-2 text-xs text-muted-foreground">
                    {agent.provider} / {agent.model}
                  </div>
                )}
                {agent.toolsets && agent.toolsets.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {agent.toolsets.map((ts) => (
                      <span key={ts} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {ts}
                      </span>
                    ))}
                  </div>
                )}

                {/* Task */}
                {agent.task && (
                  <div className="mb-2 rounded bg-muted p-2 text-xs">
                    <p className="text-muted-foreground">任务：</p>
                    <p className="mt-1 line-clamp-2">{agent.task}</p>
                  </div>
                )}

                {/* Error */}
                {agent.error && (
                  <div className="mb-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {agent.error}
                    </div>
                  </div>
                )}

                {/* Timing */}
                {agent.started_at && (
                  <div className="mb-2 text-xs text-muted-foreground">
                    {agent.status === 'running' ? '开始于' : '耗时'}：
                    {new Date(agent.started_at).toLocaleTimeString('zh-CN')}
                    {agent.finished_at && agent.status === 'done' && (
                      <span>
                        {' → '}
                        {new Date(agent.finished_at).toLocaleTimeString('zh-CN')}
                      </span>
                    )}
                  </div>
                )}

                {/* Result Toggle */}
                {agent.result && (
                  <button
                    onClick={() => setExpanded(expanded === agent.id ? null : agent.id)}
                    className="flex w-full items-center justify-between rounded bg-muted p-2 text-xs"
                  >
                    <span>查看结果</span>
                    {expanded === agent.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}

                {/* Expanded Result */}
                {expanded === agent.id && agent.result && (
                  <div className="mt-2 max-h-48 overflow-auto rounded border border-border p-2 text-xs">
                    <pre className="whitespace-pre-wrap">{agent.result}</pre>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={() => openSettings(agent)}
                    disabled={agent.status === 'running'}
                    className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
                    title="设置"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {agent.status === 'running' ? (
                      <button
                        onClick={() => stopTask(agent.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                        title="停止"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : subAgents.filter((a) => !a.isPlaceholder).length > 1 ? (
                      <button
                        onClick={() => removeAgent(agent.id)}
                        disabled={subAgents.filter((a) => !a.isPlaceholder).length <= 1}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
                        title="移除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Settings Modal */}
                {showSettings === agent.id && (
                  <AgentSettingsModal
                    agent={agent}
                    form={settingsForm}
                    onChange={setSettingsForm}
                    onSave={() => saveSettings(agent.id)}
                    onClose={() => {
                      setShowSettings(null)
                      setSettingsForm({})
                    }}
                    allModels={modelsData?.all_models}
                  />
                )}
          </div>
        ))}
      </div>

      {/* 新建子代理按钮 */}
      {subAgents.filter((a) => !a.isPlaceholder).length < MAX_AGENTS && (
        <button
          onClick={addAgent}
          disabled={subAgents.filter((a) => !a.isPlaceholder).length >= MAX_AGENTS}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
          新建子代理
          <span className="text-xs text-muted-foreground">
            ({subAgents.filter((a) => !a.isPlaceholder).length}/{MAX_AGENTS})
          </span>
        </button>
      )}

      {/* 结果汇总 - 始终可见 */}
      {activeAgents.length > 0 && activeAgents.some((a) => a.result || a.error) && (
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setExpanded(expanded === 'summary' ? null : 'summary')}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded === 'summary' ? 'rotate-180' : ''}`}
              />
              <span className="font-medium">结果汇总</span>
              <span className="text-xs text-muted-foreground">
                ({activeAgents.filter((a) => a.result || a.error).length} 个子代理有结果)
              </span>
            </div>
          </button>
          {expanded === 'summary' && (
            <div className="border-t border-border p-4">
              <div className="space-y-3">
                {activeAgents.map((agent) => (
                  <div key={agent.id} className="rounded bg-muted/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <span
                        className={`text-xs ${
                          agent.status === 'done'
                            ? 'text-green-500'
                            : agent.status === 'error'
                            ? 'text-red-500'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {agent.status === 'done' ? '已完成' : agent.status === 'error' ? '错误' : agent.status}
                      </span>
                    </div>
                    {agent.error && <p className="text-xs text-destructive">{agent.error}</p>}
                    {agent.result && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{agent.result}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentSettingsModal({ agent, form, onChange, onSave, onClose, allModels }: AgentSettingsModalProps) {
  // 从 allModels 动态构建 provider 列表（去重）和 model 映射
  const providerMap = useMemo(() => {
    const map = new Map<string, { provider_name: string; models: Array<{ id: string; name: string }> }>()
    if (!allModels) return map
    for (const m of allModels) {
      if (!map.has(m.provider)) {
        map.set(m.provider, { provider_name: m.provider_name, models: [] })
      }
      map.get(m.provider)!.models.push({ id: m.id, name: m.name })
    }
    return map
  }, [allModels])

  const providers = Array.from(providerMap.entries()).map(([value, info]) => {
    return {
      value,
      label: info.provider_name || value,
    }
  })

  const currentModels = providerMap.get(form.provider || '')?.models || []

  const toolsets = [
    { value: 'terminal', label: '终端' },
    { value: 'file', label: '文件' },
    { value: 'web', label: '网页搜索' },
    { value: 'browser', label: '浏览器' },
    { value: 'skills', label: '技能' },
    { value: 'cronjob', label: '定时任务' },
  ]

  const toggleToolset = (toolset: string) => {
    const current = form.toolsets || []
    if (current.includes(toolset)) {
      onChange({ ...form, toolsets: current.filter((t) => t !== toolset) })
    } else {
      onChange({ ...form, toolsets: [...current, toolset] })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{agent.name} 设置</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Provider */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">提供商</label>
            <select
              value={form.provider || 'anthropic'}
              onChange={(e) => onChange({ ...form, provider: e.target.value, model: undefined })}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            >
              {providers.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">模型</label>
            <select
              value={form.model || ''}
              onChange={(e) => onChange({ ...form, model: e.target.value })}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择模型</option>
              {currentModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Toolsets */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">工具集</label>
            <div className="flex flex-wrap gap-2">
              {toolsets.map((ts) => {
                const selected = (form.toolsets || []).includes(ts.value)
                return (
                  <button
                    key={ts.value}
                    onClick={() => toggleToolset(ts.value)}
                    className={`rounded px-3 py-1 text-sm ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border hover:bg-accent'
                    }`}
                  >
                    {ts.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={onSave}
              className="flex-1 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
