import { defineConfig } from "@playwright/test";

// Records the README's top-of-page GIF against the actual built demo (see
// CLAUDE.md "5. Make it visible in 30 seconds"), not the dev server against
// a live backend -- what a visitor actually gets on GitHub Pages, including
// the "/pl-crossover/" base path. Reuses e2e/ghPagesStaticServer.mjs (see
// playwright.prod-base.config.ts) on its own port so it can run alongside
// that config without a clash. Requires `npm run demo:data && npm run
// build:demo` first -- this config only serves an already-built dist/.
export default defineConfig({
  testDir: "e2e-gif",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "node e2e/ghPagesStaticServer.mjs",
    port: 4176,
    env: { PORT: "4176" },
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:4176/pl-crossover/",
  },
});
