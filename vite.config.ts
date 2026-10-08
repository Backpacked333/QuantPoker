import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // three.js (~500 kB) ships only in the lazily loaded 3D view, which loads
  // when someone opens the expanded terrain; the main bundle stays small.
  build: { chunkSizeWarningLimit: 520 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
