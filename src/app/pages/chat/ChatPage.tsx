/**
 * ChatPage - 多标签页对话管理
 * @description 管理多个独立的对话标签页，类似浏览器 tab
 * @description 使用 localStorage 在 tab 切换时保持对话内容
 * @description 注意：Tab 切换器已移入 Chat 组件内部，放在快捷模板下方
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chat } from './Chat'
import { Plus, X, MessageSquare } from 'lucide-react'

interface TabInfo {
  id: string
  title: string
}

interface PlatformTabInfo {
  id: string
  title: string
  platform: 'weixin' | 'feishu'
  sessionId: string
}

const STORAGE_KEY = 'hermes_chat_tabs'
const ACTIVE_TAB_KEY = 'hermes_chat_active_tab'
const PLATFORM_TABS_KEY = 'hermes_chat_platform_tabs'

function loadTabs(): TabInfo[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {}
  return [{ id: 'default', title: '对话 1' }]
}

function loadActiveTabId(): string {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY) || 'default'
  } catch {}
  return 'default'
}

function loadPlatformTabs(): PlatformTabInfo[] {
  try {
    const saved = localStorage.getItem(PLATFORM_TABS_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {}
  return []
}

function saveTabs(tabs: TabInfo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch {}
}

function saveActiveTabId(id: string) {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, id)
  } catch {}
}

function savePlatformTabs(tabs: PlatformTabInfo[]) {
  try {
    localStorage.setItem(PLATFORM_TABS_KEY, JSON.stringify(tabs))
  } catch {}
}

interface PlatformInfo {
  id: string
  source: string
  user_id: string
  title: string
  started_at: string
  recent_count: number
}

export function ChatPage() {
  const [tabs, setTabs] = useState<TabInfo[]>(() => loadTabs())
  const [activeTabId, setActiveTabId] = useState<string>(() => loadActiveTabId())
  const [tabCounter, setTabCounter] = useState<number>(() => {
    return loadTabs().length
  })
  const [platformTabs, setPlatformTabs] = useState<PlatformTabInfo[]>(() => loadPlatformTabs())

  // 持久化 tabs
  useEffect(() => {
    saveTabs(tabs)
  }, [tabs])

  // 持久化 active tab
  useEffect(() => {
    saveActiveTabId(activeTabId)
  }, [activeTabId])

  // 持久化 platform tabs
  useEffect(() => {
    savePlatformTabs(platformTabs)
  }, [platformTabs])

  // 获取可用平台列表
  const { data: platformsData } = useQuery<{ platforms: PlatformInfo[] }>({
    queryKey: ['platforms'],
    queryFn: async () => {
      const res = await fetch('/api/platforms')
      if (!res.ok) throw new Error('Failed to fetch platforms')
      return res.json()
    },
    refetchInterval: 10000,
  })

  // 新建标签页
  const handleNewTab = () => {
    const newTabId = `tab_${Date.now()}`
    const newTabNumber = tabCounter + 1
    setTabCounter(newTabNumber)
    const newTab = { id: newTabId, title: `对话 ${newTabNumber}` }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTabId)
  }

  // 关闭标签页
  const handleCloseTab = (tabId: string) => {
    // 检查是否是平台标签页
    const isPlatformTab = platformTabs.some(t => t.id === tabId)
    if (isPlatformTab) {
      const newPlatformTabs = platformTabs.filter(t => t.id !== tabId)
      setPlatformTabs(newPlatformTabs)
      if (activeTabId === tabId) {
        const fallback = tabs[0]?.id || 'default'
        setActiveTabId(fallback)
      }
      return
    }

    if (tabs.length <= 1) return

    const tabIndex = tabs.findIndex(t => t.id === tabId)
    const newTabs = tabs.filter(t => t.id !== tabId)
    setTabs(newTabs)

    // 清除该 tab 的 localStorage
    try {
      localStorage.removeItem(`hermes_chat_messages_${tabId}`)
      localStorage.removeItem(`hermes_chat_input_${tabId}`)
    } catch {}

    if (activeTabId === tabId) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1)
      setActiveTabId(newTabs[newActiveIndex].id)
    }
  }

  // 切换标签页
  const handleSwitchTab = (tabId: string) => {
    setActiveTabId(tabId)
  }

  // 选择/创建平台标签页（Bot 按钮触发）
  const handleSelectPlatform = (platform: PlatformInfo) => {
    // 检查是否已存在该平台的标签页
    const existing = platformTabs.find(t => t.platform === platform.source)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    // 创建新的平台标签页
    const newTab: PlatformTabInfo = {
      id: `platform_${platform.source}_${Date.now()}`,
      title: platform.source === 'weixin' ? '微信' : '飞书',
      platform: platform.source as 'weixin' | 'feishu',
      sessionId: platform.id,
    }
    setPlatformTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  // 获取当前活动标签页信息
  const activeTab = [...tabs, ...platformTabs].find(t => t.id === activeTabId) || tabs[0]

  // 判断当前是否是平台标签页
  const activePlatformTab = platformTabs.find(t => t.id === activeTabId)

  return (
    <div className="flex h-full flex-col">
      {/* 标签页内容 - Tab 切换器已移入 Chat 组件内部 */}
      <div className="flex-1 overflow-hidden">
        {/* key={activeTabId} 强制 tab 切换时重新挂载 Chat 组件，以加载正确的 localStorage 数据 */}
        <Chat
          key={activeTabId}
          tabId={activeTabId}
          tabTitle={activeTab?.title || '对话 1'}
          tabs={tabs}
          onNewTab={handleNewTab}
          onSwitchTab={handleSwitchTab}
          onCloseTab={handleCloseTab}
          availablePlatforms={platformsData?.platforms || []}
          isActive={true}
        />
      </div>
    </div>
  )
}
