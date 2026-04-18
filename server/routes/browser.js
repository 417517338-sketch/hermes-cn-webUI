/**
 * 浏览器控制 API 路由
 * @description 提供 Playwright 浏览器自动化能力
 * @see CONSTITUTION.md 第二章 2.2.12
 */
import { Router } from 'express'
import { chromium } from 'playwright'

const router = Router()

// ============================================================================
// 数据结构
// ============================================================================

/**
 * @typedef {Object} BrowserTab
 * @property {string} id
 * @property {string} url
 * @property {string} title
 * @property {'loading'|'ready'|'error'} status
 * @property {string[]} history
 * @property {number} historyIndex
 * @property {import('playwright').Page} page
 */

/**
 * @typedef {Object} BrowserSession
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {'active'|'closed'} status
 * @property {BrowserTab[]} tabs
 * @property {string|null} activeTab
 * @property {string} created_at
 * @property {import('playwright').Browser} browser
 */

// 浏览器会话存储
/** @type {Map<string, BrowserSession>} */
const browserSessions = new Map()

// ============================================================================
// 工具函数
// ============================================================================

/** 生成唯一 ID */
function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** 从 session 中提取可序列化的信息（不含 Playwright 对象） */
function serializeSession(session) {
  return {
    id: session.id,
    name: session.name,
    type: session.type,
    status: session.status,
    created_at: session.created_at,
    activeTab: session.activeTab,
    tabs: session.tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      status: t.status,
      history: t.history,
      historyIndex: t.historyIndex,
    })),
  }
}

/** 更新 tab 标题和 URL */
async function refreshTabInfo(tab) {
  try {
    tab.url = tab.page.url()
    tab.title = await tab.page.title()
    tab.status = 'ready'
  } catch {
    tab.status = 'error'
  }
}

// ============================================================================
// 生命周期
// ============================================================================

/**
 * 关闭所有浏览器实例（进程退出时调用）
 */
export async function closeAllBrowsers() {
  for (const session of browserSessions.values()) {
    try {
      if (session.browser) await session.browser.close()
    } catch { /* ignore */ }
  }
  browserSessions.clear()
}

/**
 * 获取所有会话摘要
 */
router.get('/sessions', (req, res) => {
  const sessions = Array.from(browserSessions.values())
    .filter(s => s.status === 'active')
    .map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      created_at: s.created_at,
      tabs_count: s.tabs.length,
    }))
  res.json({ sessions })
})

// ============================================================================
// 会话管理
// ============================================================================

/**
 * POST /api/browser/sessions
 * 创建新的浏览器会话
 */
router.post('/sessions', async (req, res) => {
  try {
    const { type = 'chromium', name } = req.body

    // 启动 Playwright 浏览器
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    // 创建一个默认空白页
    const context = await browser.newContext()
    const page = await context.newPage()

    const sessionId = uid('bs')
    const tabId = uid('tab')

    /** @type {BrowserTab} */
    const tab = {
      id: tabId,
      url: 'about:blank',
      title: '空白页',
      status: 'ready',
      history: ['about:blank'],
      historyIndex: 0,
      page,
    }

    /** @type {BrowserSession} */
    const session = {
      id: sessionId,
      name: name || `Browser ${sessionId}`,
      type,
      status: 'active',
      tabs: [tab],
      activeTab: tabId,
      created_at: new Date().toISOString(),
      browser,
    }

    browserSessions.set(sessionId, session)

    res.json({ session: serializeSession(session) })
  } catch (err) {
    console.error('[browser] Failed to create session:', err)
    res.status(500).json({ error: `启动浏览器失败: ${err.message}` })
  }
})

/**
 * GET /api/browser/sessions/:id
 * 获取指定会话详情
 */
router.get('/sessions/:id', (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }
  res.json({ session: serializeSession(session) })
})

/**
 * DELETE /api/browser/sessions/:id
 * 关闭浏览器会话
 */
router.delete('/sessions/:id', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  try {
    // 关闭所有标签页的 page
    for (const tab of session.tabs) {
      try { await tab.page.close() } catch { /* already closed */ }
    }
    // 关闭浏览器
    await session.browser.close()
  } catch { /* ignore close errors */ }

  session.status = 'closed'
  browserSessions.delete(req.params.id)
  res.json({ success: true })
})

// ============================================================================
// 导航
// ============================================================================

/**
 * POST /api/browser/sessions/:id/navigate
 * 导航到指定 URL
 */
