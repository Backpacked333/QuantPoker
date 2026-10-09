import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Runs worker/test inside the Workers runtime (Miniflare) with the real
// wrangler.jsonc bindings. Dev tokens are on only here.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: fileURLToPath(
          new URL('../wrangler.jsonc', import.meta.url),
        ),
      },
      miniflare: {
        bindings: {
          DEV_AUTH_SECRET: 'test',
          SUPABASE_SECRET_KEY: 'sb_secret_test',
        },
      },
    }),
  ],
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
})
