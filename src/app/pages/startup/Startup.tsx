/**
 * 系统维护页面
 * @description 宪法 3.2.16 系统维护 (/startup)
 * - 启动后端
 * - 配置急救
 * - 检查更新
 *
 * 注意：页面立即渲染，不依赖后端 API。
 */
import { useState, useEffect, useCallback } from 'react'
import { Play, RefreshCw, CheckCircle2, XCircle, Loader2, Wrench, Download, AlertTriangle, Check, Info } from 'lucide-react'
import { api } from '@/lib/api'

type Tab = 'startup' | 'config' | 'update'

interface GatewayStatus {
  running: boolean
  pid: number | null
  state: string
  exit_reason: string | null
  updated_at: string | null
}

// ─── Tab 1: Startup ───────────────────────────────────────────────────────────

function StartupTab() {
  const [status, setStatus] = useState<GatewayStatus>({
    running: false,
    pid: null,
    state: 'unknown',
    exit_reason: null,
    updated_at: null,
  })
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [startPending, setStartPending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getStartupStatus()
      setStatus({
        running: data.running,
        pid: data.pid,
        state: data.state,
        exit_reason: data.exit_reason,
        updated_at: data.updated_at,
      })
      setLoadState('loaded')
      setErrorMsg(null)
    } catch {
      setLoadState('error')
      setErrorMsg('无法连接到 WebUI 后端')
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  useEffect(() => {
    if (loadState !== 'loaded') return
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [loadState, fetchStatus])

  const handleStart = async () => {
    setStartPending(true)
    setErrorMsg(null)
    try {
      await api.startGateway()
      await fetchStatus()
    } catch (err) {
      setErrorMsg(`启动失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setStartPending(false)
    }
  }

  const isRunning = status.running
  const pid = status.pid
  const isLoading = startPending

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        ) : (
          <XCircle className="h-6 w-6 text-muted-foreground" />
        )}
        <h3 className="text-lg font-semibold">
          {isRunning ? '运行中' : '已停止'}
        </h3>
        {loadState === 'loading' && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
        {loadState === 'error' && <span className="ml-2 text-xs text-muted-foreground">(状态未知)</span>}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">状态</span>
            <span className={`font-medium ${isRunning ? 'text-green-500' : 'text-muted-foreground'}`}>{status.state}</span>
          </div>
          {pid && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">进程 PID</span>
              <span className="font-mono">{pid}</span>
            </div>
          )}
          {status.exit_reason && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">退出原因</span>
              <span className="font-medium text-destructive">{status.exit_reason}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleStart} disabled={isRunning || isLoading}
          className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium ${isRunning || isLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
          {startPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}启动后端
        </button>

        <button onClick={fetchStatus} disabled={isLoading}
          className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loadState === 'loading' ? 'animate-spin' : ''}`} />刷新状态
        </button>
      </div>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
    </div>
  )
}

// ─── Tab 2: Config ────────────────────────────────────────────────────────────

function ConfigTab() {
  const [checkResult, setCheckResult] = useState<{ success: boolean; output: string; hasIssues: boolean } | null>(null)
  const [checkPending, setCheckPending] = useState(false)
  const [migratePending, setMigratePending] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{ success: boolean; output: string } | null>(null)
  const [fixPending, setFixPending] = useState(false)
  const [fixResult, setFixResult] = useState<{ success: boolean; fixed: boolean; message: string; backupPath: string | null; checkOutput: string } | null>(null)

  const handleCheck = async () => {
    setCheckPending(true)
    setCheckResult(null)
    setMigrateResult(null)
    setFixResult(null)
    try {
      const data = await api.configCheck()
      setCheckResult(data)
    } catch (err) {
      setCheckResult({ success: false, output: `检查失败: ${err instanceof Error ? err.message : '未知错误'}`, hasIssues: true })
    } finally {
      setCheckPending(false)
    }
  }

  const handleMigrate = async () => {
    setMigratePending(true)
    setMigrateResult(null)
    setFixResult(null)
    try {
      const data = await api.configMigrate()
      setMigrateResult(data)
    } catch (err) {
      setMigrateResult({ success: false, output: `迁移失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      setMigratePending(false)
    }
  }

  const handleFix = async () => {
    setFixPending(true)
    setFixResult(null)
    try {
      const data = await api.configFix()
      setFixResult(data)
    } catch (err) {
      setFixResult({ success: false, fixed: false, message: `修复失败: ${err instanceof Error ? err.message : '未知错误'}`, backupPath: null, checkOutput: '' })
    } finally {
      setFixPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button onClick={handleCheck} disabled={checkPending}
          className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {checkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}检查配置
        </button>
        <button onClick={handleMigrate} disabled={migratePending}
          className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
          {migratePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}迁移配置
        </button>
      </div>

      {checkResult && (
        <div className={`rounded-lg border p-4 ${checkResult.hasIssues ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-green-500/50 bg-green-500/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {checkResult.hasIssues ? <AlertTriangle className="h-5 w-5 text-yellow-500" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
              <span className="font-medium">{checkResult.hasIssues ? '发现问题' : '配置正常'}</span>
            </div>
            {checkResult.hasIssues && (
              <button onClick={handleFix} disabled={fixPending}
                className="flex items-center gap-1 rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50">
                {fixPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}一键修复
              </button>
            )}
          </div>
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{checkResult.output || '无输出'}</pre>
        </div>
      )}

      {migrateResult && (
        <div className={`rounded-lg border p-4 ${migrateResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          <div className="flex items-center gap-2 mb-2">
            {migrateResult.success ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
            <span className="font-medium">{migrateResult.success ? '迁移成功' : '迁移失败'}</span>
          </div>
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{migrateResult.output || '无输出'}</pre>
        </div>
      )}

      {fixResult && (
        <div className={`rounded-lg border p-4 ${fixResult.fixed ? 'border-green-500/50 bg-green-500/10' : 'border-yellow-500/50 bg-yellow-500/10'}`}>
          <div className="flex items-center gap-2 mb-2">
            {fixResult.fixed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
            <span className="font-medium">{fixResult.fixed ? '修复成功' : '修复完成'}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{fixResult.message}</p>
          {fixResult.checkOutput && (
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground">验证结果：{fixResult.checkOutput || '无输出'}</pre>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4" />
          <span className="font-medium text-foreground">说明</span>
        </div>
        <p><strong>检查配置</strong>：扫描 config.yaml，检测缺失或过时的配置项。</p>
        <p className="mt-1"><strong>迁移配置</strong>：自动更新配置文件，添加新版本来新增的选项（不会删除现有配置）。</p>
        <p className="mt-1"><strong>一键修复</strong>：自动备份当前配置 → 执行迁移 → 验证结果。修复后原配置备份在 <code className="text-xs">~/.hermes/config.yaml.backup.{Date.now()}</code>。</p>
      </div>
    </div>
  )
}

// ─── Tab 3: Update ────────────────────────────────────────────────────────────

function UpdateTab() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
      <p className="text-lg">🚧 检查更新功能开发中</p>
      <p className="mt-2 text-sm">请通过手动拉取最新代码后重启服务</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Startup() {
  const [activeTab, setActiveTab] = useState<Tab>('startup')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'startup', label: '启动后端' },
    { id: 'config', label: '配置急救' },
    { id: 'update', label: '检查更新' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">系统维护</h2>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'startup' && <StartupTab />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'update' && <UpdateTab />}
      </div>

      {/* Footer Info */}
      {activeTab === 'startup' && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <p>WebUI 后端服务独立于 Hermes Gateway。即使 Hermes Gateway 未运行，您仍可以访问本页面进行管理。</p>
        </div>
      )}
    </div>
  )
}
