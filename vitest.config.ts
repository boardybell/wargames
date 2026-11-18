import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // The React plugin gives the app project JSX/TSX transforms. The engine
  // project is plain .ts in a node environment, so it is unaffected.
  plugins: [react()],
  resolve: {
    // Regex finds: string aliases are prefix matches, which would rewrite
    // a deep import like @engine/rng to <index.ts>/rng. Order matters.
    alias: [
      { find: /^@engine\/testing$/, replacement: r('./src/engine/testing/index.ts') },
      { find: /^@engine$/, replacement: r('./src/engine/index.ts') },
      { find: /^@engine\/(.+)$/, replacement: r('./src/engine') + '/$1' },
      { find: /^@app$/, replacement: r('./src/app/index.ts') },
      { find: /^@app\/(.+)$/, replacement: r('./src/app') + '/$1' },
    ],
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      thresholds: { lines: 80, branches: 75 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          environment: 'node',
          include: ['test/engine/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['test/app/**/*.test.{ts,tsx}'],
          setupFiles: ['test/app/setup.ts'],
        },
      },
    ],
  },
})
