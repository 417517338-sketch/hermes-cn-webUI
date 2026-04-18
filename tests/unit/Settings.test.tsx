import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from '@/app/pages/settings/Settings'

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

const mockSystemInfo = {
  webui_version: '2.2.0',
  agent_version: '0.8.0',
  hermes_home: '/Users/user/.hermes',
  node_version: 'v20.0.0',
  platform: 'darwin',
  theme: 'dark',
  language: 'zh',
}

const createLicenseResponse = (tier: 'L1' | 'L2' | 'L3' = 'L2', tierLevel = 2) => ({
  tier,
  tier_level: tierLevel,
  features: ['chat', 'sessions', 'config', 'skills', 'tools', 'memory', 'cron', 'browser', 'delegation', 'gateway', 'analytics', 'terminal'],
  expires_at: '2027-12-31',
  seats: tierLevel >= 2 ? 3 : 1,
  is_trial: false,
  activation_code: 'HERMES-L2-20261231-ABC123',
  company: 'Test Company',
})

describe('Settings', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('Loading state', () => {
    it('shows loading spinner when fetching', () => {
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      
      renderWithProviders(<Settings />)
      
      // Should not show main title while loading
      expect(screen.queryByText('系统设置')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when system info fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.getByText(/获取系统信息失败/)).toBeTruthy()
      })
    })

    it('shows retry button on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.getByText('重试')).toBeTruthy()
      })
    })
  })

  describe('License display', () => {
    it('renders license status for L1 tier', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1', 1)),
      })
      
      renderWithProviders(<Settings />)
      
      // Wait for main title to appear
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()
      }, { timeout: 3000 })
    })
  })

  describe('License activation form', () => {
    it('renders activation input when no license exists', async () => {
      // Mock empty license (no stored license)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null), // no license
      })
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('XXXX-XXXX-XXXX-XXXX')).toBeTruthy()
      }, { timeout: 3000 })
    })

    it('renders activation button when no license exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      })
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /激活/ })).toBeTruthy()
      }, { timeout: 3000 })
    })

    it('accepts license key input when no license exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      })
      
      renderWithProviders(<Settings />)
      
      const input = await screen.findByPlaceholderText('XXXX-XXXX-XXXX-XXXX')
      await userEvent.type(input, 'HERMES-L2-20261231-TEST12')
      
      expect(input).toHaveValue('HERMES-L2-20261231-TEST12')
    })
  })

  describe('Page structure', () => {
    it('renders settings page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L2', 2)),
      })
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: '设置' })).toBeTruthy()
      }, { timeout: 3000 })
    })

    it('renders theme section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemInfo),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L2', 2)),
      })
      
      renderWithProviders(<Settings />)
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 3, name: '主题' })).toBeTruthy()
      }, { timeout: 3000 })
    })
  })
})
