import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Served at the root of greetingsprofessorfalken.net (custom domain). e2e
// still builds with VITE_BASE=/wargames/ to prove subpath parity; set
// VITE_BASE to deploy under a subpath again.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
})
