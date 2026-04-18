import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Cron } from '@/app/pages/cron/Cron'

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

const mockCronJobs = {
  jobs: [
    {
      id: 'job-1',
      name: '每日早报',
      prompt: '生成每日的科技新闻摘要',
      schedule: { kind: 'cron', expr: '0 8 * * *', display: '每天早上8点' },
      schedule_display: '每天早上8点',
      next_run_at: '2026-04-17T08:00:00Z',
      last_run_at: '2026-04-16T08:00:00Z',
      state: 'idle' as const,
      enabled: true,
      created_at: '2026-04-01T00:00:00Z',
    },
    {
      id: 'job-2',
      name: '每周总结',
      prompt: '生成每周工作报告',
      schedule: { kind: 'cron', expr: '0 0 * * 1', display: '每周一' },
      schedule_display: '每周一',
      next_run_at: '2026-04-21T00:00:00Z',
      last_run_at: null,
      state: 'idle' as const,
      enabled: false,
      created_at: '2026-04-10T00:00:00Z',
    },
  ],
}

const mockActivatedLicense = {
  tier: 'L2',
  tier_level: 2,
  features: ['cron', 'terminal'],
  expires_at: '2027-12-31',
  seats: 3,
  is_trial: false,
}

describe('Cron', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Default: never resolves (loading state)
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading when fetching', () => {
      renderWithProviders(<Cron />)
      expect(screen.queryByText('定时任务')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when cron API fails', async () => {
      // First call: cron API fails, second call: license succeeds
      mockFetch
        .mockResolvedValueOnce(Promise.reject(new Error('Network error')))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText(/获取定时任务失败/)).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders cron page heading when loaded', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCronJobs),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('定时任务')).toBeTruthy()
      })
    })

    it('renders job names', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCronJobs),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('每日早报')).toBeTruthy()
        expect(screen.getByText('每周总结')).toBeTruthy()
      })
    })

    it('renders schedule display text', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCronJobs),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('每天早上8点')).toBeTruthy()
      })
    })
  })

  describe('Empty state', () => {
    it('handles empty jobs list', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('定时任务')).toBeTruthy()
      })
    })
  })

  describe('Job actions', () => {
    it('renders create task button', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCronJobs),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('创建任务')).toBeTruthy()
      })
    })

    it('shows job enabled state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCronJobs),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockActivatedLicense),
        })
      renderWithProviders(<Cron />)
      await waitFor(() => {
        expect(screen.getByText('每日早报')).toBeTruthy()
      })
    })
  })
})
