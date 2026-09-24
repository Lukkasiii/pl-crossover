import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The demo build deploys to GitHub Pages under /pl-crossover/, not the
  // domain root; the Docker-served build stays at /.
  base: mode === 'demo' ? '/pl-crossover/' : '/',
  // e2e/, e2e-perf/ and e2e-gif/ hold Playwright specs (playwright*.config.ts
  // runs those) -- both frameworks use the *.spec.ts convention, so Vitest's
  // default include glob picks them up too unless told not to, and the two
  // test() globals aren't compatible.
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'e2e-perf/**', 'e2e-gif/**'],
  },
}))
