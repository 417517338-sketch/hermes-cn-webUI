import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Gateway } from '@/app/pages/gateway/Gateway'

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

const mockGatewayRunning = {
  platforms: [
    { id: 'telegram', name: 'Telegram', icon: '📱', enabled: true, status: 'online' as const, has_webhook: true, config: { bot_token: 'xxx' } },
    { id: 'discord', name: 'Discord', icon: '💬', enabled: true, status: 'offline' as const, has_webhook: true, config: null },
  ],
  gateway_running: true,
  pid: 12345,
}

const mockGatewayStopped = {
  platforms: [
    { id: 'telegram', name: 'Telegram', icon: '📱', enabled: false, status: 'configured' as const, has_webhook: true, config: null },
  ],
  gateway_running: false,
  pid: null,
}

describe('Gateway', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading when fetching gateway status', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Gateway />)
      expect(screen.queryByText('消息网关')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText(/获取网关状态失败/)).toBeTruthy()
      })
    })

    it('shows error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('获取网关状态失败')).toBeTruthy()
      })
    })
  })

  describe('Gateway running state', () => {
    it('renders gateway page heading when loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayRunning),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('消息网关')).toBeTruthy()
      })
    })

    it('shows running indicator when gateway is active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayRunning),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText(/PID: 12345/)).toBeTruthy()
      })
    })

    it('shows stop button when gateway is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayRunning),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('停止')).toBeTruthy()
      })
    })
  })

  describe('Gateway stopped state', () => {
    it('shows start button when gateway is stopped', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayStopped),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('消息网关')).toBeTruthy()
      })
    })

    it('shows stopped indicator when gateway is not running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayStopped),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('已停止')).toBeTruthy()
      })
    })
  })

  describe('Platform list', () => {
    it('renders platform names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGatewayRunning),
      })
      renderWithProviders(<Gateway />)
      await waitFor(() => {
        expect(screen.getByText('Telegram')).toBeTruthy()
        expect(screen.getByText('Discord')).toBeTruthy()
      })
    })
  })
})
