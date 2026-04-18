/**
 * 状态看板页面对应 Agent 能力：hermes status, hermes doctor
 * @see CONSTITUTION.md 第二章 2.2.1
 */
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle,
  Cpu,
  MessageSquare,
  Server,
  Database,
  Wrench,
  Star,
  Clock,
} from 'lucide-react'
import { formatUptime, formatRelativeTime } from '@/lib/dashboard'
import { api } from '@/lib/api'

async function fetchStats() {
  const [status, sessions, skills, toolsets] = await Promise.all([
    api.getStatus(),
    api.getSessions(20, 0),
    api.getSkills(),
    api.getToolsets(),
  ])
  return { status, sessions, skills, toolsets }
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchStats,
    refetchInterval: 5000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }
  if (error) return <div className="text-destructive">获取状态失败</div>

  const { status, sessions, skills, toolsets } = data || {}
  const totalSessions = sessions?.total || 0
  const totalSkills = skills?.length || 0
  const enabledTools = toolsets?.filter((t: { enabled: boolean }) => t.enabled)?.length || 0
  const totalTools = toolsets?.length || 0

  // Recent activity from sessions
  const recentSessions = (sessions?.sessions || [])
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">状态看板</h2>

      {/* 系统状态卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="运行状态"
          value={status?.gateway_running ? '运行中' : '已停止'}
          icon={<Activity className="h-5 w-5" />}
          variant={status?.gateway_running ? 'success' : 'destructive'}
        />
        <StatusCard
          title="健康检查"
          value={status?.gateway_running ? '正常' : '异常'}
          icon={<CheckCircle className="h-5 w-5" />}
          variant={status?.gateway_running ? 'success' : 'destructive'}
        />
        <StatusCard
          title="版本"
          value={status?.version || 'unknown'}
          icon={<Cpu className="h-5 w-5" />}
        />
        <StatusCard
          title="活跃会话"
          value={String(status?.active_sessions || 0)}
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </div>

      {/* 辅助统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="总会话数"
          value={totalSessions}
          icon={<Database className="h-5 w-5" />}
        />
        <StatusCard
          title="技能总数"
          value={totalSkills}
          icon={<Star className="h-5 w-5" />}
        />
        <StatusCard
          title="Hermes 目录"
          value={status?.hermes_home ? '~' : '未知'}
          icon={<Server className="h-5 w-5" />}
        />
      </div>

      {/* 最近活动列表 */}
      <Card title="最近活动">
        <div className="space-y-3">
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无活动记录</p>
          ) : (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-start gap-3 text-sm border-b border-border pb-2 last:border-0"
                >
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{session.title || '无标题'}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{session.message_count} 条消息</span>
                      <span>·</span>
                      <span>{formatRelativeTime(session.last_active)}</span>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  )
}

function StatusCard({
  title,
  value,
  icon,
  variant = 'default',
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  variant?: 'default' | 'success' | 'destructive' | 'warning'
}) {
  const variantClasses = {
    default: 'border-border',
    success: 'border-green-500 bg-green-500/10',
    destructive: 'border-red-500 bg-red-500/10',
    warning: 'border-yellow-500 bg-yellow-500/10',
  }

  return (
    <div className={`rounded-lg border bg-card p-4 ${variantClasses[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </div>
  )
}
