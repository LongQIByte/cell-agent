import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const candidates = [
  join(homedir(), '.cache/ms-playwright/chromium-1237/chrome-linux64/chrome'),
  join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
];
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 240000,
  expect: { timeout: 20000 },
  use: {
    timezoneId: 'Asia/Shanghai',
    baseURL: process.env.TEST_WEB_URL ?? 'http://127.0.0.1:8787',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? candidates.find((p) => existsSync(p)),
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
