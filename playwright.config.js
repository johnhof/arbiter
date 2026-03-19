const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const repoPath = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    baseURL: 'http://localhost:7430',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node server.js --path "${repoPath}" --port 7430 --export accept`,
    url: 'http://localhost:7430',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    env: {
      ...process.env,
      ...(process.env.CI ? { NODE_V8_COVERAGE: './coverage/tmp' } : {}),
    },
  },
});
