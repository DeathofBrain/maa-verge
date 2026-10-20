import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    channel: process.env.MAAVERGE_TEST_BROWSER || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/dev.mjs --mock',
    env: { MAAVERGE_DEV_PORT: '1420' },
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
