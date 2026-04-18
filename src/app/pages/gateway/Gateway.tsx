/**
 * 消息网关页面对应 Agent 能力：多平台接入
 * @see CONSTITUTION.md 第二章 2.2.14
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Power, Play, Square, RefreshCw, Terminal, QrCode, X, Smartphone } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'

interface Platform {
  id: string
  name: string
  icon: string
  enabled: boolean
  status: 'online' | 'offline' | 'configured' | 'error'
  has_webhook: boolean
  config: Record<string, string> | null
}

interface GatewayInfo {
  platforms: Platform[]
  gateway_running: boolean
  pid: number | null
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchGateway(): Promise<GatewayInfo> {
  const res = await fetch('/api/gateway')
  if (!res.ok) throw new Error('Failed to fetch gateway')
  return res.json()
}

async function startGateway(): Promise<{ success: boolean; pid?: number; error?: string }> {
  const res = await fetch('/api/gateway/start', { method: 'POST' })
  return res.json()
}

async function stopGateway(): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/gateway/stop', { method: 'POST' })
  return res.json()
}

async function restartGateway(): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/gateway/restart', { method: 'POST' })
  return res.json()
}

async function updatePlatformConfig(
  id: string,
  enabled: boolean,
  config: Record<string, string>
): Promise<{ success: boolean; platform: Platform }> {
  const res = await fetch(`/api/gateway/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, config }),
  })
  if (!res.ok) throw new Error('Failed to update platform')
  return res.json()
}

// WeChat QR login
async function weixinQrStart(): Promise<{ success: boolean; qrcode?: string; qrcodeImg?: string; error?: string }> {
  const res = await fetch('/api/gateway/weixin/qr/start', { method: 'POST' })
  return res.json()
}

async function weixinQrStatus(): Promise<{
  success: boolean
  status: string
  credentials?: { account_id: string; token: string }
  error?: string
}> {
  const res = await fetch('/api/gateway/weixin/qr/status')
  return res.json()
}

async function weixinQrCancel(): Promise<void> {
  await fetch('/api/gateway/weixin/qr/cancel', { method: 'POST' })
}

// Feishu QR login
async function feishuQrStart(): Promise<{
  success: boolean
  qrUrl?: string
  userCode?: string
  error?: string
}> {
  const res = await fetch('/api/gateway/feishu/qr/start', { method: 'POST' })
  return res.json()
}

async function feishuQrStatus(): Promise<{
  success: boolean
  status: string
  credentials?: { app_id: string; app_secret: string }
  error?: string
}> {
  const res = await fetch('/api/gateway/feishu/qr/status')
  return res.json()
}

async function feishuQrCancel(): Promise<void> {
  await fetch('/api/gateway/feishu/qr/cancel', { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Platform registry
// ---------------------------------------------------------------------------

const PLATFORM_REGISTRY = [
  { id: 'weixin',    name: '微信',     icon: '💚', has_webhook: false, supportsQrLogin: true },
  { id: 'feishu',    name: '飞书',     icon: '📮', has_webhook: true,  supportsQrLogin: true },
  { id: 'wecom',     name: '企业微信', icon: '💼', has_webhook: true },
  { id: 'dingtalk',  name: '钉钉',     icon: '💬', has_webhook: true },
  { id: 'whatsapp',  name: 'WhatsApp',icon: '💬', has_webhook: false },
]

// ---------------------------------------------------------------------------
// QR Login Modal
// ---------------------------------------------------------------------------

type QrStatus = 'idle' | 'pending' | 'scaned' | 'confirmed' | 'expired' | 'error'

interface QrLoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  platform: 'weixin' | 'feishu'
  onSuccess: () => void
  gatewayRunning: boolean
  onRestartGateway: () => void
}

function QrLoginModal({
  open,
  onOpenChange,
  platform,
  onSuccess,
  gatewayRunning,
  onRestartGateway,
}: QrLoginModalProps) {
  const [status, setStatus] = useState<QrStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [qrcodeImg, setQrcodeImg] = useState<string | null>(null)
  const [weixinQrValue, setWeixinQrValue] = useState<string | null>(null)
  const [feishuUrl, setFeishuUrl] = useState<string | null>(null)
  const [feishuUserCode, setFeishuUserCode] = useState<string | null>(null)
  // Countdown state (seconds remaining)
  const [countdown, setCountdown] = useState<number>(0)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const countdownStartRef = useRef<number>(0)

  const platformLabel = platform === 'weixin' ? '微信' : '飞书'

  // Full clear: stop all timers and reset all state
  const clearAll = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    isFetchingRef.current = false
    setCountdown(0)
    countdownStartRef.current = 0
  }, [])

  const startCountdown = useCallback((seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownStartRef.current = Date.now()
    setCountdown(seconds)
    countdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - countdownStartRef.current) / 1000)
      const remaining = Math.max(0, seconds - elapsed)
      setCountdown(remaining)
      if (remaining === 0) {
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      }
    }, 1000)
  }, [])

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    isFetchingRef.current = false
  }, [])

  const startPolling = useCallback(() => {
    clearPoll()
    pollTimerRef.current = setInterval(async () => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true
      try {
        const fn = platform === 'weixin' ? weixinQrStatus : feishuQrStatus
        const result = await fn()
        if (result.status === 'confirmed') {
          setStatus('confirmed')
          clearPoll()
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
          // Trigger gateway restart after credentials are saved (backend already saved them)
          onRestartGateway()
          setTimeout(() => {
            onOpenChange(false)
            onSuccess()
          }, 2500)
        } else if (result.status === 'scaned') {
          setStatus('scaned')
        } else if (result.status === 'expired' || result.status === 'error') {
          setStatus(result.status === 'expired' ? 'expired' : 'error')
          setError(result.error || 'Login failed')
          clearPoll()
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
        }
      } catch {
        // ignore network errors during poll
      } finally {
        isFetchingRef.current = false
      }
    }, 1500)
  }, [platform, clearPoll, onOpenChange, onSuccess, onRestartGateway])

  const handleStart = useCallback(async () => {
    // Guard: gateway must be running for QR login
    if (!gatewayRunning) {
      setStatus('error')
      setError('Gateway 未运行，请先启动 Gateway')
      return
    }

    // Immediately clear previous QR image and state
    setQrcodeImg(null)
    setWeixinQrValue(null)
    setFeishuUrl(null)
    setFeishuUserCode(null)
    setStatus('idle')
    setError(null)

    try {
      if (platform === 'weixin') {
        const result = await weixinQrStart()
        if (!result.success) {
          setStatus('error')
          setError(result.error || '获取二维码失败')
          return
        }
        setQrcodeImg(result.qrcodeImg || null)
        setWeixinQrValue(result.qrcode || null)
        setStatus('pending')
        startCountdown(480) // WeChat QR expires in 480s
        startPolling()
      } else {
        const result = await feishuQrStart()
        if (!result.success) {
          setStatus('error')
          setError(result.error || '获取二维码失败')
          return
        }
        setFeishuUrl(result.qrUrl || null)
        setFeishuUserCode(result.userCode || null)
        setStatus('pending')
        startCountdown(600) // Feishu expires in 600s
        startPolling()
      }
    } catch (err: unknown) {
      setStatus('error')
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }, [platform, startPolling, startCountdown, gatewayRunning])

  const handleCancel = useCallback(async () => {
    clearAll()
    try {
      if (platform === 'weixin') await weixinQrCancel()
      else await feishuQrCancel()
    } catch {}
    setStatus('idle')
    setError(null)
    setQrcodeImg(null)
    setWeixinQrValue(null)
    setFeishuUrl(null)
    setFeishuUserCode(null)
    onOpenChange(false)
  }, [platform, clearAll, onOpenChange])

  // Reset everything when modal closes
  useEffect(() => {
    if (!open) {
      clearAll()
      setStatus('idle')
      setError(null)
      setQrcodeImg(null)
      setWeixinQrValue(null)
      setFeishuUrl(null)
      setFeishuUserCode(null)
    }
  }, [open, clearAll])

  useEffect(() => {
    return () => clearAll()
  }, [clearAll])

  // Countdown color
  const countdownColor = countdown > 180 ? 'text-green-500' : countdown > 60 ? 'text-yellow-500' : 'text-red-500'

  // Platform-specific scan instructions
  const scanInstructions: Record<string, { title: string; steps: string[] }> = {
    weixin: {
      title: '打开微信扫码',
      steps: ['打开微信 App', '发现 → 扫一扫', '扫描上方二维码', '在微信中确认「授权登录"'],
    },
    feishu: {
      title: '打开飞书扫码',
      steps: ['打开飞书 App', '右上角扫一扫图标', '扫描上方二维码', '在飞书中确认授权'],
    },
  }
  const instructions = scanInstructions[platform]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <QrCode className="h-5 w-5 text-primary" />
            {platformLabel} 扫码登录
          </div>
          <button
            onClick={handleCancel}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center gap-4 px-5 py-6">

          {/* ── Idle / Start screen ── */}
          {status === 'idle' && (
            <>
              {!gatewayRunning && (
                <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center">
                  <p className="text-sm text-red-500">⚠️ Gateway 未运行</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">请先启动 Gateway 再进行扫码绑定</p>
                </div>
              )}
              <p className="text-center text-sm text-muted-foreground">
                使用{platformLabel}扫描下方二维码完成授权
              </p>
              <p className="text-center text-xs text-muted-foreground">
                授权后 Hermes 将自动连接{platformLabel}
              </p>
              <button
                onClick={handleStart}
                disabled={!gatewayRunning}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Smartphone className="h-4 w-4" />
                {gatewayRunning ? '获取二维码' : 'Gateway 未运行'}
              </button>
            </>
          )}

          {/* ── Pending / Scaned (QR displayed, polling) ── */}
          {(status === 'pending' || status === 'scaned') && (
            <>
              {/* QR image / Direct link */}
              {platform === 'weixin' && qrcodeImg ? (
                <div className="space-y-3">
                  <a
                    href={qrcodeImg}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg border-2 border-green-500 bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    <div className="text-center">
                      <QrCode className="mx-auto h-16 w-16 text-green-600" />
                      <p className="mt-2 text-sm font-medium text-green-700">点击跳转到微信</p>
                    </div>
                  </a>
                  <p className="text-center text-xs text-muted-foreground">
                    或复制链接：<code className="text-xs text-blue-500 break-all">{qrcodeImg}</code>
                  </p>
                </div>
              ) : platform === 'weixin' && weixinQrValue ? (
                <WeixinQrCanvas value={weixinQrValue} />
              ) : feishuUrl ? (
                <FeishuQrCanvas url={feishuUrl} />
              ) : qrcodeImg ? (
                <img
                  src={qrcodeImg}
                  alt={`${platformLabel}二维码`}
                  className="mx-auto max-w-56 rounded-lg border"
                />
              ) : (
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30">
                  <span className="text-muted-foreground text-xs">加载中...</span>
                </div>
              )}

              {/* Countdown badge */}
              {countdown > 0 && (
                <div className={`text-xs font-mono font-bold ${countdownColor}`}>
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')} 后过期
                </div>
              )}

              {/* Scan instructions */}
              <div className="w-full rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 px-4 py-3">
                <p className="mb-2 text-center text-xs font-medium">{instructions.title}</p>
                <ol className="list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
                  {instructions.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              {/* Status text */}
              <div className="text-center">
                {status === 'pending' && (
                  <>
                    <p className="text-sm font-medium">等待扫码...</p>
                    <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                      轮询中...
                    </p>
                  </>
                )}
                {status === 'scaned' && (
                  <>
                    <p className="text-sm font-medium text-yellow-500">✅ 已扫码</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">请在{platformLabel}中点击「确认授权」</p>
                  </>
                )}
                {feishuUserCode && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    用户码：<span className="font-mono font-bold">{feishuUserCode}</span>
                  </p>
                )}
              </div>

              <div className="flex w-full gap-2">
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
                >
                  取消
                </button>
              </div>
            </>
          )}

          {/* ── Confirmed ── */}
          {status === 'confirmed' && (
            <div className="py-6 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-lg font-bold text-green-500">授权成功！</p>
              <p className="mt-1 text-sm text-muted-foreground">正在重启 Gateway 应用新配置...</p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                重启中，请稍候
              </div>
            </div>
          )}

          {/* ── Expired ── */}
          {status === 'expired' && (
            <div className="text-center">
              <p className="text-2xl">⏰</p>
              <p className="mt-2 text-sm font-medium text-yellow-500">二维码已过期</p>
              <p className="mt-1 text-xs text-muted-foreground">请点击下方按钮重新获取</p>
              <button
                onClick={handleStart}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" />
                重新获取二维码
              </button>
            </div>
          )}

          {/* ── Error ── */}
          {status === 'error' && (
            <div className="text-center">
              <p className="text-2xl">❌</p>
              <p className="mt-2 text-sm font-medium text-red-500">出错了</p>
              <p className="mt-1 text-xs text-muted-foreground">{error || '未知错误'}</p>
              <button
                onClick={handleStart}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" />
                重试
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feishu QR Canvas
// ---------------------------------------------------------------------------

function FeishuQrCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !url) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {})
  }, [url])

  return <canvas ref={canvasRef} className="mx-auto rounded-lg border" />
}

