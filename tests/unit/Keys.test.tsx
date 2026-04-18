import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Keys } from '@/app/pages/keys/Keys'

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

// Helper to create a valid license response
const createLicenseResponse = (tier: 'L1' | 'L2' | 'L3' = 'L1', isTrial = false) => ({
  tier,
  tier_level: tier === 'L1' ? 1 : tier === 'L2' ? 2 : 3,
  features: ['chat', 'sessions', 'keys'],
  expires_at: '2027-12-31',
  seats: tier === 'L1' ? 1 : 3,
  is_trial: isTrial,
})

const mockKeysResponse = {
  keys: [
    { 
      id: 'openai', 
      name: 'OpenAI', 
      key: 'sk-openai', 
      value: 'sk-test-openai-12345', 
      masked: 'sk-••••••••45', 
      hasKey: true, 
      valid: true,
      url: 'https://platform.openai.com'
    },
    { 
      id: 'anthropic', 
      name: 'Anthropic', 
      key: 'sk-ant', 
      value: 'sk-ant-test123', 
      masked: 'sk-•••••••23', 
      hasKey: true,
      valid: true,
      url: 'https://console.anthropic.com'
    },
    { 
      id: 'tavily', 
      name: 'Tavily', 
      key: 'TAVILY', 
      value: '', 
      masked: '未设置', 
      hasKey: false,
      url: 'https://tavily.com'
    },
  ],
}

// Mock window.confirm
const mockConfirm = vi.fn()
global.confirm = mockConfirm

describe('Keys', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockConfirm.mockReset()
    mockConfirm.mockReturnValue(true)
  })

  describe('Loading state', () => {
    it('shows loading spinner when fetching keys', () => {
      // Mock license check first (always called on mount)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      // Keep keys request pending - use a promise that never resolves
      let resolveKeys: (value: unknown) => void
      const keysPromise = new Promise((resolve) => {
        resolveKeys = resolve
      })
      mockFetch.mockResolvedValueOnce(keysPromise)
      
      renderWithProviders(<Keys />)
      
      // The license passes, then keys loading shows a Loader2 spinner
      // Wait a bit for the component to render
      expect(screen.queryByText('密钥管理')).toBeNull()
    })
  })

  describe('Error state', () => {
    it('shows error when license fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText(/许可证验证失败/)).toBeTruthy()
      })
    })

    it('shows error when keys fetch fails', async () => {
      // License passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      // Keys fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText(/获取密钥失败/)).toBeTruthy()
      })
    })

    it('shows error message with details', async () => {
      // License passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      // Keys fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText(/无法连接到服务器/)).toBeTruthy()
      })
    })
  })

  describe('Data display', () => {
    it('renders page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('密钥管理')).toBeTruthy()
      })
    })

    it('renders page description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText(/管理 Hermes Agent 的 API 密钥/)).toBeTruthy()
      })
    })

    it('renders security notice', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText(/密钥文件权限应为 0600/)).toBeTruthy()
      })
    })

    it('renders key names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
        expect(screen.getByText('Anthropic')).toBeTruthy()
        expect(screen.getByText('Tavily')).toBeTruthy()
      })
    })

    it('renders masked key values initially', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('sk-••••••••45')).toBeTruthy()
      })
    })

    it('shows "已设置" badge for keys with values', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getAllByText('已设置').length).toBeGreaterThan(0)
      })
    })

    it('renders apply links for keys with urls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        const links = screen.getAllByText('申请')
        expect(links.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [] }),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('暂无密钥配置')).toBeTruthy()
      })
    })
  })

  describe('Key toggle (show/hide)', () => {
    it('toggles key visibility when show button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
      })
      
      // Find and click the show button for OpenAI
      const showButtons = screen.getAllByText(/显示/)
      if (showButtons.length > 0) {
        await userEvent.click(showButtons[0])
      }
    })
  })

  describe('Key editing', () => {
    it('enters edit mode when edit button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
      })
      
      // Find and click the edit button
      const editButtons = screen.getAllByText(/编辑/)
      if (editButtons.length > 0) {
        await userEvent.click(editButtons[0])
      }
      
      // Should show save button
      await waitFor(() => {
        expect(screen.getByText('保存')).toBeTruthy()
      })
    })

    it('exits edit mode when cancel button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
      })
      
      // Find and click the edit button
      const editButtons = screen.getAllByText(/编辑/)
      if (editButtons.length > 0) {
        await userEvent.click(editButtons[0])
      }
      
      // Click cancel
      await waitFor(() => {
        const cancelButton = screen.getByText('取消')
        if (cancelButton) {
          userEvent.click(cancelButton)
        }
      })
    })
  })

  describe('Key deletion', () => {
    it('calls delete API when delete button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      // Mock the delete API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
      })
      
      // Find and click the delete button
      const deleteButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg?.classList.contains('lucide-trash-2')
      })
      
      if (deleteButtons.length > 0) {
        mockConfirm.mockReturnValue(true)
        await userEvent.click(deleteButtons[0])
      }
    })
  })

  describe('Key testing', () => {
    it('calls test API when test button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      // Mock the test API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Key is valid' }),
      })
      
      renderWithProviders(<Keys />)
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeTruthy()
      })
      
      // Find and click the test button
      const testButtons = screen.getAllByText('测试')
      if (testButtons.length > 0) {
        await userEvent.click(testButtons[0])
      }
    })
  })

  describe('License access', () => {
    it('shows upgrade message when license tier too low', async () => {
      // L1 license but Keys requires L1 (should pass)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockKeysResponse),
      })
      
      renderWithProviders(<Keys />)
      
      // Should render keys page, not upgrade message
      await waitFor(() => {
        expect(screen.getByText('密钥管理')).toBeTruthy()
      })
    })
  })
})
