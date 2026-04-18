/**
 * 定时任务页面
 * @description 宪法 2.2.6 定时任务 (/cron)
 * - 始终可见：任务列表、执行历史、自然语言转换预览
 * - 始终可操作：自然语言转换（预览结果）
 * - 仅激活后可操作：创建/编辑/删除任务
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Play, Pause, X, Clock, AlertTriangle, RefreshCw, Lock, Eye, Sparkles } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'

interface CronJob {
  id: string
  name: string
  prompt: string
  schedule: { kind: string; expr: string; display: string }
  schedule_display: string
  next_run_at: string | null
  last_run_at: string | null
  error?: string
  repeat?: number
  deliver?: string
  skills?: string[]
  model?: {
    provider: string
    model: string
  }
  created_at: string
  /** 'idle' | 'running' | 'error' */
  state: 'idle' | 'running' | 'error'
  last_error?: string | null
  enabled: boolean
  // Execution history
  executions?: Execution[]
}

interface Execution {
  id: string
  job_id: string
  started_at: string
  finished_at?: string
  status: 'success' | 'error' | 'running'
  log_summary?: string
  error?: string
}

interface JobFormData {
  name: string
  prompt: string
  schedule: string
  repeat: number
  deliver: string
  skills: string[]
  model_provider: string
  model_name: string
}

const CRON_HELPERS = [
  { label: '每小时', value: '0 * * * *' },
  { label: '每天午夜', value: '0 0 * * *' },
  { label: '每天早上8点', value: '0 8 * * *' },
  { label: '每周一', value: '0 0 * * 1' },
  { label: '每月1号', value: '0 0 1 * *' },
  { label: '每5分钟', value: '*/5 * * * *' },
  { label: '每30分钟', value: '*/30 * * * *' },
]

async function fetchCronJobs(): Promise<{ jobs: CronJob[] }> {
  const res = await fetch('/api/cron')
  if (!res.ok) throw new Error('Failed to fetch cron jobs')
  return res.json()
}

async function fetchExecutions(jobId: string): Promise<{ executions: Execution[] }> {
  const res = await fetch(`/api/cron/${jobId}/executions`)
  if (!res.ok) throw new Error('Failed to fetch executions')
  return res.json()
}

interface SubmitJobData {
  name: string
  prompt: string
  schedule: string
  repeat?: number
  deliver?: string
  skills?: string[]
  model?: { provider: string; model: string }
}

interface JobModalProps {
  job: CronJob | null
  defaultCron: string
  isReadOnly?: boolean
  onClose: () => void
  onSubmit: (_: SubmitJobData) => void
  isLoading: boolean
}

