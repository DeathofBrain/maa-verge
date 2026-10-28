import { defineConfig } from '@playwright/test';
const port = process.env.MAAVERGE_TEST_PORT || '1420';
const url = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/ui',
  outputDir: './test-results/ui',
  timeout: 30_000,
  use: {
    baseURL: url,
    channel: process.env.MAAVERGE_TEST_BROWSER || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/serve-test-ui.mjs',
    env: { MAAVERGE_DEV_PORT: port },
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
