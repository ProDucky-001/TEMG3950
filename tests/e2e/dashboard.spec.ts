/**
 * E2E tests for ScamShield dashboard.
 * Run after build: npm run build && npm run test:e2e
 * Uses Playwright against the built renderer served on port 5173.
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('dashboard loads and shows ScamShield title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('ScamShield');
  });

  test('navigation to Settings is available', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible();
  });
});
