import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // Each page runs a full-resolution WebGL microscope. Parallel headless
  // browsers contend for SwiftShader and turn timing assertions flaky.
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'phone-touch',
      testMatch: /mobile-responsive\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'small-android-touch',
      testMatch: /mobile-responsive\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'phone-landscape-touch',
      testMatch: /mobile-responsive\.spec\.ts/,
      use: {
        ...devices['Pixel 5 landscape'],
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: 'tablet-touch-keyboard',
      testMatch: /mobile-responsive\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'phone-reduced-motion',
      testMatch: /mobile-responsive\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
})
