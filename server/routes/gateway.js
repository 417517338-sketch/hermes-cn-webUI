/**
 * Gateway 路由 — 真实集成
 * @description 管理 Hermes Agent Gateway（消息平台集成）的启动/停止/配置
 * @description Gateway 是 long-running subprocess，通过 SIGUSR1 接收热重启信号
 * @see CONSTITUTION.md 第二章 2.2.16
 */
import { Router } from 'express'
import { spawn, execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import jsyaml from 'js-yaml'

export const gatewayRouter = Router()

const HERMES_HOME = join(homedir(), '.hermes')
const GATEWAY_PID_FILE = join(HERMES_HOME, 'gateway.pid')
const CONFIG_FILE = join(HERMES_HOME, 'config.yaml')

// 已知平台列表（与 Hermes Agent gateway 对齐）
const PLATFORM_REGISTRY = [
  { id: 'weixin',     name: '微信',      icon: '💚', has_webhook: false },
  { id: 'feishu',     name: '飞书',      icon: '📮', has_webhook: true  },
  { id: 'wecom',      name: '企业微信',  icon: '💼', has_webhook: true  },
  { id: 'dingtalk',   name: '钉钉',      icon: '💬', has_webhook: true  },
  { id: 'whatsapp',   name: 'WhatsApp', icon: '💬', has_webhook: false },
]

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return {}
    return jsyaml.load(readFileSync(CONFIG_FILE, 'utf8'), { schema: jsyaml.JSON_SCHEMA }) || {}
  } catch {
    return {}
  }
}

function saveConfig(cfg) {
  const yaml = jsyaml.dump(cfg, { quotingType: '"', lineWidth: -1, noRefs: true, sortKeys: false, schema: jsyaml.JSON_SCHEMA })
  writeFileSync(CONFIG_FILE, yaml, 'utf8')
}

// ---------------------------------------------------------------------------
// Gateway process helpers
// ---------------------------------------------------------------------------

function getGatewayPid() {
  try {
    if (!existsSync(GATEWAY_PID_FILE)) return null
    const content = readFileSync(GATEWAY_PID_FILE, 'utf8').trim()
    // Hermes writes a JSON object: {"pid": 12345, ...}
    // Fall back to plain integer for backwards compatibility
    let pid
    try {
      const parsed = JSON.parse(content)
      pid = typeof parsed === 'object' ? parsed.pid : parsed
    } catch {
      pid = parseInt(content, 10)
    }
    if (!pid || isNaN(pid)) return null
    // Check if process is alive
    try {
      process.kill(pid, 0) // signal 0 = check existence
      return pid
    } catch {
      // Process doesn't exist
      unlinkSync(GATEWAY_PID_FILE)
      return null
    }
  } catch {
    return null
  }
}

function isGatewayRunning() {
  return getGatewayPid() !== null
}

function startGateway() {
  // Always stop any existing gateway first — prevents stale PID-file
  // conflicts and ensures the WeChat bot token is released before the
  // new process tries to connect.
  if (isGatewayRunning()) {
    stopGateway()
    // Give the old process time to release the WeChat token (it may
    // need a few seconds to close the webhook + disconnect gracefully).
    const stall = Date.now()
    while (Date.now() - stall < 5000) {
      if (!isGatewayRunning()) break
      require('child_process').execSync('sleep 0.5')
    }
  }

  const python = join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python')
  // Use a shell wrapper to properly daemonize on macOS/Unix.
  // The shell runs in the background so Node can exit immediately.
  const shellCmd = `exec "${python}" -m hermes_cli.main gateway run --replace`
  const proc = spawn('sh', ['-c', shellCmd], {
    cwd: HERMES_HOME,
    env: { ...process.env, HERMES_HOME },
    detached: true,
    stdio: 'ignore',
  })

  proc.unref()

  // Give it 3 seconds to start and write pid
  const pid = proc.pid
  if (pid) {
    writeFileSync(GATEWAY_PID_FILE, String(pid), 'utf8')
    return { success: true, pid }
  }

  return { success: false, error: 'Failed to start gateway process' }
}

