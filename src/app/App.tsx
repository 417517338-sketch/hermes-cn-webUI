import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from './layout/MainLayout'
import { Dashboard } from './pages/dashboard/Dashboard'
import { Sessions } from './pages/sessions/Sessions'
import { Analytics } from './pages/analytics/Analytics'
import { Logs } from './pages/logs/Logs'
import { Cron } from './pages/cron/Cron'
import { Skills } from './pages/skills/Skills'
import { Config } from './pages/config/Config'
import { Keys } from './pages/keys/Keys'
import { Memory } from './pages/memory/Memory'
import { Tools } from './pages/tools/Tools'
import { Browser } from './pages/browser/Browser'
import { Terminal } from './pages/terminal/Terminal'
import { Gateway } from './pages/gateway/Gateway'
import { Delegation } from './pages/delegation/Delegation'
import { ChatPage } from './pages/chat/ChatPage'
import { Settings } from './pages/settings/Settings'
import { Startup } from './pages/startup/Startup'

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/cron" element={<Cron />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/config" element={<Config />} />
        <Route path="/keys" element={<Keys />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/browser" element={<Browser />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/gateway" element={<Gateway />} />
        <Route path="/delegation" element={<Delegation />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/startup" element={<Startup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
