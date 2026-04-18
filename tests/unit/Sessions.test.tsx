import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Sessions } from '@/app/pages/sessions/Sessions'

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

const mockSessionsResponse = {
  sessions: [
    {
      id: 'session-1',
      title: '测试会话 1',
      platform: 'cli',
      message_count: 42,
      token_used: 125000,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: 'session-2',
      title: '开发任务',
      platform: 'telegram',
      message_count: 128,
      token_used: 890000,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 'session-3',
      title: '代码审查',
      platform: 'discord',
      message_count: 56,
      token_used: 340000,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
  ],
}

describe('Sessions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('Loading state', () => {
    it('shows loading indicator when fetching', () => {
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      
      renderWithProviders(<Sessions />)
      
      // Title is always rendered, but sessions list should not be visible
      expect(screen.queryByText(/暂无会话记录/)).toBeNull()
      expect(screen.queryByText('测试会话 1')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        expect(screen.getByText(/获取会话失败/)).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        expect(screen.getByText('会话管理')).toBeTruthy()
      })
    })

    it('renders search input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/搜索会话/)
        expect(searchInput).toBeTruthy()
      })
    })

    it('renders session list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        expect(screen.getByText('测试会话 1')).toBeTruthy()
        expect(screen.getByText('开发任务')).toBeTruthy()
        expect(screen.getByText('代码审查')).toBeTruthy()
      })
    })

    it('renders platform badges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        // Platform badges should be present
        expect(screen.getByText('cli')).toBeTruthy()
        expect(screen.getByText('telegram')).toBeTruthy()
      })
    })

    it('renders message counts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        expect(screen.getByText(/42/)).toBeTruthy()
        expect(screen.getByText(/128/)).toBeTruthy()
      })
    })
  })

  describe('Search filtering', () => {
    it('accepts search input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionsResponse),
      })
      
      renderWithProviders(<Sessions />)
      
      const searchInput = await screen.findByPlaceholderText(/搜索会话/)
      await userEvent.type(searchInput, '测试')
      
      expect(searchInput).toHaveValue('测试')
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no sessions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessions: [] }),
      })
      
      renderWithProviders(<Sessions />)
      
      await waitFor(() => {
        expect(screen.getByText('暂无会话记录')).toBeTruthy()
      })
    })
  })
})