function stopGateway() {
  const pid = getGatewayPid()
  if (!pid) {
    return { success: false, error: 'Gateway is not running' }
  }

  try {
    process.kill(pid, 'SIGTERM')
    // Give it 5s to shut down, then SIGKILL
    setTimeout(() => {
      try { process.kill(pid, 'SIGKILL') } catch {}
    }, 5000)
    unlinkSync(GATEWAY_PID_FILE)
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to stop gateway: ${err.message}` }
  }
}

function restartGateway() {
  const pid = getGatewayPid()
  if (!pid) {
    return { success: false, error: 'Gateway is not running' }
  }

  // Hermes doesn't support SIGUSR1 hot reload in this version —
  // the process exits instead. Do a stop + start cycle.
  stopGateway()
  // Give it time to fully terminate
  const stall = Date.now()
  while (Date.now() - stall < 3000) {
    if (!isGatewayRunning()) break
    require('child_process').execSync('sleep 0.3')
  }
  const result = startGateway()
  if (!result.success) {
    return { success: false, error: result.error }
  }
  return { success: true, pid: result.pid }
}

// ---------------------------------------------------------------------------
// Platform config helpers
// ---------------------------------------------------------------------------

function platformConfig(platformId) {
  const cfg = loadConfig()
  // Platform config lives at config.platforms.{platformId} (official structure)
  if (cfg.platforms && cfg.platforms[platformId]) {
    return cfg.platforms[platformId]
  }
  // Fallback: top-level key (legacy gateway.json format)
  return cfg[platformId] || null
}

function isPlatformEnabled(platformId) {
  const pcfg = platformConfig(platformId)
  if (!pcfg) return false
  // Enabled if the platform has required credentials set
  const tokenKey = platformId === 'homeassistant' ? 'ha_url' :
    platformId === 'wecom' ? 'wecom_corp_id' :
    platformId === 'feishu' ? 'feishu_app_id' :
    platformId === 'weixin' ? 'extra.account_id' :  // actual field in config.yaml
    platformId === 'email' ? 'smtp_host' :
    `${platformId}_bot_token`
  // For weixin the token lives inside pcfg.extra.account_id
  if (platformId === 'weixin') return !!(pcfg.extra && pcfg.extra.account_id)
  return !!pcfg[tokenKey]
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/gateway
 * 列出所有平台及其状态
 */
gatewayRouter.get('/', (req, res) => {
  const cfg = loadConfig()
  const running = isGatewayRunning()

  const platforms = PLATFORM_REGISTRY.map(p => {
    const pcfg = platformConfig(p.id)
    const enabled = isPlatformEnabled(p.id)
    // Determine status: running means gateway is alive AND platform has config
    let status = 'offline'
    if (running && enabled) {
      status = 'online'
    } else if (running && !enabled) {
      status = 'configured'
    }
    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      enabled,
      status,
      has_webhook: p.has_webhook,
      config: pcfg || null,
    }
  })

  res.json({ platforms, gateway_running: running, pid: getGatewayPid() })
})

/**
 * POST /api/gateway/start
 * 启动 Gateway 子进程
 */
gatewayRouter.post('/start', (req, res) => {
  const result = startGateway()
  if (!result.success) {
    return res.status(409).json(result)
  }
  res.json({ success: true, pid: result.pid })
})

/**
 * POST /api/gateway/stop
 * 停止 Gateway 子进程
 */
gatewayRouter.post('/stop', (req, res) => {
  const result = stopGateway()
  if (!result.success) {
    return res.status(409).json(result)
  }
  res.json(result)
})

/**
 * POST /api/gateway/restart
 * 热重启 Gateway（SIGUSR1）
 */
gatewayRouter.post('/restart', (req, res) => {
  const result = restartGateway()
  if (!result.success) {
    return res.status(409).json(result)
  }
  res.json({ success: true })
})

/**
 * GET /api/gateway/status
 * 查询 Gateway 状态
 */
gatewayRouter.get('/status', (req, res) => {
  const pid = getGatewayPid()
  res.json({ running: pid !== null, pid })
})

/**
 * PUT /api/gateway/:id
 * 更新平台配置（启用/禁用/设置凭据）
 * 注意：只修改 config.yaml 中的平台配置段，不管理 gateway 进程
 */
gatewayRouter.put('/:id', (req, res) => {
  const { id } = req.params
  const platform = PLATFORM_REGISTRY.find(p => p.id === id)
  if (!platform) {
    return res.status(404).json({ error: 'Platform not found' })
  }

  const { enabled, config } = req.body
  const cfg = loadConfig()

  if (!cfg[id]) cfg[id] = {}

  if (enabled !== undefined) {
    // enabled=true requires config; enabled=false just clears the main token
    if (enabled && config) {
      cfg[id] = { ...cfg[id], ...config }
    } else if (!enabled) {
      // Disable: clear token keys
      const tokenKey = id === 'homeassistant' ? 'ha_url' :
        id === 'wecom' ? 'wecom_corp_id' :
        id === 'feishu' ? 'feishu_app_id' :
        id === 'weixin' ? 'weixin_app_id' :
        id === 'email' ? 'smtp_host' :
        `${id}_bot_token`
      delete cfg[id][tokenKey]
      // Also clear paired secret fields for platforms that have them
      if (id === 'weixin') {
        delete cfg[id]['weixin_app_secret']
      }
    }
  }

  if (config) {
    cfg[id] = { ...cfg[id], ...config }
  }

  saveConfig(cfg)

  // If gateway is running, send SIGUSR1 to hot-reload
  if (isGatewayRunning()) {
    restartGateway()
  }

  res.json({
    success: true,
    platform: {
      id,
      name: platform.name,
      icon: platform.icon,
      enabled: isPlatformEnabled(id),
      config: cfg[id] || null,
    },
  })
})

// ---------------------------------------------------------------------------
// In-memory QR login state (per-process, one login at a time)
// ---------------------------------------------------------------------------

// WeChat QR state
const weixinQrState = {
  qrcode: null,
  qrcodeImg: null,
  baseUrl: 'https://ilinkai.weixin.qq.com',
  status: 'idle',
  credentials: null,
  error: null,
  deadline: null,
}

// Feishu QR state
const feishuQrState = {
  deviceCode: null,
  qrUrl: null,
  userCode: null,
  interval: 5,
  expireIn: 600,
  status: 'idle',
  credentials: null,
  error: null,
  deadline: null,
}

// ---------------------------------------------------------------------------
// WeChat QR Login helpers
// ---------------------------------------------------------------------------

async function weixinFetchQrCode() {
  const ep = '/ilink/bot/get_bot_qrcode?bot_type=3'
  const resp = await fetch(`${weixinQrState.baseUrl}${ep}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return await resp.json()
}

async function weixinPollStatus() {
  const ep = `/ilink/bot/get_qrcode_status?qrcode=${weixinQrState.qrcode}`
  const resp = await fetch(`${weixinQrState.baseUrl}${ep}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return await resp.json()
}

function saveWeixinCredentials(creds) {
  const cfg = loadConfig()
  if (!cfg.platforms) cfg.platforms = {}
  if (!cfg.platforms.weixin) cfg.platforms.weixin = {}
  if (!cfg.platforms.weixin.extra) cfg.platforms.weixin.extra = {}
  cfg.platforms.weixin.extra.account_id = creds.account_id
  cfg.platforms.weixin.extra.token = creds.token
  cfg.platforms.weixin.extra.base_url = creds.base_url
  cfg.platforms.weixin.extra.user_id = creds.user_id || ''
  cfg.platforms.weixin.enabled = true
  saveConfig(cfg)
}

// ---------------------------------------------------------------------------
// Feishu QR Login helpers
// ---------------------------------------------------------------------------

const FEISHU_ACCOUNTS_BASE = 'https://accounts.feishu.cn'

async function feishuBeginRegistration() {
  const url = `${FEISHU_ACCOUNTS_BASE}/oauth/v1/app/registration`
  const body = new URLSearchParams({
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id',
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await resp.text()
  let data = {}
  try { data = JSON.parse(text) } catch {}
  return { ok: resp.ok, status: resp.status, data }
}

async function feishuPollRegistration(deviceCode) {
  const url = `${FEISHU_ACCOUNTS_BASE}/oauth/v1/app/registration`
  const body = new URLSearchParams({
    action: 'poll',
    device_code: deviceCode,
    tp: 'ob_app',
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await resp.text()
  let data = {}
  try { data = JSON.parse(text) } catch {}
  return { ok: resp.ok, status: resp.status, data }
}

function saveFeishuCredentials(creds) {
  const cfg = loadConfig()
  if (!cfg.platforms) cfg.platforms = {}
  if (!cfg.platforms.feishu) cfg.platforms.feishu = {}
  if (!cfg.platforms.feishu.extra) cfg.platforms.feishu.extra = {}
  cfg.platforms.feishu.extra.app_id = creds.app_id
  cfg.platforms.feishu.extra.app_secret = creds.app_secret
  cfg.platforms.feishu.enabled = true
  saveConfig(cfg)
}

// ---------------------------------------------------------------------------
// Routes: WeChat QR Login
// ---------------------------------------------------------------------------

/**
 * POST /api/gateway/weixin/qr/start
 * Start WeChat QR login — fetches QR code from iLink API
 */
gatewayRouter.post('/weixin/qr/start', async (req, res) => {
  try {
    weixinQrState.qrcode = null
    weixinQrState.qrcodeImg = null
    weixinQrState.status = 'idle'
    weixinQrState.credentials = null
    weixinQrState.error = null
    weixinQrState.deadline = Date.now() + 480 * 1000

    const data = await weixinFetchQrCode()
    const qrcodeValue = String(data.qrcode || '')
    const qrcodeImg = String(data.qrcode_img_content || '')

    if (!qrcodeValue) {
      return res.status(500).json({ success: false, error: 'iLink returned no qrcode' })
    }

    weixinQrState.qrcode = qrcodeValue
    weixinQrState.qrcodeImg = qrcodeImg
    weixinQrState.status = 'pending'

    // qrcode_img_content can be a data: URI, an https: URL, or raw base64
    const imgDataUrl = qrcodeImg.startsWith('data:') || qrcodeImg.startsWith('http')
      ? qrcodeImg
      : `data:image/png;base64,${qrcodeImg}`

    res.json({
      success: true,
      qrcode: qrcodeValue,
      qrcodeImg: imgDataUrl,
      expiresIn: 480,
    })
  } catch (err) {
    weixinQrState.status = 'error'
    weixinQrState.error = err.message
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/gateway/weixin/qr/status
 * Poll WeChat QR scan status
 */
gatewayRouter.get('/weixin/qr/status', async (req, res) => {
  if (weixinQrState.status === 'idle' || weixinQrState.status === 'error') {
    return res.json({ success: true, status: weixinQrState.status, error: weixinQrState.error })
  }

  if (weixinQrState.status === 'confirmed') {
    return res.json({ success: true, status: 'confirmed', credentials: weixinQrState.credentials })
  }

  if (Date.now() > weixinQrState.deadline) {
    weixinQrState.status = 'expired'
    return res.json({ success: false, status: 'expired', error: 'QR code expired' })
  }

  try {
    const data = await weixinPollStatus()
    const status = String(data.status || 'wait')

    if (status === 'wait') {
      weixinQrState.status = 'pending'
      res.json({ success: true, status: 'pending' })
    } else if (status === 'scaned') {
      weixinQrState.status = 'scaned'
      res.json({ success: true, status: 'scaned' })
    } else if (status === 'scaned_but_redirect') {
      const redirectHost = String(data.redirect_host || '')
      if (redirectHost) weixinQrState.baseUrl = `https://${redirectHost}`
      weixinQrState.status = 'scaned'
      res.json({ success: true, status: 'scaned' })
    } else if (status === 'expired') {
      weixinQrState.status = 'expired'
      res.json({ success: false, status: 'expired', error: 'QR code expired' })
    } else if (status === 'confirmed') {
      const creds = {
        account_id: String(data.ilink_bot_id || ''),
        token: String(data.bot_token || ''),
        base_url: String(data.baseurl || weixinQrState.baseUrl),
        user_id: String(data.ilink_user_id || ''),
      }
      if (!creds.account_id || !creds.token) {
        weixinQrState.status = 'error'
        weixinQrState.error = 'confirmed but missing credentials'
        return res.status(500).json({ success: false, status: 'error', error: 'Missing account_id or token' })
      }
      saveWeixinCredentials(creds)
      weixinQrState.status = 'confirmed'
      weixinQrState.credentials = creds
      res.json({ success: true, status: 'confirmed', credentials: creds })
    } else {
      weixinQrState.status = 'pending'
      res.json({ success: true, status: 'pending' })
    }
  } catch (err) {
    weixinQrState.status = 'error'
    weixinQrState.error = err.message
    res.status(500).json({ success: false, status: 'error', error: err.message })
  }
})

