/**
 * 工具调用页面对应 Agent 能力：40+ 内置工具 + MCP 扩展
 * @see CONSTITUTION.md 第二章 2.2.11
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Power, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { ToolsetInfo } from '@/lib/api'

async function fetchToolsets() {
  return api.getToolsets()
}

export function Tools() {
  const queryClient = useQueryClient()
  const { data: toolsets, isLoading, error } = useQuery({
    queryKey: ['toolsets'],
    queryFn: fetchToolsets,
  })
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleMutation = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      return api.toggleToolset(name, enabled)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['toolsets'] })
    },
  })

  if (isLoading) return <div className="text-muted-foreground">加载中...</div>
  if (error) return <div className="text-destructive">获取工具失败</div>

  const toolsetsList: ToolsetInfo[] = Array.isArray(toolsets) ? toolsets : []

  const filtered = toolsetsList.filter((ts) => {
    const matchSearch = search === '' ||
      ts.name.toLowerCase().includes(search.toLowerCase()) ||
      ts.description?.toLowerCase().includes(search.toLowerCase()) ||
      ts.tools.some(t => t.toLowerCase().includes(search.toLowerCase()))
    return matchSearch
  })

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">工具集</h2>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索工具集或工具..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-sm">没有找到匹配的工具集</p>
        )}
        {filtered.map((ts) => (
          <div key={ts.name} className="rounded-lg border border-border overflow-hidden">
            {/* Toolset header */}
            <div
              className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
              onClick={() => toggleExpand(ts.name)}
            >
              {expanded.has(ts.name) ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium flex-1">{ts.name}</span>
              <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                {ts.tools.length} 工具
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleMutation.mutate({ name: ts.name, enabled: !ts.enabled })
                }}
                className={`rounded-full p-1.5 ${
                  ts.enabled
                    ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                title={ts.enabled ? '禁用工具集' : '启用工具集'}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>

            {/* Expanded tool list */}
            {expanded.has(ts.name) && (
              <div className="px-4 py-2 border-t border-border">
                {ts.description && (
                  <p className="text-sm text-muted-foreground mb-3">{ts.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {ts.tools.map((tool) => (
                    <span
                      key={tool}
                      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium ${
                        ts.enabled
                          ? 'bg-background text-foreground border border-border'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
