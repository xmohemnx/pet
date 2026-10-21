import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/run-worker.mjs',
      url: 'http://127.0.0.1:4102',
      env: { WORKER_HEALTH_PORT: '4102' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @petra/api start',
      url: 'http://127.0.0.1:4101/api/v1/health',
      env: { API_PORT: '4101', PETRA_DEMO_MODE: 'false' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @petra/web start --port 3200',
      url: 'http://127.0.0.1:3200',
      env: { PETRA_DEMO_MODE: 'false' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev:api',
      url: 'http://127.0.0.1:4100/api/v1/health',
      env: { API_PORT: '4100', PETRA_DEMO_MODE: 'true' },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'pnpm --filter @petra/web start --port 3100',
      url: 'http://127.0.0.1:3100',
      env: { PETRA_DEMO_MODE: 'true', API_BASE_URL: 'http://127.0.0.1:4100' },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
