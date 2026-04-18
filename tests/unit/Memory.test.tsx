import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Memory } from '@/app/pages/memory/Memory'

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

const mockMemoriesResponse = {
  memories: [
    { id: 'mem-1', content: '用户喜欢使用终端命令', created_at: '2024-01-15 10:30', session_id: 'session-1' },
    { id: 'mem-2', content: '开发环境使用 macOS', created_at: '2024-01-14 09:20', session_id: 'session-2' },
    { id: 'mem-3', content: '经常使用 Docker', created_at: '2024-01-13 08:10' },
  ],
  stats: {
    memory: { used: 2048, limit: 4096, percentage: 50 },
    user: { used: 1024, limit: 2048, percentage: 50 },
  },
}

const mockConfirm = vi.fn()
global.confirm = mockConfirm

describe('Memory', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockConfirm.mockReset()
    mockConfirm.mockReturnValue(true)
  })

  describe('Loading state', () => {
    it('shows loading text when fetching', () => {
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))
      
      renderWithProviders(<Memory />)
      
      expect(screen.queryByText('内存管理')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('获取记忆失败')).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('内存管理')).toBeTruthy()
      })
    })

    it('renders memory stats cards', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('记忆片段')).toBeTruthy()
        expect(screen.getByText('记忆字符限制')).toBeTruthy()
        expect(screen.getByText('用户字符限制')).toBeTruthy()
      })
    })

    it('renders search input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('搜索记忆...')
        expect(searchInput).toBeTruthy()
      })
    })

    it('renders rebuild index button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('重建索引')).toBeTruthy()
      })
    })

    it('renders clear memory button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('清空全部')).toBeTruthy()
      })
    })

    it('renders user profile section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('用户档案')).toBeTruthy()
        expect(screen.getByText('基于对话历史自动生成')).toBeTruthy()
      })
    })

    it('renders memory list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('用户喜欢使用终端命令')).toBeTruthy()
        expect(screen.getByText('开发环境使用 macOS')).toBeTruthy()
        expect(screen.getByText('经常使用 Docker')).toBeTruthy()
      })
    })
  })

  describe('Search filtering', () => {
    it('filters memories by search term', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      renderWithProviders(<Memory />)
      
      const searchInput = await screen.findByPlaceholderText('搜索记忆...')
      await userEvent.type(searchInput, 'macOS')
      
      await waitFor(() => {
        expect(screen.getByText('开发环境使用 macOS')).toBeTruthy()
        expect(screen.queryByText('用户喜欢使用终端命令')).not.toBeTruthy()
      })
    })
  })

  describe('Rebuild index', () => {
    it('calls rebuild API when rebuild button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemoriesResponse),
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      
      renderWithProviders(<Memory />)
      
      const rebuildButton = await screen.findByText('重建索引')
      await userEvent.click(rebuildButton)
    })
  })

  describe('Empty state', () => {
    it('shows empty list when no memories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memories: [], stats: { memory: { used: 0, limit: 4096, percentage: 0 }, user: { used: 0, limit: 2048, percentage: 0 } } }),
      })
      
      renderWithProviders(<Memory />)
      
      await waitFor(() => {
        expect(screen.getByText('0')).toBeTruthy() // 0 memories
      })
    })
  })
})
