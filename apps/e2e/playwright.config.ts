import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Serial execution — all tests share one WS server, so running in parallel
  // causes multiple device contexts to bleed into each other's device lists.
  workers: 1,

  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true, // self-signed mkcert cert
    trace: 'on-first-retry',
  },
  timeout: 60_000,

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Start the WS server and the Vite dev server before running tests.
  // reuseExistingServer lets you run `pnpm dev` yourself in dev mode
  // so tests reuse the already-running processes instead of spawning new ones.
  webServer: [
    {
      command: 'pnpm --filter @aether/server dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'pnpm --filter @aether/web dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
