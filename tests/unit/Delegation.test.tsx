import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Delegation } from '@/app/pages/delegation/Delegation'

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

const mockTasks = [
  {
    id: 'task-1',
    goal: '研究量子计算的发展趋势',
    context: '需要一份技术报告',
    model: 'gpt-4o',
    provider: 'openai',
    toolsets: ['web_search'],
    status: 'done' as const,
    created_at: '2026-04-15T10:00:00Z',
    finished_at: '2026-04-15T10:05:00Z',
    result: '量子计算研究报告已完成',
  },
  {
    id: 'task-2',
    goal: '分析竞争对手的产品',
    status: 'running' as const,
    created_at: '2026-04-16T09:00:00Z',
  },
]

const mockActivatedLicense = {
  tier: 'L2',
  tier_level: 2,
  features: ['delegation', 'terminal'],
  expires_at: '2027-12-31',
  seats: 3,
  is_trial: false,
}

describe('Delegation', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Mock based on URL - works for both parallel calls
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/license') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      }
      if (url === '/api/delegation') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tasks: mockTasks }),
        })
      }
      return new Promise(() => {})
    })
  })

  describe('Data display', () => {
    it('renders delegation page heading when loaded', async () => {
      renderWithProviders(<Delegation />)
      await waitFor(() => {
        expect(screen.getByText('子 Agent 委派')).toBeTruthy()
      })
    })

    it('renders task goals', async () => {
      renderWithProviders(<Delegation />)
      await waitFor(() => {
        expect(screen.getByText('研究量子计算的发展趋势')).toBeTruthy()
      })
    })

    it('renders multiple tasks', async () => {
      renderWithProviders(<Delegation />)
      await waitFor(() => {
        expect(screen.getByText('分析竞争对手的产品')).toBeTruthy()
      })
    })
  })


})