router.post('/sessions/:id/navigate', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { url, tab_id } = req.body
  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  // 规范化 URL
  let normalizedUrl = url
  try {
    normalizedUrl = url.startsWith('http') ? url : `https://${url}`
    new URL(normalizedUrl) // validate
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  const targetTabId = tab_id || session.activeTab
  if (!targetTabId) {
    return res.status(400).json({ error: 'No active tab' })
  }

  const tab = session.tabs.find(t => t.id === targetTabId)
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    tab.status = 'loading'

    // 监听 load 事件完成
    await tab.page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // 更新历史
    if (tab.historyIndex < tab.history.length - 1) {
      // 截断前进历史
      tab.history = tab.history.slice(0, tab.historyIndex + 1)
    }
    tab.history.push(normalizedUrl)
    tab.historyIndex = tab.history.length - 1

    await refreshTabInfo(tab)

    res.json({
      success: true,
      tab_id: tab.id,
      url: tab.url,
      title: tab.title,
    })
  } catch (err) {
    tab.status = 'error'
    res.status(500).json({ error: `导航失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/snapshot
 * 获取页面快照（DOM 元素树）
 */
router.post('/sessions/:id/snapshot', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { tab_id } = req.body
  const tab = session.tabs.find(t => t.id === (tab_id || session.activeTab))
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    await refreshTabInfo(tab)

    // 收集可交互元素
    const interactiveElements = await tab.page.evaluate(() => {
      const elements = []
      const tags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']

      document.querySelectorAll(tags.join(',')).forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        elements.push({
          ref: `@e${i + 1}`,
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 80) || '',
          href: el.tagName === 'A' ? (el).getAttribute('href') : undefined,
          type: el.getAttribute('type') || undefined,
          name: el.getAttribute('name') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          attributes: {},
        })
      })

      return elements
    })

    res.json({
      tab_id: tab.id,
      url: tab.url,
      title: tab.title,
      status: tab.status,
      interactive_elements: interactiveElements,
    })
  } catch (err) {
    res.status(500).json({ error: `快照失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/click
 * 点击页面元素
 */
router.post('/sessions/:id/click', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { ref, tab_id } = req.body
  if (!ref) {
    return res.status(400).json({ error: 'Element ref is required' })
  }

  const tab = session.tabs.find(t => t.id === (tab_id || session.activeTab))
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    // ref 格式: @e1 → index 0
    const match = ref.match(/^@e(\d+)$/)
    if (!match) {
      return res.status(400).json({ error: 'Invalid ref format. Use @eN' })
    }

    const index = parseInt(match[1], 10) - 1

    // 重新获取元素列表并点击
    const clicked = await tab.page.evaluate((idx) => {
      const elements = []
      const tags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']
      const els = document.querySelectorAll(tags.join(','))
      els.forEach(el => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        elements.push(el)
      })
      if (elements[idx]) {
        elements[idx].click()
        return true
      }
      return false
    }, index)

    if (!clicked) {
      return res.status(404).json({ error: 'Element not found at ref' })
    }

    // 等待导航（如果是链接点击）
    try {
      await tab.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      await refreshTabInfo(tab)
    } catch { /* no navigation needed */ }

    res.json({
      success: true,
      action: 'click',
      ref,
      tab_id: tab.id,
      url: tab.url,
      title: tab.title,
    })
  } catch (err) {
    res.status(500).json({ error: `点击失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/type
 * 向页面元素输入文本
 */
router.post('/sessions/:id/type', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { ref, text, tab_id } = req.body
  if (!ref || text === undefined) {
    return res.status(400).json({ error: 'ref and text are required' })
  }

  const tab = session.tabs.find(t => t.id === (tab_id || session.activeTab))
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    const match = ref.match(/^@e(\d+)$/)
    if (!match) {
      return res.status(400).json({ error: 'Invalid ref format. Use @eN' })
    }
    const index = parseInt(match[1], 10) - 1

    const done = await tab.page.evaluate(async ([idx, txt]) => {
      const tags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']
      const elements = []
      document.querySelectorAll(tags.join(',')).forEach(el => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        elements.push(el)
      })
      const el = elements[idx]
      if (!el) return false

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const input = /** @type {HTMLInputElement} */ (el)
        const isFocused = document.activeElement === el
        if (!isFocused) el.focus()
        const current = input.value
        input.value = current + txt
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        el.textContent = (el.textContent || '') + txt
      }
      return true
    }, [index, text])

    if (!done) {
      return res.status(404).json({ error: 'Element not found at ref' })
    }

    res.json({ success: true, action: 'type', ref, text, tab_id: tab.id })
  } catch (err) {
    res.status(500).json({ error: `输入失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/scroll
 * 滚动页面
 */
router.post('/sessions/:id/scroll', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { direction = 'down', amount = 300, tab_id } = req.body
  const tab = session.tabs.find(t => t.id === (tab_id || session.activeTab))
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    const deltaY = direction === 'up' ? -amount : amount
    await tab.page.evaluate((dy) => {
      window.scrollBy({ top: dy, behavior: 'smooth' })
    }, deltaY)

    // 等待滚动完成
    await tab.page.waitForTimeout(300)

    res.json({ success: true, action: 'scroll', direction, amount, tab_id: tab.id })
  } catch (err) {
    res.status(500).json({ error: `滚动失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/screenshot
 * 截取页面截图
 */
router.post('/sessions/:id/screenshot', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { tab_id, full_page = false } = req.body
  const tab = session.tabs.find(t => t.id === (tab_id || session.activeTab))
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  try {
    const screenshot = await tab.page.screenshot({
      fullPage: full_page,
      type: 'png',
    })

    const base64 = screenshot.toString('base64')

    res.json({
      success: true,
      tab_id: tab.id,
      screenshot: `data:image/png;base64,${base64}`,
      width: (await tab.page.evaluate(() => document.body.scrollWidth)) || 0,
      height: (await tab.page.evaluate(() => document.body.scrollHeight)) || 0,
    })
  } catch (err) {
    res.status(500).json({ error: `截图失败: ${err.message}` })
  }
})

// ============================================================================
// 标签页管理
// ============================================================================

/**
 * POST /api/browser/sessions/:id/tabs
 * 创建新标签页
 */
router.post('/sessions/:id/tabs', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const { url = 'about:blank' } = req.body

  try {
    const page = await session.browser.newPage()
    const tabId = uid('tab')

    if (url !== 'about:blank') {
      try {
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
        await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      } catch { /* ignore navigation errors for new tabs */ }
    }

    /** @type {BrowserTab} */
    const tab = {
      id: tabId,
      url: page.url() || 'about:blank',
      title: await page.title().catch(() => '新标签页'),
      status: 'ready',
      history: [page.url() || 'about:blank'],
      historyIndex: 0,
      page,
    }

    session.tabs.push(tab)
    session.activeTab = tabId

    res.json({ success: true, tab: { id: tab.id, url: tab.url, title: tab.title, status: tab.status, history: tab.history, historyIndex: tab.historyIndex } })
  } catch (err) {
    res.status(500).json({ error: `创建标签页失败: ${err.message}` })
  }
})

/**
 * DELETE /api/browser/sessions/:id/tabs/:tabId
 * 关闭标签页
 */
router.delete('/sessions/:id/tabs/:tabId', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const tabIndex = session.tabs.findIndex(t => t.id === req.params.tabId)
  if (tabIndex === -1) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  const tab = session.tabs[tabIndex]
  try { await tab.page.close() } catch { /* already closed */ }
  session.tabs.splice(tabIndex, 1)

  if (session.activeTab === req.params.tabId) {
    session.activeTab = session.tabs[session.tabs.length - 1]?.id || null
  }

  // 如果没有标签页了，关闭会话
  if (session.tabs.length === 0) {
    try { await session.browser.close() } catch { /* ignore */ }
    session.status = 'closed'
    browserSessions.delete(session.id)
    return res.json({ success: true, session_closed: true })
  }

  res.json({ success: true })
})

/**
 * POST /api/browser/sessions/:id/tabs/:tabId/activate
 * 激活标签页
 */
router.post('/sessions/:id/tabs/:tabId/activate', (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const tab = session.tabs.find(t => t.id === req.params.tabId)
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  session.activeTab = tab.id
  res.json({ success: true, activeTab: tab.id })
})

/**
 * POST /api/browser/sessions/:id/tabs/:tabId/back
 * 后退
 */
router.post('/sessions/:id/tabs/:tabId/back', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const tab = session.tabs.find(t => t.id === req.params.tabId)
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  if (tab.historyIndex <= 0) {
    return res.json({ success: false, error: 'No history back' })
  }

  try {
    tab.historyIndex--
    await tab.page.goto(tab.history[tab.historyIndex], { waitUntil: 'domcontentloaded', timeout: 15000 })
    await refreshTabInfo(tab)

    res.json({ success: true, url: tab.url, title: tab.title })
  } catch (err) {
    res.status(500).json({ error: `后退失败: ${err.message}` })
  }
})

/**
 * POST /api/browser/sessions/:id/tabs/:tabId/forward
 * 前进
 */
router.post('/sessions/:id/tabs/:tabId/forward', async (req, res) => {
  const session = browserSessions.get(req.params.id)
  if (!session || session.status === 'closed') {
    return res.status(404).json({ error: 'Session not found' })
  }

  const tab = session.tabs.find(t => t.id === req.params.tabId)
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' })
  }

  if (tab.historyIndex >= tab.history.length - 1) {
    return res.json({ success: false, error: 'No history forward' })
  }

  try {
    tab.historyIndex++
    await tab.page.goto(tab.history[tab.historyIndex], { waitUntil: 'domcontentloaded', timeout: 15000 })
    await refreshTabInfo(tab)

    res.json({ success: true, url: tab.url, title: tab.title })
  } catch (err) {
    res.status(500).json({ error: `前进失败: ${err.message}` })
  }
})

export default router
