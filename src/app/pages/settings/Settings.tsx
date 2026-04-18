/**
 * 系统设置页面
 * @description 宪法 2.2.15 系统设置 (/settings)
 * - 主题切换、语言切换、关于信息
 * - 所有功能默认开放，无需激活
 */
import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Palette, Globe, Info, Download, Upload, Check, AlertTriangle, RefreshCw, ExternalLink, Shield, Edit3 } from 'lucide-react'
import { api } from '@/lib/api'
import { applyThemeVars } from '@/lib/theme'

// 跟踪 system 模式下的 media query 监听器
const _systemThemeMq = new WeakMap<Element, MediaQueryList>()
const _systemThemeHandler = new WeakMap<Element, () => void>()

export function Settings() {
  const queryClient = useQueryClient()
  const { data: systemInfo, isLoading, error, refetch } = useQuery({
    queryKey: ['system'],
    queryFn: api.getSystemInfo,
  })

  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark')
  const [language, setLanguage] = useState('zh')

  useEffect(() => {
    if (systemInfo?.theme) setTheme(systemInfo.theme)
    if (systemInfo?.language) setLanguage(systemInfo.language)
  }, [systemInfo])

  // theme state 变化时同步到 DOM（内联样式 > class，绕过 OS 强制深色）
  useEffect(() => {
    applyThemeVars(theme)
  }, [theme])

  const handleExportBackup = useCallback(async () => {
    try {
      const blob = await api.exportBackup()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hermes-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      console.error('导出备份失败')
    }
  }, [])

  const handleImportBackup = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const formData = new FormData()
        formData.append('backup', file)
        try {
          await api.importBackup(formData)
          queryClient.invalidateQueries({ queryKey: ['system'] })
        } catch {
          console.error('导入备份失败')
        }
      }
    }
    input.click()
  }, [queryClient])

  const handleThemeChange = useCallback(async (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme)
    const root = document.documentElement

    if (newTheme === 'system') {
      applyThemeVars('system')
      // 清理旧监听器
      const oldMq = _systemThemeMq.get(root)
      const oldHandler = _systemThemeHandler.get(root)
      if (oldMq && oldHandler) {
        oldMq.removeEventListener('change', oldHandler)
      }
      // 注册新监听器
      const applySystem = () => applyThemeVars('system')
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      _systemThemeMq.set(root, mq)
      _systemThemeHandler.set(root, applySystem)
      mq.addEventListener('change', applySystem)
    } else {
      applyThemeVars(newTheme)
      // 清理监听器
      const oldMq = _systemThemeMq.get(root)
      const oldHandler = _systemThemeHandler.get(root)
      if (oldMq && oldHandler) {
        oldMq.removeEventListener('change', oldHandler)
        _systemThemeMq.delete(root)
        _systemThemeHandler.delete(root)
      }
    }

    try {
      await api.setTheme(newTheme)
      queryClient.invalidateQueries({ queryKey: ['system'] })
    } catch (err) {
      console.error('Failed to save theme:', err)
    }
  }, [queryClient])

  const handleLanguageChange = useCallback(async (newLang: string) => {
    setLanguage(newLang)
    try {
      await api.setLanguage(newLang)
      queryClient.invalidateQueries({ queryKey: ['system'] })
    } catch (err) {
      console.error('Failed to save language:', err)
    }
  }, [queryClient])

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
          <span className="font-medium">获取系统信息失败</span>
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

  const info = systemInfo || {
    webui_version: '2.4.0',
    agent_version: 'unknown',
    hermes_home: '~/.hermes',
    node_version: 'v20.0.0',
    platform: 'unknown',
    theme: 'dark',
    language: 'zh',
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">设置</h2>

      {/* Theme Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          <h3 className="text-lg font-semibold">主题</h3>
        </div>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              className={`rounded border px-4 py-2 text-sm capitalize ${
                theme === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {t === 'dark' ? '深色' : t === 'light' ? '浅色' : '跟随系统'}
            </button>
          ))}
        </div>
      </section>

      {/* Language Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          <h3 className="text-lg font-semibold">语言</h3>
        </div>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="rounded border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="zh">中文</option>
          {/* <option value="en">English</option> */}
          {/* <option value="ru">Русский</option> */}
        </select>
      </section>

      {/* Backup Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          <h3 className="text-lg font-semibold">数据备份</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            导出备份
          </button>
          <button
            onClick={handleImportBackup}
            className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            <Upload className="h-4 w-4" />
            导入备份
          </button>
        </div>
      </section>

      {/* About Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          <h3 className="text-lg font-semibold">关于</h3>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">WebUI 版本</span>
              <span className="font-mono">{info.webui_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agent 版本</span>
              <span className="font-mono">{info.agent_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Node.js</span>
              <span className="font-mono">{info.node_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hermes 目录</span>
              <span className="font-mono text-xs">{info.hermes_home}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">平台</span>
              <span className="font-mono capitalize">{info.platform}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
