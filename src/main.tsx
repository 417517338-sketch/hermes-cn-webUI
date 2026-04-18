import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './app/App'
import './styles/globals.css'
import { api } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

import { applyThemeVars } from './lib/theme'
async function applyTheme() {
  try {
    const info = await api.getSystemInfo()
    applyThemeVars(info.theme)
  } catch {
    // Fallback: use system preference
    applyThemeVars('system')
  }
}

applyTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
)
