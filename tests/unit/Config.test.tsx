import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Config } from '@/app/pages/config/Config'

const mockFetch = vi.fn()
global.fetch = mockFetch

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0 },
    mutations: { retry: false },
  },
})

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockConfigResponse = {
  config: {
    model: {
      provider: 'openai',
      default_model: 'gpt-4o',
      base_url: '',
    },
    terminal: {
      backend: 'local',
      shell: '/bin/bash',
    },
    agent: {
      max_iterations: 100,
      save_trajectories: true,
    },
    memory: {
      memory_char_limit: 10000,
      user_char_limit: 5000,
    },
  },
}

const mockActivatedLicense = {
  tier: 'L2',
  tier_level: 2,
  features: ['chat', 'sessions', 'config', 'skills', 'tools', 'memory', 'cron', 'browser', 'delegation', 'gateway', 'analytics', 'terminal'],
  expires_at: '2027-12-31',
  seats: 3,
  is_trial: false,
}

describe('Config', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading spinner when fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Config />)
      // Should not show main title while loading
      expect(screen.queryByText('配置中心')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText(/获取配置失败/)).toBeTruthy()
      })
    })

    it('shows retry button on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('重试')).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders config page heading when data loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('配置中心')).toBeTruthy()
      })
    })

    it('renders model config section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('模型配置')).toBeTruthy()
      })
    })

    it('renders terminal config section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('终端配置')).toBeTruthy()
      })
    })

    it('renders agent config section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('Agent 配置')).toBeTruthy()
      })
    })
  })

  describe('YAML mode', () => {
    it('can toggle to YAML mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('配置中心')).toBeTruthy()
      })
      const yamlButton = screen.getByText('YAML 模式')
      await userEvent.click(yamlButton)
      expect(screen.getByText('表单模式')).toBeTruthy()
    })
  })

  describe('Export functionality', () => {
    it('has export button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivatedLicense),
      })
      renderWithProviders(<Config />)
      await waitFor(() => {
        expect(screen.getByText('导出')).toBeTruthy()
      })
    })
  })
})
