import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Skills } from '@/app/pages/skills/Skills'

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

const mockSkillsResponse = {
  skills: [
    {
      name: 'test-skill',
      description: 'A test skill',
      category: 'testing',
      enabled: true,
      config: { key: 'value' },
    },
    {
      name: 'deploy-skill',
      description: 'Deployment skill',
      category: 'devops',
      enabled: false,
      config: {},
    },
  ],
}

describe('Skills', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(() => new Promise(() => {}))
  })

  describe('Loading state', () => {
    it('shows loading when fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      renderWithProviders(<Skills />)
      // Component should not show main heading while loading
      expect(screen.queryByText('技能市场')).toBeNull()
    })
  })

  describe('Data display', () => {
    it('renders skills page heading when loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSkillsResponse),
      })
      renderWithProviders(<Skills />)
      await waitFor(() => {
        expect(screen.getByText('技能管理')).toBeTruthy()
      })
    })

    it('renders skill names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSkillsResponse),
      })
      renderWithProviders(<Skills />)
      await waitFor(() => {
        expect(screen.getByText('test-skill')).toBeTruthy()
        expect(screen.getByText('deploy-skill')).toBeTruthy()
      })
    })

    it('renders skill descriptions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSkillsResponse),
      })
      renderWithProviders(<Skills />)
      await waitFor(() => {
        expect(screen.getByText('A test skill')).toBeTruthy()
      })
    })
  })

  describe('Search filtering', () => {
    it('has search input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSkillsResponse),
      })
      renderWithProviders(<Skills />)
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/搜索技能/)
        expect(searchInput).toBeTruthy()
      })
    })
  })
})
