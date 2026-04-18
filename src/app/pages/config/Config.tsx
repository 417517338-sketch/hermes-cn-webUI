/**
 * 配置中心页面
 * @description 宪法 2.2.8 配置中心 (/config)
 * - 真实读取 config.yaml 全量配置
 * - 只展示常用配置项，其他归入「高级设置」
 * - 保存时后端 deep merge，结构不损坏
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Download, Upload, RefreshCw, Check, X, AlertTriangle,
  ChevronDown, ChevronRight, Settings2
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// ============================================================================
// 类型定义
// ============================================================================

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | JsonValueObject
interface JsonValueObject { [key: string]: JsonValue }

// ============================================================================
// 配置项定义（中文标签 + 说明，来源追踪到真实 YAML 路径）
// ============================================================================

// 注意：provider 和 model options 通过 useQuery 从 /api/models 动态获取

interface FieldDef {
  key: string           // YAML key
  label: string         // 中文标签
  description?: string  // 中文说明
  type: 'string' | 'number' | 'boolean' | 'select'
  options?: string[]    // select 模式的可选值（可由 API 动态填充）
}

interface ConfigGroup {
  key: string
  label: string
  description?: string
  defaultExpanded?: boolean
  fields: FieldDef[]
}

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    key: 'model',
    label: '模型配置',
    description: 'AI 模型提供商和默认模型',
    defaultExpanded: true,
    fields: [
      { key: 'provider', label: '提供商', type: 'select', description: '从已配置的 API Key 中选择' },
      { key: 'default', label: '默认模型', type: 'select', description: '选择默认使用的模型' },
      { key: 'base_url', label: 'API 地址', type: 'string', description: '自定义 API 端点（可选）' },
    ],
  },
  {
    key: 'agent',
    label: 'Agent 行为',
    description: 'Agent 迭代和推理参数',
    defaultExpanded: false,
    fields: [
      { key: 'max_turns', label: '最大迭代次数', type: 'number', description: '单次对话最大循环次数' },
      { key: 'reasoning_effort', label: '推理力度', type: 'select', options: ['low', 'medium', 'high'], description: 'Agent 推理深度' },
    ],
  },
  {
    key: 'memory',
    label: '记忆配置',
    description: '长期记忆和用户画像参数',
    defaultExpanded: false,
    fields: [
      { key: 'memory_enabled', label: '启用记忆', type: 'boolean', description: '是否开启长期记忆' },
      { key: 'memory_char_limit', label: '记忆字符上限', type: 'number', description: '单条记忆的最大字符数' },
      { key: 'user_char_limit', label: '用户信息上限', type: 'number', description: '用户画像的最大字符数' },
    ],
  },
  {
    key: 'display',
    label: '显示偏好',
    description: '界面显示和行为选项',
    defaultExpanded: false,
    fields: [
      { key: 'personality', label: '人格风格', type: 'select', options: ['kawaii', 'professional', 'minimal', 'verbose'], description: 'Agent 回复风格' },
      { key: 'streaming', label: '流式输出', type: 'boolean', description: '逐字显示回复（打字机效果）' },
      { key: 'bell_on_complete', label: '完成后响铃', type: 'boolean', description: '回复完成后播放提示音' },
      { key: 'show_reasoning', label: '显示推理过程', type: 'boolean', description: '在回复中显示思考链' },
    ],
  },
  {
    key: 'terminal',
    label: '终端配置',
    description: '终端后端和 shell 设置',
    defaultExpanded: false,
    fields: [
      { key: 'backend', label: '终端后端', type: 'select', options: ['local', 'docker', 'ssh', 'modal'], description: '终端执行环境' },
      { key: 'timeout', label: '命令超时（秒）', type: 'number', description: '单条命令最大执行时间' },
      { key: 'cwd', label: '默认工作目录', type: 'string', description: '新会话的默认工作目录' },
    ],
  },
]

// 高级设置分组（默认折叠）
const ADVANCED_GROUPS: ConfigGroup[] = [
  {
    key: 'container',
    label: '容器配置',
    description: 'Docker/容器环境设置',
    fields: [
      { key: 'docker_image', label: 'Docker 镜像', type: 'string' },
      { key: 'container_cpu', label: 'CPU 核心数', type: 'number' },
      { key: 'container_memory', label: '内存（MB）', type: 'number' },
      { key: 'persistent_shell', label: '持久化 Shell', type: 'boolean' },
    ],
  },
  {
    key: 'compression',
    label: '上下文压缩',
    description: '历史上下文压缩参数',
    fields: [
      { key: 'enabled', label: '启用压缩', type: 'boolean' },
      { key: 'threshold', label: '压缩阈值', type: 'number' },
      { key: 'target_ratio', label: '目标压缩比', type: 'number' },
    ],
  },
  {
    key: 'checkpoints',
    label: '检查点快照',
    description: '会话快照保存策略',
    fields: [
      { key: 'enabled', label: '启用快照', type: 'boolean' },
      { key: 'max_snapshots', label: '最大快照数', type: 'number' },
    ],
  },
  {
    key: 'logging',
    label: '日志配置',
    description: '日志级别和文件轮转',
    fields: [
      { key: 'level', label: '日志级别', type: 'select', options: ['DEBUG', 'INFO', 'WARNING', 'ERROR'] },
      { key: 'max_size_mb', label: '单个日志大小（MB）', type: 'number' },
      { key: 'backup_count', label: '保留日志数', type: 'number' },
    ],
  },
  {
    key: 'code_execution',
    label: '代码执行',
    description: '代码运行时的限制',
    fields: [
      { key: 'timeout', label: '执行超时（秒）', type: 'number' },
      { key: 'max_tool_calls', label: '最大工具调用', type: 'number' },
    ],
  },
  {
    key: 'browser',
    label: '浏览器自动化',
    description: 'Browser 工具超时设置',
    fields: [
      { key: 'inactivity_timeout', label: '空闲超时（秒）', type: 'number' },
      { key: 'command_timeout', label: '命令超时（秒）', type: 'number' },
    ],
  },
  {
    key: 'session_reset',
    label: '会话重置',
    description: '自动重置空闲会话',
    fields: [
      { key: 'mode', label: '重置模式', type: 'select', options: ['off', 'idle', 'at_hour', 'both'] },
      { key: 'idle_minutes', label: '空闲分钟数', type: 'number' },
    ],
  },
  {
    key: 'cron',
    label: '定时任务',
    description: 'Cron 行为选项',
    fields: [
      { key: 'wrap_response', label: '包裹响应', type: 'boolean' },
    ],
  },
]

// 完全隐藏的顶级 key（不展示在界面上）
const HIDDEN_KEYS = new Set([
  'providers', 'fallback_providers', 'credential_pool_strategies', 'toolsets',
  'bedrock', 'smart_model_routing', 'privacy', 'tts', 'stt', 'voice',
  'human_delay', 'delegation', 'context', 'discord', 'whatsapp', 'slack',
  'mattermost', 'telegram', 'approvals', 'security', 'ui', 'dashboard',
  'streaming', 'group_sessions_per_user', 'prefill_messages_file',
  'platform_toolsets', 'auxiliary', 'honcho', 'timezone', 'quick_commands',
  'personalities', 'file_read_max_chars', '_config_version',
])

// ============================================================================
// 工具函数
// ============================================================================

function getNestedValue(obj: JsonValueObject, path: string[]): JsonValue {
  let cur: JsonValue = obj
  for (const k of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return null
    cur = (cur as JsonValueObject)[k]
  }
  return cur
}

function setNestedValue(obj: JsonValueObject, path: string[], value: JsonValue): JsonValueObject {
  const result: JsonValueObject = JSON.parse(JSON.stringify(obj))
  let cur: JsonValueObject = result
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof cur[path[i]] !== 'object' || cur[path[i]] === null || Array.isArray(cur[path[i]])) {
      cur[path[i]] = {} as JsonValueObject
    }
    cur = cur[path[i]] as JsonValueObject
  }
  cur[path[path.length - 1]] = value
  return result
}

function validate(config: JsonValueObject): { path: string; message: string }[] {
  const errors: { path: string; message: string }[] = []
  const agent = config.agent as JsonValueObject | undefined
  if (agent && typeof agent.max_turns === 'number' && agent.max_turns < 1) {
    errors.push({ path: 'agent.max_turns', message: '必须 >= 1' })
  }
  const memory = config.memory as JsonValueObject | undefined
  if (memory) {
    if (typeof memory.memory_char_limit === 'number' && memory.memory_char_limit < 0) {
      errors.push({ path: 'memory.memory_char_limit', message: '必须 >= 0' })
    }
    if (typeof memory.user_char_limit === 'number' && memory.user_char_limit < 0) {
      errors.push({ path: 'memory.user_char_limit', message: '必须 >= 0' })
    }
  }
  // Local/custom provider requires base_url
  const model = config.model as JsonValueObject | undefined
  if (model && model.provider === 'custom') {
    const baseUrl = String(model.base_url || '').trim()
    if (!baseUrl) {
      errors.push({ path: 'model.base_url', message: '本地模型必须填写 API 地址（如 http://localhost:11434）' })
    }
  }
  return errors
}

// ============================================================================
// 主组件
// ============================================================================

export function Config() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig() as Promise<{ config: JsonValueObject }>,
  })

  // 从 models API 动态获取 provider 和 model 选项
  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.getModels() as Promise<{
      all_models: { id: string; provider: string; provider_name: string }[]
    }>,
  })

  const [yamlMode, setYamlMode] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [localConfig, setLocalConfig] = useState<JsonValueObject>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [configErrors, setConfigErrors] = useState<{ path: string; message: string }[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const saveMutation = useMutation({
    mutationFn: (body: JsonValueObject) => api.saveConfig(body as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      refetch()
      setHasChanges(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
    onError: (err: Error) => {
      setSaveError(err.message)
      setTimeout(() => setSaveError(null), 5000)
    },
  })

  // Init from server
  useEffect(() => {
    if (data?.config) {
      setLocalConfig(data.config)
      const yamlLines: string[] = []
      const buildYaml = (obj: JsonValue, indent = 0) => {
        const spaces = '  '.repeat(indent)
        if (obj === null || obj === undefined) return
        if (typeof obj !== 'object') { yamlLines.push(`${spaces}${obj}`); return }
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const itemLines: string[] = []
            buildYaml(item, indent + 1)
            yamlLines.push(`${spaces}-`)
          }
          return
        }
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) { yamlLines.push(`${spaces}${k}: null`); continue }
          if (typeof v !== 'object') { yamlLines.push(`${spaces}${k}: ${v}`) }
          else {
            yamlLines.push(`${spaces}${k}:`)
            buildYaml(v, indent + 1)
          }
        }
      }
      buildYaml(data.config)
      setYamlContent(yamlLines.join('\n') + '\n')
      setConfigErrors(validate(data.config))
      // Expand defaults
      const defaults = new Set(CONFIG_GROUPS.filter(g => g.defaultExpanded).map(g => g.key))
      setExpandedSections(defaults)
    }
  }, [data])

  // Live validation
  useEffect(() => {
    setConfigErrors(validate(localConfig))
  }, [localConfig])

  const handleFieldChange = useCallback((groupKey: string, fieldKey: string, value: JsonValue) => {
    setLocalConfig(prev => setNestedValue(prev, [groupKey, fieldKey], value))
    setHasChanges(true)
  }, [])

  const handleYamlChange = useCallback((content: string) => {
    setYamlContent(content)
    setHasChanges(true)
  }, [])

  const handleSave = useCallback(() => {
    if (configErrors.length > 0) return
    if (yamlMode) {
      api.saveConfigRaw(yamlContent).then(() => {
        queryClient.invalidateQueries({ queryKey: ['config'] })
        refetch()
        setHasChanges(false)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }).catch((err: Error) => {
        setSaveError(err.message)
        setTimeout(() => setSaveError(null), 5000)
      })
    } else {
      saveMutation.mutate(localConfig)
    }
  }, [yamlMode, yamlContent, localConfig, saveMutation, configErrors.length])

  const handleExport = useCallback(() => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hermes-config-${new Date().toISOString().split('T')[0]}.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }, [yamlContent])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml,.yml'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const content = await file.text()
        setYamlContent(content)
        setYamlMode(true)
        setHasChanges(true)
      }
    }
    input.click()
  }, [])

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const getFieldError = (path: string) => configErrors.find(e => e.path === path)?.message

  const getFieldValue = (groupKey: string, fieldKey: string): JsonValue => {
    return getNestedValue(localConfig, [groupKey, fieldKey])
  }

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
          <span className="font-medium">获取配置失败</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">无法连接到服务器，请检查服务状态。</p>
        <button onClick={() => refetch()} className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline">
          <RefreshCw className="h-4 w-4" /> 重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">配置中心</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            真实读取 config.yaml · 修改后 deep merge 保存 · 结构不损坏
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 rounded bg-green-500/20 px-3 py-1.5 text-sm text-green-500">
              <Check className="h-4 w-4" /> 保存成功
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1 rounded bg-destructive/20 px-3 py-1.5 text-sm text-destructive">
              <X className="h-4 w-4" /> {saveError}
            </span>
          )}

          <button onClick={() => setYamlMode(!yamlMode)} className={`rounded px-3 py-1.5 text-sm ${yamlMode ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}>
            {yamlMode ? '表单模式' : 'YAML 模式'}
          </button>
          <button onClick={handleImport} className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> 导入
          </button>
          <button onClick={handleExport} className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> 导出
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending || configErrors.length > 0}
            className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {configErrors.length > 0 && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">配置错误</span>
          </div>
          <ul className="space-y-1 text-sm text-destructive">
            {configErrors.map((err, i) => (
              <li key={i}>• {err.path}: {err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Content */}
      {yamlMode ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium">YAML 源码</span>
            <span className="text-xs text-muted-foreground">直接编辑原始文本 · 保存时后端 deep merge</span>
          </div>
          <textarea
            value={yamlContent}
            onChange={(e) => handleYamlChange(e.target.value)}
            className="min-h-[500px] w-full resize-none bg-transparent p-4 font-mono text-sm focus:outline-none"
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main groups */}
          {CONFIG_GROUPS.map((group) => {
            // 模型分组：动态填充 provider 和 model 下拉选项
            const fieldOptionsOverride: Record<string, string[]> = {}
            if (group.key === 'model' && modelsData?.all_models) {
              // 提取唯一 provider 列表（带显示名）
              const seen = new Set<string>()
              for (const m of modelsData.all_models) {
                if (!seen.has(m.provider)) {
                  seen.add(m.provider)
                }
              }
              fieldOptionsOverride['provider'] = [...seen]
              // 所有模型 ID 列表
              fieldOptionsOverride['default'] = modelsData.all_models.map(m => m.id)
            }
            return (
              <ConfigGroupUI
                key={group.key}
                group={group}
                expanded={expandedSections.has(group.key)}
                onToggle={() => toggleSection(group.key)}
                onFieldChange={handleFieldChange}
                getFieldValue={getFieldValue}
                getFieldError={getFieldError}
                fieldOptionsOverride={fieldOptionsOverride}
                modelProvider={group.key === 'model' ? String(getFieldValue('model', 'provider') ?? '') : ''}
              />
            )
          })}

          {/* Advanced section toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent/50"
          >
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">高级设置</span>
            {showAdvanced ? (
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Advanced groups */}
          {showAdvanced && (
            <div className="space-y-4">
              {ADVANCED_GROUPS.map((group) => (
                <ConfigGroupUI
                  key={group.key}
                  group={group}
                  expanded={expandedSections.has(group.key)}
                  onToggle={() => toggleSection(group.key)}
                  onFieldChange={handleFieldChange}
                  getFieldValue={getFieldValue}
                  getFieldError={getFieldError}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 分组 UI 组件
// ============================================================================

function ConfigGroupUI({
  group,
  expanded,
  onToggle,
  onFieldChange,
  getFieldValue,
  getFieldError,
  fieldOptionsOverride = {},
  modelProvider = '',
}: {
  group: ConfigGroup
  expanded: boolean
  onToggle: () => void
  onFieldChange: (groupKey: string, fieldKey: string, value: JsonValue) => void
  getFieldValue: (groupKey: string, fieldKey: string) => JsonValue
  getFieldError: (path: string) => string | undefined
  fieldOptionsOverride?: Record<string, string[]>
  /** 当前 model.provider 值，用于 custom provider 时动态调整 base_url 描述 */
  modelProvider?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent/50"
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
        <span className="text-sm font-semibold">{group.label}</span>
        {group.description && (
          <span className="text-xs text-muted-foreground">— {group.description}</span>
        )}
      </button>

      {/* Fields */}
      {expanded && (
        <div className="border-t border-border px-4 py-4">
          <div className="grid gap-5 md:grid-cols-2">
            {group.fields.map((field) => {
              const value = getFieldValue(group.key, field.key)
              const fieldError = getFieldError(`${group.key}.${field.key}`)
              // Local/Custom provider → base_url is mandatory, show Ollama default hint
              const isCustomProvider = modelProvider === 'custom'
              const isBaseUrlField = field.key === 'base_url'
              const fieldDescription = isCustomProvider && isBaseUrlField
                ? 'Ollama 地址，如 http://localhost:11434'
                : field.description

              return (
                <div key={field.key} className="relative">
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    {field.label}
                    {field.description && (
                      <span className={isCustomProvider && isBaseUrlField ? 'ml-1.5 text-xs text-amber-500' : 'ml-1.5 text-xs text-muted-foreground'}>（{fieldDescription}）</span>
                    )}
                  </label>

                  {field.type === 'boolean' ? (
                    <button
                      onClick={() => onFieldChange(group.key, field.key, !value)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
                    </button>
                  ) : field.type === 'select' ? (
                    <select
                      value={String(value ?? '')}
                      onChange={(e) => onFieldChange(group.key, field.key, e.target.value)}
                      className={`w-full rounded border bg-background px-3 py-1.5 text-sm ${fieldError ? 'border-destructive' : 'border-input'}`}
                    >
                      <option value="">选择...</option>
                      {(fieldOptionsOverride[field.key] || field.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'number' ? (
                    <div className="relative">
                      <input
                        type="number"
                        value={String(value ?? '')}
                        onChange={(e) => onFieldChange(group.key, field.key, e.target.value === '' ? null : Number(e.target.value))}
                        className={`w-full rounded border bg-background px-3 py-1.5 text-sm ${fieldError ? 'border-destructive' : 'border-input'}`}
                      />
                      {fieldError && (
                        <span className="absolute -bottom-5 left-0 text-xs text-destructive">{fieldError}</span>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={String(value ?? '')}
                        onChange={(e) => onFieldChange(group.key, field.key, e.target.value)}
                        className={`w-full rounded border bg-background px-3 py-1.5 text-sm ${fieldError ? 'border-destructive' : 'border-input'}`}
                      />
                      {fieldError && (
                        <span className="absolute -bottom-5 left-0 text-xs text-destructive">{fieldError}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
