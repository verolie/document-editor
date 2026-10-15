import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The e2e tests run their own backend on another port.
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:5000',
    },
  },
})
