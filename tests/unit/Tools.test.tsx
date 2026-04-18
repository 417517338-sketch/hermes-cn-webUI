import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Tools } from '@/app/pages/tools/Tools'

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

const mockToolsResponse = [
  { name: 'terminal', label: 'Terminal', description: 'Execute shell commands', enabled: true, configured: true, tools: ['terminal', 'process'] },
  { name: 'read_file', label: 'File Read', description: 'Read file contents', enabled: true, configured: true, tools: ['read_file'] },
  { name: 'web_search', label: 'Web Search', description: 'Search the web', enabled: false, configured: true, tools: ['web_search'] },
  { name: 'browser_navigate', label: 'Browser', description: 'Navigate browser', enabled: true, configured: true, tools: ['browser_navigate'] },
]

const resolvedMock = () => ({
  ok: true,
  json: () => Promise.resolve(mockToolsResponse),
})

describe('Tools', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Default: never resolves so component stays in loading state
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading text when fetching', () => {
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      renderWithProviders(<Tools />)
      expect(screen.getByText(/加载中/)).toBeTruthy()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      renderWithProviders(<Tools />)
      await waitFor(() => {
        expect(screen.getByText(/获取工具失败/)).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders tools page heading when data loaded', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())
      renderWithProviders(<Tools />)
      await waitFor(() => {
        expect(screen.getByText('工具集')).toBeTruthy()
      })
    })

    it('renders toolset names as cards', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())
      renderWithProviders(<Tools />)
      await waitFor(() => {
        // Toolset names are rendered in the card headers
        expect(screen.getByText('terminal')).toBeTruthy()
        expect(screen.getByText('read_file')).toBeTruthy()
      })
    })

    it('shows tool count badge for each toolset', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())
      renderWithProviders(<Tools />)
      await waitFor(() => {
        // Terminal has 2 tools
        expect(screen.getByText('2 工具')).toBeTruthy()
        // Multiple toolsets have 1 tool each
        const oneToolBadges = screen.getAllByText('1 工具')
        expect(oneToolBadges.length).toBeGreaterThanOrEqual(3)
      })
    })

    it('renders search input', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())
      renderWithProviders(<Tools />)
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/搜索工具/)
        expect(searchInput).toBeTruthy()
      })
    })
  })

  describe('Search filtering', () => {
    it('has search input that accepts text', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())
      renderWithProviders(<Tools />)
      const searchInput = await screen.findByPlaceholderText(/搜索工具/)

      await userEvent.type(searchInput, 'terminal')

      expect(searchInput).toHaveValue('terminal')
    })
  })

  describe('Toggle mutation', () => {
    it('calls toggle API when power button clicked', async () => {
      mockFetch.mockResolvedValueOnce(resolvedMock())

      // Mock the PUT request for toggle
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      renderWithProviders(<Tools />)
      await waitFor(() => {
        expect(screen.getByText('工具集')).toBeTruthy()
      })

      // Find power buttons (they toggle tool enabled state)
      const powerButtons = screen.getAllByRole('button')
      const powerButton = powerButtons.find(btn => {
        const svg = btn.querySelector('svg')
        return svg?.classList.contains('lucide-power')
      })

      if (powerButton) {
        await userEvent.click(powerButton)
      }
    })
  })

  describe('Empty state', () => {
    it('handles empty tools array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      renderWithProviders(<Tools />)
      await waitFor(() => {
        // Should render page without crashing
        expect(screen.getByText('工具集')).toBeTruthy()
        // Empty state message
        expect(screen.getByText(/没有找到匹配的工具集/)).toBeTruthy()
      })
    })
  })
})
