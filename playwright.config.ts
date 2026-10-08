import { defineConfig, devices } from '@playwright/test'

// `npm run e2e:visual` adds screenshot comparisons. Baselines depend on the
// machine's fonts and browser build, so they stay local (gitignored): record
// them with `npm run e2e:visual -- --update-snapshots` before a UI change,
// then compare after it.
const visual = !!process.env.VISUAL

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
      testIgnore: [/mobile/, /visual/],
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    ...(visual
      ? [
          {
            name: 'visual-desktop',
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1440, height: 960 },
            },
            testMatch: /visual/,
          },
          {
            name: 'visual-mobile',
            use: { ...devices['Pixel 7'] },
            testMatch: /visual/,
          },
        ]
      : []),
  ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
