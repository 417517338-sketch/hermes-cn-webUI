import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Analytics } from '@/app/pages/analytics/Analytics'

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

const mockAnalyticsResponse = {
  totals: {
    total_input: 1000000,
    total_output: 500000,
    total_cache_read: 300000,
    total_estimated_cost: 25.50,
    total_sessions: 150,
  },
  daily: [
    { day: '2026-04-01', input_tokens: 50000, output_tokens: 25000, estimated_cost: 1.25 },
    { day: '2026-04-02', input_tokens: 60000, output_tokens: 30000, estimated_cost: 1.50 },
  ],
  by_model: [
    { model: 'gpt-4o', input_tokens: 700000, output_tokens: 350000, sessions: 100 },
    { model: 'gpt-4o-mini', input_tokens: 300000, output_tokens: 150000, sessions: 50 },
  ],
}

describe('Analytics', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading when fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Analytics />)
      expect(screen.queryByText('用量分析')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      renderWithProviders(<Analytics />)
      await waitFor(() => {
        expect(screen.getByText('获取用量失败')).toBeTruthy()
      })
    })
  })
})
