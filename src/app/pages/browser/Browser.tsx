/**
 * 浏览器控制页面对应 Agent 能力：Playwright 浏览器自动化
 * @see CONSTITUTION.md 第二章 2.2.12
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Globe, Camera, ArrowLeft, ArrowRight, Plus, Trash2,
  ChevronDown, ChevronUp, RotateCcw,
  Loader2, AlertCircle, Terminal, X, Layers
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface BrowserTab {
  id: string
  url: string
  title: string
  status: 'loading' | 'ready' | 'error'
  history: string[]
  historyIndex: number
}

interface BrowserSession {
  id: string
  name: string
  type: string
  status: 'active' | 'closed'
  created_at: string
  activeTab: string | null
  tabs: BrowserTab[]
  tabs_count?: number
}

interface InteractiveElement {
  ref: string
  tag: string
  text: string
  href?: string
  type?: string
  name?: string
  placeholder?: string
  rect: { x: number; y: number; w: number; h: number }
}

interface PageSnapshot {
  tab_id: string
  url: string
  title: string
  status: string
  interactive_elements: InteractiveElement[]
}

// ============================================================================
// API
// ============================================================================

async function fetchSessions(): Promise<{ sessions: BrowserSession[] }> {
  const res = await fetch('/api/browser/sessions')
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

async function createSession(type = 'chromium', name?: string): Promise<{ session: BrowserSession }> {
  const res = await fetch('/api/browser/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create session')
  }
  return res.json()
}

async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete session')
}

async function navigateTab(sessionId: string, url: string, tabId?: string): Promise<{ url: string; title: string }> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, tab_id: tabId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Navigation failed')
  }
  return res.json()
}

async function getSnapshot(sessionId: string, tabId?: string): Promise<PageSnapshot> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab_id: tabId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Snapshot failed')
  }
  return res.json()
}

async function takeScreenshot(sessionId: string, tabId?: string): Promise<{ screenshot: string; width: number; height: number }> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab_id: tabId, full_page: false }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Screenshot failed')
  }
  return res.json()
}

async function clickElement(sessionId: string, ref: string, tabId?: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, tab_id: tabId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Click failed')
  }
}

async function typeIntoElement(sessionId: string, ref: string, text: string, tabId?: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/type`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, text, tab_id: tabId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Type failed')
  }
}

async function scrollPage(sessionId: string, direction: 'up' | 'down', amount: number, tabId?: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, amount, tab_id: tabId }),
  })
  if (!res.ok) throw new Error('Scroll failed')
}

async function createTab(sessionId: string, url?: string): Promise<{ tab: BrowserTab }> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/tabs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url || 'about:blank' }),
  })
  if (!res.ok) throw new Error('Failed to create tab')
  return res.json()
}

async function closeTab(sessionId: string, tabId: string): Promise<{ success: boolean; session_closed?: boolean }> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/tabs/${tabId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to close tab')
  return res.json()
}

async function activateTab(sessionId: string, tabId: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/tabs/${tabId}/activate`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to activate tab')
}

async function goBack(sessionId: string, tabId: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/tabs/${tabId}/back`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Back failed')
  }
}

async function goForward(sessionId: string, tabId: string): Promise<void> {
  const res = await fetch(`/api/browser/sessions/${sessionId}/tabs/${tabId}/forward`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Forward failed')
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function Browser() {
  const queryClient = useQueryClient()

  // ---------- State ----------
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [pageWidth, setPageWidth] = useState(1280)
  const [pageHeight, setPageHeight] = useState(800)
  const [elements, setElements] = useState<InteractiveElement[]>([])
  const [hoveredElement, setHoveredElement] = useState<string | null>(null)
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [showElementPanel, setShowElementPanel] = useState(true)
  const [elementFilter, setElementFilter] = useState('')
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [imageScale, setImageScale] = useState(1)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const screenshotRef = useRef<HTMLDivElement>(null)

  // ---------- Queries ----------
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['browser-sessions'],
    queryFn: fetchSessions,
    refetchInterval: 5000,
  })

  const sessions: BrowserSession[] = sessionsData?.sessions || []
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const activeTab = activeSession?.tabs.find(t => t.id === (activeTabId || activeSession.activeTab))

  // Auto-select first session
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions.length, activeSessionId])

  // Auto-select active tab
  useEffect(() => {
    if (activeSession && !activeTabId) {
      setActiveTabId(activeSession.activeTab || null)
    }
  }, [activeSession, activeTabId])

  // Sync URL input with active tab
  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url.replace(/^https?:\/\//, ''))
    } else {
      setUrlInput('')
    }
  }, [activeTab?.url])

  // ---------- Mutations ----------

  const createMutation = useMutation({
    mutationFn: () => createSession(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      setActiveSessionId(data.session.id)
      setActiveTabId(data.session.activeTab)
      setScreenshot(null)
      setElements([])
      setErrorMsg(null)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      if (activeSessionId) {
        const remaining = sessions.filter(s => s.id !== activeSessionId)
        setActiveSessionId(remaining[0]?.id || null)
      }
      setScreenshot(null)
      setElements([])
    },
  })

  const navigateMutation = useMutation({
    mutationFn: ({ url, tabId }: { url: string; tabId?: string }) =>
      navigateTab(activeSessionId!, url, tabId),
    onSuccess: async () => {
      setErrorMsg(null)
      await refreshView()
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const screenshotMutation = useMutation({
    mutationFn: () => takeScreenshot(activeSessionId!, activeTabId || activeSession?.activeTab!),
    onSuccess: (data) => {
      setScreenshot(data.screenshot)
      setPageWidth(data.width || 1280)
      setPageHeight(data.height || 800)
      setErrorMsg(null)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const snapshotMutation = useMutation({
    mutationFn: () => getSnapshot(activeSessionId!, activeTabId || activeSession?.activeTab!),
    onSuccess: (data) => {
      setElements(data.interactive_elements || [])
      setErrorMsg(null)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const clickMutation = useMutation({
    mutationFn: (ref: string) => clickElement(activeSessionId!, ref, activeTabId || activeSession?.activeTab!),
    onSuccess: async () => {
      setSelectedElement(null)
      await refreshView()
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const typeMutation = useMutation({
    mutationFn: ({ ref, text }: { ref: string; text: string }) =>
      typeIntoElement(activeSessionId!, ref, text, activeTabId || activeSession?.activeTab!),
    onSuccess: async () => {
      await refreshView()
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const scrollMutation = useMutation({
    mutationFn: (direction: 'up' | 'down') => scrollPage(activeSessionId!, direction, 500, activeTabId || activeSession?.activeTab!),
    onSuccess: async () => {
      await refreshView()
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const createTabMutation = useMutation({
    mutationFn: () => createTab(activeSessionId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      setActiveTabId(data.tab.id)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const closeTabMutation = useMutation({
    mutationFn: (tabId: string) => closeTab(activeSessionId!, tabId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      if (data.session_closed) {
        setActiveSessionId(sessions.filter(s => s.id !== activeSessionId)[0]?.id || null)
      } else {
        const remaining = activeSession?.tabs.filter(t => t.id !== activeTabId)
        if (remaining && remaining.length > 0) {
          setActiveTabId(remaining[remaining.length - 1].id)
        }
      }
      setScreenshot(null)
      setElements([])
    },
  })

  const activateTabMutation = useMutation({
    mutationFn: (tabId: string) => activateTab(activeSessionId!, tabId),
    onSuccess: () => {
      setActiveTabId(activeTabId)
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
    },
  })

  const backMutation = useMutation({
    mutationFn: () => goBack(activeSessionId!, activeTabId || activeSession?.activeTab!),
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const forwardMutation = useMutation({
    mutationFn: () => goForward(activeSessionId!, activeTabId || activeSession?.activeTab!),
    onError: (err: Error) => setErrorMsg(err.message),
  })

  // ---------- Actions ----------

  async function refreshView() {
    if (!activeSessionId) return
    const tabId = activeTabId || activeSession?.activeTab
    if (!tabId) return

    // Take screenshot and get snapshot in parallel
    try {
      const [screenshotResult, snapshotResult2] = await Promise.allSettled([
        screenshotMutation.mutateAsync(),
        snapshotMutation.mutateAsync(),
      ])

      const sc = screenshotResult.status === 'fulfilled' ? screenshotResult.value : null
      const snap = snapshotResult2.status === 'fulfilled' ? snapshotResult2.value : null

      if (sc) {
        setScreenshot(sc.screenshot)
        setPageWidth(sc.width || 1280)
        setPageHeight(sc.height || 800)
      }
      if (snap) {
        setElements(snap.interactive_elements || [])
      } else {
        // Fallback: just take screenshot
        const ss = await takeScreenshot(activeSessionId, tabId)
        setScreenshot(ss.screenshot)
        setPageWidth(ss.width || 1280)
        setPageHeight(ss.height || 800)
        const sp = await getSnapshot(activeSessionId, tabId)
        setElements(sp.interactive_elements || [])
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  const handleNavigate = useCallback(() => {
    if (!urlInput.trim()) return
    navigateMutation.mutate({ url: urlInput.trim() })
  }, [urlInput, navigateMutation])

  const handleElementClick = useCallback((ref: string) => {
    setSelectedElement(ref)
    clickMutation.mutate(ref)
  }, [clickMutation])

  function handleScreenshotClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!screenshotRef.current || elements.length === 0) return

    const rect = screenshotRef.current.getBoundingClientRect()
    const scaleX = pageWidth / rect.width
    const scaleY = pageHeight / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // Find element at click position
    const el = elements.find(elem => {
      const r = elem.rect
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    })

    if (el) {
      handleElementClick(el.ref)
    }
  }

  function handleElementSelect(el: InteractiveElement) {
    setSelectedElement(el.ref)
  }

  const filteredElements = elements.filter(el => {
    if (!elementFilter) return true
    const q = elementFilter.toLowerCase()
    return el.tag.includes(q) || el.text.toLowerCase().includes(q) ||
      (el.href || '').toLowerCase().includes(q) ||
      (el.placeholder || '').toLowerCase().includes(q)
  })

  // Detect if URL has changed (navigation happened)
  useEffect(() => {
    if (activeSession) {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
    }
  }, [activeTab?.url])

  // When session changes, refresh
  useEffect(() => {
    if (activeSessionId) {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      setScreenshot(null)
      setElements([])
    }
  }, [activeSessionId])

  // When tab changes, refresh
  useEffect(() => {
    if (activeTabId && activeSessionId) {
      setScreenshot(null)
      setElements([])
    }
  }, [activeTabId])

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* ===== LEFT SIDEBAR ===== */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-border">
        <div className="p-3 border-b border-border">
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            新建浏览器
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              暂无浏览器会话<br />点击上方按钮创建
            </div>
          ) : (
            <div className="p-2">
              {sessions.map(session => (
                <div key={session.id} className="mb-1">
                  {/* Session header */}
                  <button
                    onClick={() => {
                      setActiveSessionId(session.id)
                      setActiveTabId(session.activeTab || null)
                      setScreenshot(null)
                      setElements([])
                    }}
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      session.id === activeSessionId ? 'bg-primary/20 text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1 truncate text-xs font-medium">{session.name}</span>
                    <span className="text-xs text-muted-foreground">{session.tabs.length}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(session.id) }}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>

                  {/* Tabs */}
                  {session.id === activeSessionId && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {session.tabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTabId(tab.id)
                            activateTabMutation.mutate(tab.id)
                            setScreenshot(null)
                            setElements([])
                          }}
                          className={`w-full flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
                            tab.id === (activeTabId || session.activeTab) ? 'bg-accent' : 'hover:bg-accent/50'
                          }`}
                        >
                          <div className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            tab.status === 'loading' ? 'bg-yellow-500 animate-pulse' :
                            tab.status === 'error' ? 'bg-red-500' : 'bg-green-500'
                          }`} />
                          <span className="flex-1 truncate text-muted-foreground">{tab.title || '新标签页'}</span>
                          {session.tabs.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); closeTabMutation.mutate(tab.id) }}
                              className="hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== MAIN AREA ===== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Error banner */}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-2 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Toolbar */}
        {activeSession && activeTab && (
          <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
            {/* Back */}
            <button
              onClick={() => backMutation.mutate()}
              disabled={activeTab.historyIndex <= 0}
              className="rounded p-1.5 hover:bg-accent disabled:opacity-30"
              title="后退"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {/* Forward */}
            <button
              onClick={() => forwardMutation.mutate()}
              disabled={activeTab.historyIndex >= activeTab.history.length - 1}
              className="rounded p-1.5 hover:bg-accent disabled:opacity-30"
              title="前进"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            {/* Refresh */}
            <button
              onClick={refreshView}
              disabled={screenshotMutation.isPending}
              className="rounded p-1.5 hover:bg-accent"
              title="刷新"
            >
              <RotateCcw className={`h-4 w-4 ${screenshotMutation.isPending ? 'animate-spin' : ''}`} />
            </button>

            {/* URL bar */}
            <div className="flex-1 flex items-center rounded border border-input bg-background px-3 py-1 mx-1">
              <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground mr-2" />
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNavigate()}
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="输入 URL..."
              />
            </div>

            {/* Scroll */}
            <button
              onClick={() => scrollMutation.mutate('up')}
              disabled={scrollMutation.isPending}
              className="rounded p-1.5 hover:bg-accent"
              title="向上滚动"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollMutation.mutate('down')}
              disabled={scrollMutation.isPending}
              className="rounded p-1.5 hover:bg-accent"
              title="向下滚动"
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* Screenshot */}
            <button
              onClick={() => { screenshotMutation.mutate(); snapshotMutation.mutate() }}
              disabled={screenshotMutation.isPending}
              className="rounded p-1.5 hover:bg-accent"
              title="截图"
            >
              <Camera className={`h-4 w-4 ${screenshotMutation.isPending ? 'animate-pulse' : ''}`} />
            </button>

            {/* New tab */}
            <button
              onClick={() => createTabMutation.mutate()}
              disabled={createTabMutation.isPending}
              className="rounded p-1.5 hover:bg-accent"
              title="新建标签页"
            >
              <Plus className="h-4 w-4" />
            </button>

            {/* Element panel toggle */}
            <button
              onClick={() => setShowElementPanel(v => !v)}
              className={`rounded p-1.5 ${showElementPanel ? 'bg-primary/20 text-primary' : 'hover:bg-accent'}`}
              title="元素面板"
            >
              <Layers className="h-4 w-4" />
            </button>

            {/* Scale */}
            <select
              value={imageScale}
              onChange={e => setImageScale(parseFloat(e.target.value))}
              className="rounded border border-input bg-background px-1.5 py-1 text-xs"
            >
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
              <option value={2}>200%</option>
            </select>
          </div>
        )}

        {/* Browser viewport */}
        <div className="flex-1 overflow-auto bg-muted/50 p-4">
          {!activeSession ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Globe className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-3 text-sm">选择或创建一个浏览器会话开始</p>
                <button
                  onClick={() => createMutation.mutate()}
                  className="mt-3 flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  新建浏览器
                </button>
              </div>
            </div>
          ) : screenshotMutation.isPending ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : screenshot ? (
            <div
              ref={screenshotRef}
              className="relative mx-auto bg-white shadow-lg cursor-crosshair"
              style={{
                width: pageWidth * imageScale,
                height: pageHeight * imageScale,
                transform: 'none',
              }}
              onClick={handleScreenshotClick}
            >
              {/* Screenshot image */}
              <img
                src={screenshot}
                alt="Page screenshot"
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', objectFit: 'fill' }}
                draggable={false}
              />

              {/* Element overlays */}
              <div className="absolute inset-0 pointer-events-none">
                {elements.map(el => {
                  const isHovered = hoveredElement === el.ref
                  const isSelected = selectedElement === el.ref
                  return (
                    <div
                      key={el.ref}
                      className={`absolute pointer-events-auto transition-colors ${
                        isSelected ? 'bg-blue-500/30 ring-2 ring-blue-500' :
                        isHovered ? 'bg-yellow-400/30 ring-1 ring-yellow-400' :
                        'hover:bg-blue-500/20'
                      }`}
                      style={{
                        left: el.rect.x * imageScale,
                        top: el.rect.y * imageScale,
                        width: Math.max(el.rect.w * imageScale, 4),
                        height: Math.max(el.rect.h * imageScale, 4),
                      }}
                      title={`${el.tag}: ${el.text || el.href || el.placeholder || ''}`}
                      onMouseEnter={() => setHoveredElement(el.ref)}
                      onMouseLeave={() => setHoveredElement(null)}
                      onClick={(e) => { e.stopPropagation(); handleElementClick(el.ref) }}
                    >
                      {isHovered && (
                        <span className="absolute -top-5 left-0 bg-black/70 text-white text-[10px] px-1 rounded whitespace-nowrap z-50">
                          {el.ref} {el.tag} {el.text?.slice(0, 30)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Camera className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-3 text-sm">输入 URL 或点击刷新加载页面</p>
                <button
                  onClick={() => { screenshotMutation.mutate(); snapshotMutation.mutate() }}
                  className="mt-3 flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-accent mx-auto"
                >
                  <Camera className="h-4 w-4" />
                  截图
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ===== ELEMENT PANEL ===== */}
        {showElementPanel && activeSession && (
          <div className="border-t border-border bg-card">
            {/* Panel header */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium flex-1">可交互元素 ({elements.length})</span>
              <input
                type="text"
                placeholder="过滤..."
                value={elementFilter}
                onChange={e => setElementFilter(e.target.value)}
                className="rounded border border-input bg-background px-2 py-0.5 text-xs w-32"
              />
              {selectedElement && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-blue-400">{selectedElement}</span>
                  <button
                    onClick={() => setSelectedElement(null)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Element list */}
            <div className="max-h-40 overflow-y-auto">
              {filteredElements.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {elements.length === 0 ? '加载元素...' : '无匹配元素'}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground w-12">Ref</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground w-16">类型</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">内容</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">位置</th>
                      <th className="px-2 py-1 text-right font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredElements.map((el) => (
                      <tr
                        key={el.ref}
                        className={`border-t border-border hover:bg-accent/50 cursor-pointer ${
                          selectedElement === el.ref ? 'bg-blue-500/10' : ''
                        }`}
                        onClick={() => handleElementSelect(el)}
                      >
                        <td className="px-2 py-1 font-mono text-blue-400">{el.ref}</td>
                        <td className="px-2 py-1">
                          <span className={`rounded px-1 py-0.5 text-[10px] ${
                            el.tag === 'a' ? 'bg-blue-500/20 text-blue-400' :
                            el.tag === 'button' ? 'bg-green-500/20 text-green-400' :
                            el.tag === 'input' || el.tag === 'textarea' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {el.tag}
                            {el.type ? `:${el.type}` : ''}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-[200px]" title={el.text}>
                          {el.tag === 'a' && el.href ? (
                            <span className="truncate">{el.text || el.href}</span>
                          ) : (
                            <span>{el.text || el.placeholder || <em className="text-muted">无文字</em>}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground font-mono text-[10px]">
                          {el.rect.w > 0 && el.rect.h > 0
                            ? `${el.rect.x},${el.rect.y} ${el.rect.w}×${el.rect.h}`
                            : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {el.tag === 'a' && el.href && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigateMutation.mutate({ url: el.href!.startsWith('http') ? el.href! : `https://${el.href}` })
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-blue-500/20 text-blue-400 text-[10px]"
                              >
                                跳转
                              </button>
                            )}
                            {(el.tag === 'input' && (el.type === 'text' || !el.type) || el.tag === 'textarea') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const text = prompt('输入文本:')
                                  if (text) typeMutation.mutate({ ref: el.ref, text })
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-yellow-500/20 text-yellow-400 text-[10px]"
                              >
                                输入
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleElementClick(el.ref) }}
                              className="rounded px-1.5 py-0.5 hover:bg-green-500/20 text-green-400 text-[10px]"
                            >
                              点击
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
