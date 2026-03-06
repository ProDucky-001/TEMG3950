/**
 * @see https://playwright.dev/docs/test-configuration
 * E2E tests for ScamShield. For full Electron E2E (tray, windows), use playwright-electron.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/serve-renderer.js',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  timeout: 30000,
});
