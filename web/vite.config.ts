import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The demo build deploys to GitHub Pages under /pl-crossover/, not the
  // domain root; the Docker-served build stays at /.
  base: mode === 'demo' ? '/pl-crossover/' : '/',
}))
