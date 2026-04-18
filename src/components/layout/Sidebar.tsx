import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  BarChart3,
  ScrollText,
  Clock,
  Wrench,
  Settings2,
  Key,
  Brain,
  Layers,
  Terminal,
  Share2,
  Bot,
  Globe,
  ChevronLeft,
  ChevronRight,
  Power,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '状态看板' },
  { to: '/chat', icon: MessageCircle, label: '对话界面' },
  { to: '/sessions', icon: MessageSquare, label: '会话管理' },
  { to: '/analytics', icon: BarChart3, label: '用量分析' },
  { to: '/logs', icon: ScrollText, label: '系统日志' },
  { to: '/cron', icon: Clock, label: '定时任务' },
  { to: '/skills', icon: Wrench, label: '技能管理' },
  { to: '/config', icon: Settings2, label: '配置中心' },
  { to: '/keys', icon: Key, label: '密钥管理' },
  { to: '/memory', icon: Brain, label: '内存管理' },
  { to: '/tools', icon: Layers, label: '工具调用' },

  { to: '/terminal', icon: Terminal, label: '终端界面' },
  { to: '/gateway', icon: Share2, label: '消息网关' },
  { to: '/delegation', icon: Bot, label: '子 Agent 委派' },
  { to: '/settings', icon: Settings2, label: '系统设置' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex h-14 items-center border-b border-border px-4">
        {!collapsed && (
          <h1 className="text-lg font-bold text-primary">hermes-cn-webUI</h1>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center border-t border-border text-muted-foreground hover:bg-accent"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  )
}
