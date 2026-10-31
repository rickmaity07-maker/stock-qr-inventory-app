import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests of the built iPhone web app (docs/app).
 * Run `npm run build:web` first, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4180/stock-qr-inventory-app/',
    viewport: { width: 393, height: 852 }, // iPhone 15/16
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-docs.mjs 4180',
    url: 'http://127.0.0.1:4180/stock-qr-inventory-app/app/',
    reuseExistingServer: !process.env.CI,
  },
});
