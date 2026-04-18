/**
 * 用量分析页面对应 Agent 能力：Token 用量统计
 * @see CONSTITUTION.md 第二章 2.2.4
 */
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { TrendingUp, DollarSign, Zap, Activity } from 'lucide-react'
import { api } from '@/lib/api'
import type { AnalyticsResponse } from '@/lib/api'

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F']

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatUSD(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return `$${amount.toFixed(2)}`
}

export function Analytics() {
  return <AnalyticsContent />
}

function AnalyticsContent() {
  const { data, isLoading, error } = useQuery<AnalyticsResponse>({
    queryKey: ['analytics', 'usage'],
    queryFn: () => api.getAnalytics(30),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }
  if (error) return <div className="text-destructive">获取用量失败</div>

  const totals = data?.totals
  const daily = data?.daily || []
  const byModel = data?.by_model || []

  // 计算 cache 命中率
  const cacheHitRate = totals && totals.total_input > 0
    ? Math.round((totals.total_cache_read / (totals.total_input + totals.total_output)) * 100)
    : 0

  // Prepare chart data: daily token trend
  const trendData = daily.map((d) => ({
    ...d,
    date: d.day.slice(5), // MM-DD format
    total_tokens: d.input_tokens + d.output_tokens,
  }))

  // Model distribution
  const modelData = byModel.map((m) => ({
    name: m.model.split('-').pop() || m.model,
    fullName: m.model,
    tokens: m.input_tokens + m.output_tokens,
    input: m.input_tokens,
    output: m.output_tokens,
    sessions: m.sessions,
  }))

  // Daily costs from daily entries
  const costData = daily.map((d) => ({
    date: d.day.slice(5),
    cost_usd: d.estimated_cost,
  }))

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">用量分析</h2>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="今日 Token"
          value={formatNumber(daily[daily.length - 1]?.input_tokens + daily[daily.length - 1]?.output_tokens || 0)}
          subtitle={`输入 ${formatNumber(daily[daily.length - 1]?.input_tokens || 0)} / 输出 ${formatNumber(daily[daily.length - 1]?.output_tokens || 0)}`}
          icon={<Zap className="h-5 w-5" />}
        />
        <StatCard
          title="本月 Token"
          value={formatNumber((totals?.total_input || 0) + (totals?.total_output || 0))}
          subtitle={`输入 ${formatNumber(totals?.total_input || 0)} / 输出 ${formatNumber(totals?.total_output || 0)}`}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          title="本月费用"
          value={formatUSD(totals?.total_estimated_cost || 0)}
          subtitle="基于模型定价估算"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Cache 命中率"
          value={`${cacheHitRate}%`}
          subtitle={`读缓存 ${formatNumber(totals?.total_cache_read || 0)} tokens`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {/* Charts Row 1: Token Trend + Model Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Token Trend Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            30 天用量趋势
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={formatNumber} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [formatNumber(value), 'Token']}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="input_tokens"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="输入"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="output_tokens"
                  stroke="#82ca9d"
                  strokeWidth={2}
                  name="输出"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Distribution Pie */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 font-semibold">模型用量分布</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  dataKey="tokens"
                  nameKey="name"
                  label={({ name, percent }) => {
                    const total = modelData.reduce((s, m) => s + m.tokens, 0)
                    const pct = total > 0 ? ((percent / total) * 100).toFixed(1) : '0.0'
                    return `${name} ${pct}%`
                  }}
                  labelLine={false}
                >
                  {modelData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    formatNumber(value),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Daily Costs Bar Chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          日费用趋势
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`$${value.toFixed(4)}`, '费用']}
              />
              <Bar dataKey="cost_usd" fill="#8884d8" radius={[4, 4, 0, 0]} name="日费用" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Usage Detail Table */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 font-semibold">模型用量明细</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">模型</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Token 用量</th>
                <th className="px-4 py-3 text-right text-sm font-medium">会话数</th>
                <th className="px-4 py-3 text-right text-sm font-medium">费用估算</th>
              </tr>
            </thead>
            <tbody>
              {modelData.map((m, index) => (
                <tr key={m.fullName} className="border-b border-border">
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium">{m.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono">
                    {formatNumber(m.tokens)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {m.sessions}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono">
                    ~${(m.tokens * 0.000015).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold">
                <td className="px-4 py-3 text-sm">总计</td>
                <td className="px-4 py-3 text-right text-sm font-mono">
                  {formatNumber((totals?.total_input || 0) + (totals?.total_output || 0))}
                </td>
                <td className="px-4 py-3 text-right text-sm">{totals?.total_sessions || 0}</td>
                <td className="px-4 py-3 text-right text-sm font-mono">
                  ~${(totals?.total_estimated_cost || 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number; positive: boolean } | null
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs mt-1 ${trend.positive ? 'text-green-500' : 'text-red-500'}`}>
          {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </p>
      )}
    </div>
  )
}
