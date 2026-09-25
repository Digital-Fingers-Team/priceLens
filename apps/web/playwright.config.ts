import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests against a running stack -- start it first with
 * `pnpm dev:up` (or point E2E_BASE_URL / E2E_API_URL elsewhere):
 *
 *   pnpm --filter @pricelens/web test:e2e
 *
 * They expect the demo catalog that dev:up seeds into an empty database.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
  ],
});
