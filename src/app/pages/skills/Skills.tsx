/**
 * 技能管理页面对应 Agent 能力：/skills, agentskills.io
 * @see CONSTITUTION.md 第二章 2.2.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Power, Upload, Info, X, ChevronRight, FileText, Tag, Loader2 } from 'lucide-react'
import { useState, useCallback } from 'react'

interface Skill {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  triggers?: string[]
  parameters?: Record<string, string>
  examples?: string[]
}

async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch('/api/skills')
  if (!res.ok) throw new Error('Failed to fetch skills')
  return res.json()
}

export function Skills() {
  return (
    <SkillsContent />
  )
}

function SkillsContent() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  })

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importName, setImportName] = useState('')

  const skills: Skill[] = data || []
  const categories = ['all', ...new Set(skills.map((s) => s.category))]

  const filteredSkills = skills.filter((skill) => {
    const matchSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase())
    const matchCategory = activeTab === 'all' || skill.category === activeTab
    return matchSearch && matchCategory
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to toggle skill')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })

  const handleToggle = useCallback((skill: Skill) => {
    toggleMutation.mutate({ id: skill.id, enabled: !skill.enabled })
  }, [toggleMutation])

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: importName, content: importContent }),
      })
      if (!res.ok) throw new Error('Failed to import skill')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      setShowImportModal(false)
      setImportContent('')
      setImportName('')
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">获取技能列表失败</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">技能管理</h2>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          <Upload className="h-4 w-4" />
          导入技能
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索技能..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              activeTab === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {cat === 'all' ? '全部' : cat}
            {cat !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({skills.filter((s) => s.category === cat).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Skills Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{skill.name}</h3>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                      skill.enabled
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {skill.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {skill.description}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  {skill.category}
                </span>
              </div>
              <button
                onClick={() => handleToggle(skill)}
                disabled={toggleMutation.isPending}
                className={`ml-2 shrink-0 rounded p-1.5 transition-colors ${
                  skill.enabled
                    ? 'text-green-500 hover:bg-green-500/10'
                    : 'text-muted-foreground hover:bg-accent'
                } disabled:opacity-50`}
                title={skill.enabled ? '禁用技能' : '启用技能'}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setSelectedSkill(skill)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded bg-muted py-1.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
            >
              <Info className="h-3 w-3" />
              查看详情
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="mt-4 font-medium">未找到技能</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            尝试调整搜索条件或导入新技能
          </p>
        </div>
      )}

      {/* Skill Detail Sidebar */}
      {selectedSkill && (
        <SkillDetailPanel
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onToggle={() => handleToggle(selectedSkill)}
          isToggling={toggleMutation.isPending}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-lg font-semibold">导入技能</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded p-1 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">技能名称</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  placeholder="例如：my-custom-skill"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">技能内容 (SKILL.md)</label>
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  className="w-full min-h-[300px] resize-none rounded border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder="粘贴技能内容..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="rounded border border-border px-4 py-2 text-sm hover:bg-accent"
                >
                  取消
                </button>
                <button
                  onClick={() => importMutation.mutate()}
                  disabled={!importName || !importContent || importMutation.isPending}
                  className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Skill Detail Sidebar Component
interface SkillDetailPanelProps {
  skill: Skill
  onClose: () => void
  onToggle: () => void
  isToggling: boolean
}

function SkillDetailPanel({ skill, onClose, onToggle, isToggling }: SkillDetailPanelProps) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-lg">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-semibold">{skill.name}</h3>
            <span className="text-sm text-muted-foreground">{skill.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              disabled={isToggling}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${
                skill.enabled
                  ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20'
                  : 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
              } disabled:opacity-50`}
            >
              <Power className="h-4 w-4" />
              {skill.enabled ? '禁用' : '启用'}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">状态</h4>
            <span
              className={`inline-flex items-center rounded px-2 py-1 text-sm ${
                skill.enabled
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {skill.enabled ? '已启用' : '已禁用'}
            </span>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">描述</h4>
            <p className="text-sm leading-relaxed">{skill.description}</p>
          </div>

          {/* Triggers */}
          {skill.triggers && skill.triggers.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">触发词</h4>
              <div className="flex flex-wrap gap-1.5">
                {skill.triggers.map((trigger) => (
                  <span
                    key={trigger}
                    className="rounded bg-muted px-2 py-0.5 text-xs font-mono"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Parameters */}
          {skill.parameters && Object.keys(skill.parameters).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">参数</h4>
              <div className="space-y-2">
                {Object.entries(skill.parameters).map(([key, desc]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {key}
                    </code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {skill.examples && skill.examples.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">示例</h4>
              <div className="space-y-2">
                {skill.examples.map((example, i) => (
                  <div
                    key={i}
                    className="rounded bg-muted p-3 font-mono text-xs"
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
