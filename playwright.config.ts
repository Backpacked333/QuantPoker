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
  // In CI the JSON report lets scripts/check-e2e.ts prove the live
  // two-browser project ran rather than silently dropped out.
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
      testIgnore: [/mobile/, /visual/, /live/],
    },
    // Two browsers against the real Worker (site + table server).
    {
      name: 'live',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        baseURL: 'http://localhost:8787',
      },
      testMatch: /live/,
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
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Serves the same dist/ once the build above is up, plus the table
      // server, with dev tokens enabled for the two test players.
      command:
        "sh -c 'until curl -sf http://localhost:4174 >/dev/null; do sleep 1; done; npx wrangler dev --port 8787 --var DEV_AUTH_SECRET:e2e-local-secret-0001'",
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
})
