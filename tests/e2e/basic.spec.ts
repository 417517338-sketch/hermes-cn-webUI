import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('homepage redirects to tools or shows loading', async ({ page }) => {
    await page.goto('/')
    // Should either show tools page or loading state
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Tools Page', () => {
  test('renders tools page', async ({ page }) => {
    await page.goto('/tools')
    await expect(page.getByText('工具集')).toBeVisible({ timeout: 10_000 })
  })

  test('shows search input', async ({ page }) => {
    await page.goto('/tools')
    await expect(page.getByPlaceholder(/搜索工具/)).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Sessions Page', () => {
  test('renders sessions page', async ({ page }) => {
    await page.goto('/sessions')
    await expect(page.getByText('会话历史')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Config Page', () => {
  test('renders config page', async ({ page }) => {
    await page.goto('/config')
    await expect(page.getByText('配置中心')).toBeVisible({ timeout: 10_000 })
  })
})