/**
 * POST /api/gateway/weixin/qr/cancel
 * Cancel WeChat QR login
 */
gatewayRouter.post('/weixin/qr/cancel', (req, res) => {
  weixinQrState.status = 'idle'
  weixinQrState.qrcode = null
  weixinQrState.qrcodeImg = null
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Routes: Feishu QR Login
// ---------------------------------------------------------------------------

/**
 * POST /api/gateway/feishu/qr/start
 * Start Feishu QR login — begins device-code flow
 */
gatewayRouter.post('/feishu/qr/start', async (req, res) => {
  try {
    feishuQrState.deviceCode = null
    feishuQrState.qrUrl = null
    feishuQrState.userCode = null
    feishuQrState.status = 'idle'
    feishuQrState.credentials = null
    feishuQrState.error = null

    const result = await feishuBeginRegistration()
    if (!result.ok) {
      const msg = result.data?.msg || `HTTP ${result.status}`
      feishuQrState.status = 'error'
      feishuQrState.error = msg
      return res.status(500).json({ success: false, error: msg })
    }

    const data = result.data
    const deviceCode = String(data.device_code || '')
    const qrUrl = String(data.verification_uri_complete || '')
    const userCode = String(data.user_code || '')
    const interval = Number(data.interval || 5)
    const expireIn = Number(data.expire_in || 600)

    if (!deviceCode || !qrUrl) {
      feishuQrState.status = 'error'
      feishuQrState.error = 'Feishu returned no device_code or verification_uri'
      return res.status(500).json({ success: false, error: 'Invalid Feishu response' })
    }

    feishuQrState.deviceCode = deviceCode
    feishuQrState.qrUrl = qrUrl
    feishuQrState.userCode = userCode
    feishuQrState.interval = interval
    feishuQrState.expireIn = expireIn
    feishuQrState.status = 'pending'
    feishuQrState.deadline = Date.now() + expireIn * 1000

    res.json({
      success: true,
      qrUrl,
      userCode,
      expiresIn: expireIn,
    })
  } catch (err) {
    feishuQrState.status = 'error'
    feishuQrState.error = err.message
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/gateway/feishu/qr/status
 * Poll Feishu QR scan status
 */
gatewayRouter.get('/feishu/qr/status', async (req, res) => {
  if (feishuQrState.status === 'idle' || feishuQrState.status === 'error') {
    return res.json({ success: true, status: feishuQrState.status, error: feishuQrState.error })
  }

  if (feishuQrState.status === 'confirmed') {
    return res.json({ success: true, status: 'confirmed', credentials: feishuQrState.credentials })
  }

  if (Date.now() > feishuQrState.deadline) {
    feishuQrState.status = 'expired'
    return res.json({ success: false, status: 'expired', error: 'QR code expired' })
  }

  try {
    const result = await feishuPollRegistration(feishuQrState.deviceCode)

    if (result.status === 200) {
      const data = result.data || {}
      const appId = String(data.client_id || '')
      const appSecret = String(data.client_secret || '')
      const domain = String(data.domain || 'feishu')
      const openId = String(data.user_info?.open_id || '')

      if (!appId || !appSecret) {
        feishuQrState.status = 'error'
        feishuQrState.error = 'confirmed but missing app_id or app_secret'
        return res.status(500).json({ success: false, status: 'error', error: 'Missing credentials' })
      }

      const creds = { app_id: appId, app_secret: appSecret, domain, open_id: openId }
      saveFeishuCredentials(creds)
      feishuQrState.status = 'confirmed'
      feishuQrState.credentials = creds
      res.json({ success: true, status: 'confirmed', credentials: creds })
    } else {
      const errorCode = result.data?.error || ''
      if (errorCode === 'authorization_pending' || result.status === 400) {
        feishuQrState.status = 'pending'
        res.json({ success: true, status: 'pending' })
      } else {
        feishuQrState.status = 'error'
        feishuQrState.error = result.data?.error_description || result.data?.error || `HTTP ${result.status}`
        res.status(500).json({ success: false, status: 'error', error: feishuQrState.error })
      }
    }
  } catch (err) {
    feishuQrState.status = 'error'
    feishuQrState.error = err.message
    res.status(500).json({ success: false, status: 'error', error: err.message })
  }
})

/**
 * POST /api/gateway/feishu/qr/cancel
 * Cancel Feishu QR login
 */
gatewayRouter.post('/feishu/qr/cancel', (req, res) => {
  feishuQrState.status = 'idle'
  feishuQrState.deviceCode = null
  feishuQrState.qrUrl = null
  res.json({ success: true })
})