function JobModal({ job, defaultCron, isReadOnly, onClose, onSubmit, isLoading }: JobModalProps) {
  const [formData, setFormData] = useState<JobFormData>({
    name: job?.name || '',
    prompt: job?.prompt || '',
    schedule: job?.schedule.expr || defaultCron || '',
    repeat: job?.repeat || 0,
    deliver: job?.deliver || 'local',
    skills: job?.skills || [],
    model_provider: job?.model?.provider || 'anthropic',
    model_name: job?.model?.model || '',
  })

  useEffect(() => {
    if (defaultCron && !job) {
      setFormData((prev) => ({ ...prev, schedule: defaultCron }))
    }
  }, [defaultCron, job])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name: formData.name,
      prompt: formData.prompt,
      schedule: formData.schedule,
      repeat: formData.repeat || undefined,
      deliver: formData.deliver || undefined,
      skills: formData.skills.length > 0 ? formData.skills : undefined,
      model:
        formData.model_provider && formData.model_name
          ? { provider: formData.model_provider, model: formData.model_name }
          : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">
              {isReadOnly ? '任务详情' : job ? '编辑任务' : '创建任务'}
            </h3>
            {isReadOnly && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                只读
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">任务名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              placeholder="输入任务名称"
              required
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">任务描述</label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              disabled={isReadOnly}
              className="w-full min-h-[100px] resize-none rounded border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              placeholder="描述任务要做什么..."
              required
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">执行周期 (Cron)</label>
            <input
              type="text"
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono disabled:opacity-50"
              placeholder="* * * * *"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              格式：分 时 日 月 周（例如：0 8 * * * 表示每天早上8点）
            </p>
          </div>

          {/* Repeat */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">重复次数</label>
            <input
              type="number"
              value={formData.repeat}
              onChange={(e) => setFormData({ ...formData, repeat: parseInt(e.target.value) || 0 })}
              disabled={isReadOnly}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              placeholder="0 表示无限重复"
              min="0"
            />
          </div>

          {/* Deliver */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">结果发送方式</label>
            <select
              value={formData.deliver}
              onChange={(e) => setFormData({ ...formData, deliver: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="local">本地保存</option>
              <option value="origin">返回当前对话</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
          </div>

          {/* Actions */}
          {!isReadOnly && (
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
                {job ? '保存' : '创建'}
              </button>
            </div>
          )}
          {isReadOnly && (
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                关闭
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export function Cron() {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cron'],
    queryFn: fetchCronJobs,
  })

  // isActivated: 临时写死为 true，后续接入 license 查询后改为动态判断
  const isActivated = true

  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJob | null>(null)
  const [viewingJob, setViewingJob] = useState<CronJob | null>(null)
  const [naturalLanguage, setNaturalLanguage] = useState('')
  const [convertedCron, setConvertedCron] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [executions, setExecutions] = useState<Record<string, Execution[]>>({})

  const createMutation = useMutation({
    mutationFn: async (job: unknown) => {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to create job')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron'] })
      setShowModal(false)
      setEditingJob(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...job }: { id: string } & SubmitJobData) => {
      const res = await fetch(`/api/cron/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      })
      if (!res.ok) throw new Error('Failed to update job')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron'] })
      setShowModal(false)
      setEditingJob(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cron/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete job')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron'] })
      setDeleteConfirm(null)
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cron/${id}/pause`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to pause job')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron'] }),
  })

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cron/${id}/resume`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to resume job')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron'] }),
  })

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cron/${id}/run`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to run job')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron'] }),
  })

  const convertMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch('/api/cron/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.schedule?.expr) {
        setConvertedCron(data.schedule.expr)
      }
    },
  })

  // Load executions when expanding history
  const loadExecutions = useCallback(async (jobId: string) => {
    if (!executions[jobId]) {
      try {
        const data = await fetchExecutions(jobId)
        setExecutions((prev) => ({ ...prev, [jobId]: data.executions }))
      } catch {
        setExecutions((prev) => ({ ...prev, [jobId]: [] }))
      }
    }
    setExpandedHistory(expandedHistory === jobId ? null : jobId)
  }, [executions, expandedHistory])

  const handleEdit = useCallback((job: CronJob) => {
    setEditingJob(job)
    setViewingJob(null)
    setShowModal(true)
  }, [])

  const handleView = useCallback((job: CronJob) => {
    setViewingJob(job)
    setEditingJob(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setDeleteConfirm(id)
  }, [])

  const confirmDelete = useCallback(() => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm)
    }
  }, [deleteConfirm, deleteMutation])

  const handleConvert = useCallback(() => {
    if (naturalLanguage) {
      convertMutation.mutate(naturalLanguage)
    }
  }, [naturalLanguage, convertMutation])

  const handleCreateFromConversion = useCallback(() => {
    setEditingJob(null)
    setViewingJob(null)
    setShowModal(true)
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">获取定时任务失败</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          无法连接到服务器，请检查服务状态。
        </p>
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

  const jobs: CronJob[] = data?.jobs || []

  return (
    <div className="space-y-6">
      {/* Read-only Detail Modal */}
      {viewingJob && (
        <JobModal
          job={viewingJob}
          defaultCron=""
          isReadOnly={true}
          onClose={() => setViewingJob(null)}
          onSubmit={() => {}}
          isLoading={false}
        />
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <JobModal
          job={editingJob}
          defaultCron={convertedCron}
          onClose={() => {
            setShowModal(false)
            setEditingJob(null)
            setConvertedCron('')
          }}
          onSubmit={(data) => {
            if (editingJob) {
              updateMutation.mutate({ id: editingJob.id, ...data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除这个定时任务吗？此操作无法撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">定时任务</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            可管理全部任务
          </p>
        </div>
        <button
          onClick={() => {
            setEditingJob(null)
            setViewingJob(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          title="创建新任务"
        >
          <Plus className="h-4 w-4" />
          创建任务
        </button>
      </div>

      {/* 自然语言转 Cron - 始终可见 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">自然语言转 Cron</h3>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            始终可用
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="例如：每天早上 8 点，每周一上午 10 点..."
            value={naturalLanguage}
            onChange={(e) => setNaturalLanguage(e.target.value)}
            className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={handleConvert}
            disabled={!naturalLanguage || convertMutation.isPending}
            className="rounded bg-secondary px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {convertMutation.isPending ? '转换中...' : '转换'}
          </button>
        </div>
        {convertedCron && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Cron 表达式：</span>
            <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
              {convertedCron}
            </code>
            <button
              onClick={handleCreateFromConversion}
              disabled={!isActivated}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isActivated ? '激活后使用此表达式创建任务' : '使用此表达式创建任务'}
            >
              <Sparkles className="h-3 w-3" />
              使用此表达式
              {!isActivated && <Lock className="h-3 w-3" />}
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {CRON_HELPERS.map((helper) => (
            <button
              key={helper.value}
              onClick={() => setConvertedCron(helper.value)}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              {helper.label}
            </button>
          ))}
        </div>
      </div>

      {/* 免费版提示 */}
      {!isActivated && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-amber-500 mb-2">
            <Lock className="h-5 w-5" />
            <span className="font-medium">创建/编辑功能已锁定</span>
          </div>
          <p className="text-sm text-muted-foreground">
            免费版用户可查看所有定时任务和执行历史，但创建、编辑、删除等修改操作需要激活专业版。
          </p>
        </div>
      )}

      {/* Jobs List - 始终可见 */}
      {jobs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="mt-4 font-medium">暂无定时任务</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            创建一个定时任务来自动化您的工作流程
          </p>
          <button
            onClick={() => {
              if (!isActivated) return
              setShowModal(true)
            }}
            disabled={!isActivated}
            className="mt-4 flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            创建任务
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Job Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{job.name}</p>
                    <span
                      className={`rounded px-2 py-0.5 text-xs shrink-0 ${
                        job.state === 'running'
                          ? 'bg-green-500/20 text-green-500'
                          : !job.enabled
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : job.state === 'error'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-blue-500/20 text-blue-500'
                      }`}
                    >
                      {job.state === 'running'
                        ? '运行中'
                        : !job.enabled
                        ? '已暂停'
                        : job.state === 'error'
                        ? '错误'
                        : '空闲'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{job.schedule.expr}</span>
                    {job.next_run_at && (
                      <span>下次: {new Date(job.next_run_at).toLocaleString('zh-CN')}</span>
                    )}
                  </div>
                  {job.state === 'error' && job.last_error && (
                    <p className="mt-1 text-xs text-destructive truncate">{job.last_error}</p>
                  )}
                </div>

                {/* Actions - 仅激活后可操作 */}
                <div className="flex items-center gap-1 ml-4">
                  {isActivated && (
                    <>
                      {job.enabled ? (
                        <button
                          onClick={() => pauseMutation.mutate(job.id)}
                          disabled={job.state === 'running'}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-yellow-500 disabled:opacity-50"
                          title={job.state === 'running' ? '运行中' : '暂停'}
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => resumeMutation.mutate(job.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-green-500"
                          title="恢复"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => runMutation.mutate(job.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary"
                        title="立即运行"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(job)}
                        disabled={!isActivated}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
                        title={isActivated ? '编辑' : '激活后解锁编辑'}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={!isActivated}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                        title={isActivated ? '删除' : '激活后解锁删除'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {/* View button - always visible for free tier */}
                  <button
                    onClick={() => handleView(job)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                    title="查看详情"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 执行历史 - 始终可见 */}
              <div className="border-t border-border">
                <button
                  onClick={() => loadExecutions(job.id)}
                  className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50"
                >
                  <span>执行历史</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {expandedHistory === job.id ? '收起' : '展开'}
                  </div>
                </button>
                {expandedHistory === job.id && (
                  <div className="px-4 pb-4">
                    {executions[job.id] && executions[job.id].length > 0 ? (
                      <div className="space-y-2">
                        {executions[job.id].map((exec) => (
                          <div
                            key={exec.id}
                            className="flex items-center justify-between rounded bg-muted/50 p-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  exec.status === 'success'
                                    ? 'bg-green-500'
                                    : exec.status === 'error'
                                    ? 'bg-red-500'
                                    : 'bg-blue-500 animate-pulse'
                                }`}
                              />
                              <span className="text-muted-foreground">
                                {new Date(exec.started_at).toLocaleString('zh-CN')}
                              </span>
                            </div>
                            <span
                              className={
                                exec.status === 'success'
                                  ? 'text-green-500'
                                  : exec.status === 'error'
                                  ? 'text-red-500'
                                  : 'text-blue-500'
                              }
                            >
                              {exec.status === 'success'
                                ? '成功'
                                : exec.status === 'error'
                                ? '失败'
                                : '运行中'}
                            </span>
                            {exec.log_summary && (
                              <span className="text-muted-foreground truncate max-w-[200px]">
                                {exec.log_summary}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        暂无执行记录
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
