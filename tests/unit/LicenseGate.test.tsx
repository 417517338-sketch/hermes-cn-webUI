import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LicenseGate, LICENSE_TIERS, FEATURE_LICENSE_MAP } from '@/features/license/LicenseGate'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Create a QueryClient for tests
const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0 },
    mutations: { retry: false },
  },
})

// Helper to create a valid license response
const createLicenseResponse = (tier: 'L1' | 'L2' | 'L3', isTrial = false) => ({
  tier,
  tier_level: tier === 'L1' ? 1 : tier === 'L2' ? 2 : 3,
  features: ['chat', 'sessions'],
  expires_at: '2027-12-31',
  seats: tier === 'L1' ? 1 : 3,
  is_trial: isTrial,
})

// Helper to render with all required providers
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

describe('LicenseGate', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('Error state', () => {
    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(
        <LicenseGate feature="test" required={1}>
          <div>Content</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByText(/许可证验证失败/)).toBeTruthy()
      })
    })
  })

  describe('Access granted', () => {
    it('renders children when user has sufficient license', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })

      renderWithProviders(
        <LicenseGate feature="chat" required={1}>
          <div data-testid="children">Secret Content</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByTestId('children')).toBeTruthy()
      })
    })

    it('L2 license grants access to L2 features', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L2')),
      })

      renderWithProviders(
        <LicenseGate feature="skills" required={2}>
          <div data-testid="children">Pro Feature</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByTestId('children')).toBeTruthy()
      })
    })

    it('L3 license grants access to all features', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L3')),
      })

      renderWithProviders(
        <LicenseGate feature="gateway" required={3}>
          <div data-testid="children">Pro Feature</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByTestId('children')).toBeTruthy()
      })
    })
  })

  describe('Access denied', () => {
    it('shows upgrade prompt when license insufficient', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })

      renderWithProviders(
        <LicenseGate feature="skills" required={2}>
          <div>Locked Content</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByText(/功能受限/)).toBeTruthy()
        expect(screen.getAllByText(/邀请版/).length).toBeGreaterThan(0)
      })
    })

    it('shows upgrade link with correct href', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })

      renderWithProviders(
        <LicenseGate feature="gateway" required={2}>
          <div>Locked</div>
        </LicenseGate>
      )

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /升级到/ })
        expect(link).toBeTruthy()
        expect(link.getAttribute('href')).toBe('/settings?tab=license')
      })
    })

    it('shows trial badge when in trial period with insufficient license', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L2', true)),
      })

      // L2 with trial - requires L3 to see trial badge
      renderWithProviders(
        <LicenseGate feature="config" required={3}>
          <div>Locked</div>
        </LicenseGate>
      )

      await waitFor(() => {
        expect(screen.getByText(/试用期/)).toBeTruthy()
      })
    })

    it('shows current license tier when access denied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createLicenseResponse('L1')),
      })

      renderWithProviders(
        <LicenseGate feature="browser" required={2}>
          <div>Locked</div>
        </LicenseGate>
      )

      await waitFor(() => {
        // 免费版 appears twice - in header and in current version box
        expect(screen.getAllByText(/免费版/).length).toBeGreaterThan(0)
      })
    })
  })
})

describe('LICENSE_TIERS', () => {
  it('has correct structure for all tiers', () => {
    expect(LICENSE_TIERS.L1).toEqual({ level: 1, name: '免费版', color: 'text-muted-foreground' })
    expect(LICENSE_TIERS.L2).toEqual({ level: 2, name: '邀请版', color: 'text-blue-500' })
    expect(LICENSE_TIERS.L3).toEqual({ level: 3, name: '专业版', color: 'text-purple-500' })
  })
})

describe('FEATURE_LICENSE_MAP', () => {
  it('maps L1 features correctly', () => {
    expect(FEATURE_LICENSE_MAP.sessions).toBe(1)
    expect(FEATURE_LICENSE_MAP.logs).toBe(1)
    expect(FEATURE_LICENSE_MAP.keys).toBe(1)
    expect(FEATURE_LICENSE_MAP.settings).toBe(1)
    expect(FEATURE_LICENSE_MAP.chat).toBe(1)
    expect(FEATURE_LICENSE_MAP.terminal).toBe(1)  // 终端界面免费开放
    expect(FEATURE_LICENSE_MAP.analytics).toBe(1) // 用量分析免费开放
  })

  it('maps L2 features correctly', () => {
    expect(FEATURE_LICENSE_MAP.config).toBe(2)
    expect(FEATURE_LICENSE_MAP.skills).toBe(2)
    expect(FEATURE_LICENSE_MAP.tools).toBe(2)
    expect(FEATURE_LICENSE_MAP.memory).toBe(2)
    expect(FEATURE_LICENSE_MAP.cron).toBe(2)
    expect(FEATURE_LICENSE_MAP.browser).toBe(2)
    expect(FEATURE_LICENSE_MAP.delegation).toBe(2)
    expect(FEATURE_LICENSE_MAP.gateway).toBe(2)
  })
})
