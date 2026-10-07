import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createCoachApp } from './server/app'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'quantpoker-coach',
      configureServer(server) {
        server.middlewares.use(
          createCoachApp({ production: false, serveStatic: false }),
        )
      },
    },
  ],
})
