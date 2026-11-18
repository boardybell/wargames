import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Project site deploys under /wargames/; subpath parity is the default
// posture so a wrong base can never silently ship. Split 08's CI overrides
// VITE_BASE for the real target.
const base = process.env.VITE_BASE ?? '/wargames/'

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
