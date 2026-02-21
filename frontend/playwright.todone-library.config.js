import { defineConfig, devices } from '@playwright/test';

const libraryPath = '/todone/dir-12%2Fgrp-27%7C%E6%B5%8B%E8%AF%95lib%7C1';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/todone.library.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
    trace: 'on-first-retry',
  },
  metadata: {
    todoneLibraryPath: libraryPath,
  },
  projects: [
    {
      name: 'todone-library-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