// ---------------------------------------------------------------------------
// WeChat QR Canvas — renders the raw qrcode string to a canvas
// ---------------------------------------------------------------------------

function WeixinQrCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !value) return
    QRCode.toCanvas(canvasRef.current, value, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {})
  }, [value])

  return <canvas ref={canvasRef} className="mx-auto rounded-lg border" />
}

// ---------------------------------------------------------------------------
// Main Gateway page
// ---------------------------------------------------------------------------

export function Gateway() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<GatewayInfo>({
    queryKey: ['gateway'],
    queryFn: fetchGateway,
    refetchInterval: 5000,
  })

  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [platformConfig, setPlatformConfig] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // QR login modal state
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrModalPlatform, setQrModalPlatform] = useState<'weixin' | 'feishu'>('weixin')

  const startMutation = useMutation({
    mutationFn: startGateway,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gateway'] }),
  })

  const stopMutation = useMutation({
    mutationFn: stopGateway,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gateway'] }),
  })

  const restartMutation = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gateway'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled, config }: { id: string; enabled: boolean; config: Record<string, string> }) =>
      updatePlatformConfig(id, enabled, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gateway'] }),
  })

  const handleSelectPlatform = (platformId: string) => {
    setSelectedPlatform(platformId)
    const platform = data?.platforms.find(p => p.id === platformId)
    if (platform?.config) {
      setPlatformConfig(platform.config)
    } else {
      setPlatformConfig({})
    }
  }

  const handleSaveConfig = async () => {
    if (!selectedPlatform) return
    setIsSaving(true)
    try {
      await toggleMutation.mutateAsync({
        id: selectedPlatform,
        enabled: true,
        config: platformConfig,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (platformId: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      await toggleMutation.mutateAsync({ id: platformId, enabled: false, config: {} })
    } else {
      setSelectedPlatform(platformId)
      const platform = data?.platforms.find(p => p.id === platformId)
      setPlatformConfig(platform?.config || {})
    }
  }

  const handleQrLogin = (platformId: string) => {
    setQrModalPlatform(platformId as 'weixin' | 'feishu')
    setQrModalOpen(true)
  }

  if (isLoading) return <div className="text-muted-foreground">加载中...</div>
  if (error) return <div className="text-destructive">获取网关状态失败</div>

  const platforms: Platform[] = data?.platforms || []
  const gatewayRunning = data?.gateway_running || false
  const gatewayPid = data?.pid

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">消息网关</h2>

      {/* Gateway 进程控制 */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <span className="font-medium">Gateway 进程</span>
          <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
            gatewayRunning
              ? 'bg-green-500/20 text-green-500'
              : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              gatewayRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
            }`} />
            {gatewayRunning ? '运行中' : '已停止'}
          </span>
          {gatewayPid && (
            <span className="text-xs text-muted-foreground">PID: {gatewayPid}</span>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          {!gatewayRunning ? (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="flex items-center gap-1.5 rounded bg-green-500/20 px-3 py-1.5 text-sm text-green-500 hover:bg-green-500/30 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {startMutation.isPending ? '启动中...' : '启动'}
            </button>
          ) : (
            <>
              <button
                onClick={() => restartMutation.mutate()}
                disabled={restartMutation.isPending}
                className="flex items-center gap-1.5 rounded bg-blue-500/20 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-500/30 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
                {restartMutation.isPending ? '重启中...' : '热重启'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 平台网格 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PLATFORM_REGISTRY.map((registry) => {
          const platform = platforms.find(p => p.id === registry.id)
          const status = platform?.status || 'offline'
          const enabled = platform?.enabled || false
          const supportsQr = 'supportsQrLogin' in registry && registry.supportsQrLogin

          return (
            <div
              key={registry.id}
              className={`group cursor-pointer rounded-lg border p-4 transition-all hover:border-primary ${
                selectedPlatform === registry.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              } ${enabled ? 'ring-1 ring-green-500/30' : ''}`}
              onClick={() => handleSelectPlatform(registry.id)}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{registry.icon}</span>
                  <div>
                    <span className="font-medium">{registry.name}</span>
                    {registry.has_webhook && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(Webhook)</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggle(registry.id, enabled)
                  }}
                  className={`rounded-full p-1 transition-colors ${
                    enabled
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                  title={enabled ? '禁用' : '启用'}
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    status === 'online'
                      ? 'bg-green-500'
                      : status === 'configured'
                      ? 'bg-yellow-500'
                      : status === 'error'
                      ? 'bg-red-500'
                      : 'bg-muted'
                  }`}
                />
                <span className="text-muted-foreground">
                  {status === 'online'
                    ? '在线'
                    : status === 'configured'
                    ? '已配置'
                    : status === 'error'
                    ? '错误'
                    : '离线'}
                </span>
              </div>
              {supportsQr && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleQrLogin(registry.id)
                  }}
                  className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-dashed px-2 py-1 text-xs ${
                    enabled
                      ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                      : 'border-primary/40 text-primary hover:bg-primary/5'
                  }`}
                >
                  <QrCode className="h-3 w-3" />
                  {enabled ? '重新绑定' : '扫码登录'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 平台配置面板 */}
      {selectedPlatform && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">
              {PLATFORM_REGISTRY.find(p => p.id === selectedPlatform)?.name} 配置
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${
                  platforms.find(p => p.id === selectedPlatform)?.status === 'online'
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                }`}
              />
              {platforms.find(p => p.id === selectedPlatform)?.status === 'online'
                ? '运行中'
                : '已保存（重启 Gateway 后生效）'}
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={handleSaveConfig}
              disabled={isSaving || toggleMutation.isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isSaving || toggleMutation.isPending ? '保存中...' : '保存配置'}
            </button>
            <button
              onClick={() => restartMutation.mutate()}
              disabled={!gatewayRunning || restartMutation.isPending}
              className="flex items-center gap-1.5 rounded border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
              重启 Gateway
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(PLATFORM_FIELDS[selectedPlatform] || []).map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-sm text-muted-foreground">
                  {field.label}
                </label>
                <input
                  type={field.isPassword ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={platformConfig[field.key] || ''}
                  onChange={(e) =>
                    setPlatformConfig(prev => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR 登录弹窗 */}
      <QrLoginModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        platform={qrModalPlatform}
        gatewayRunning={gatewayRunning}
        onRestartGateway={() => restartMutation.mutate()}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['gateway'] })
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform config fields
// ---------------------------------------------------------------------------

const PLATFORM_FIELDS: Record<string, { key: string; label: string; placeholder: string; isPassword?: boolean }[]> = {
  telegram: [
    { key: 'telegram_bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF...' },
    { key: 'telegram_webhook_url', label: 'Webhook URL', placeholder: 'https://your-domain.com/webhook/telegram' },
  ],
  discord: [
    { key: 'discord_bot_token', label: 'Bot Token', placeholder: 'Bot MTIz...' },
    { key: 'discord_webhook_url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...' },
  ],
  slack: [
    { key: 'slack_bot_token', label: 'Bot Token', placeholder: 'xoxb-...' },
    { key: 'slack_webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/...' },
  ],
  whatsapp: [
    { key: 'whatsapp_phone', label: 'Phone Number', placeholder: '+123****7890' },
  ],
  signal: [
    { key: 'signal_phone', label: 'Phone Number', placeholder: '+123****7890' },
  ],
  feishu: [
    { key: 'feishu_app_id', label: 'App ID', placeholder: 'cli_xxx' },
    { key: 'feishu_app_secret', label: 'App Secret', placeholder: 'xxx', isPassword: true },
  ],
  wecom: [
    { key: 'wecom_corp_id', label: '企业 ID', placeholder: 'wwxxx' },
    { key: 'wecom_agent_id', label: 'Agent ID', placeholder: '1000001' },
    { key: 'wecom_secret', label: 'Secret', placeholder: 'xxx', isPassword: true },
  ],
  dingtalk: [
    { key: 'dingtalk_client_id', label: 'Client ID', placeholder: 'dingxxx' },
    { key: 'dingtalk_client_secret', label: 'Client Secret', placeholder: 'xxx', isPassword: true },
  ],
  weixin: [
    { key: 'weixin_app_id', label: 'App ID', placeholder: 'wx...' },
    { key: 'weixin_app_secret', label: 'App Secret', placeholder: 'xxx', isPassword: true },
  ],
  email: [
    { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
    { key: 'smtp_port', label: 'SMTP Port', placeholder: '587' },
    { key: 'smtp_user', label: 'Username', placeholder: 'user@gmail.com' },
    { key: 'smtp_password', label: 'Password', placeholder: 'password', isPassword: true },
  ],
  sms: [
    { key: 'sms_provider', label: 'Provider', placeholder: 'twilio' },
    { key: 'sms_account_sid', label: 'Account SID', placeholder: 'AC...' },
    { key: 'sms_auth_token', label: 'Auth Token', placeholder: 'xxx', isPassword: true },
  ],
  homeassistant: [
    { key: 'ha_url', label: 'Home Assistant URL', placeholder: 'http://homeassistant:8123' },
    { key: 'ha_token', label: 'Long-Lived Access Token', placeholder: 'xxx', isPassword: true },
  ],
  matrix: [
    { key: 'matrix_homeserver', label: 'Home Server', placeholder: 'https://matrix.org' },
    { key: 'matrix_user', label: 'Username', placeholder: '@user:matrix.org' },
    { key: 'matrix_password', label: 'Password', placeholder: 'password', isPassword: true },
  ],
  mattermost: [
    { key: 'mattermost_url', label: 'Server URL', placeholder: 'https://mattermost.example.com' },
    { key: 'mattermost_team', label: 'Team', placeholder: 'team-name' },
    { key: 'mattermost_token', label: 'Personal Access Token', placeholder: 'xxx', isPassword: true },
  ],
}
