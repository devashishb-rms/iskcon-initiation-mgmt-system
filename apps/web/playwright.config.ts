import { defineConfig } from '@playwright/test';

const baseURL = process.env.WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
      args: ['--no-sandbox'],
    },
  },
  // Start the production server only when nothing is listening yet (build first: pnpm build).
  webServer: process.env.WEB_URL
    ? undefined
    : { command: 'pnpm start', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
