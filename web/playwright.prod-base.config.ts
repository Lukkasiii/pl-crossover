import { defineConfig } from "@playwright/test";

// Serves the actual `vite build --mode demo` output (base "/pl-crossover/",
// the real GitHub Pages path) through a server that reproduces GitHub
// Pages' own semantics -- see e2e/ghPagesStaticServer.mjs. The dev server
// (base "/") can't catch a bug that only exists under a non-root basename;
// this config exists so something does. Run via `npm run test:e2e:prod-base`,
// which builds the demo bundle first -- this config only serves an
// already-built dist/.
export default defineConfig({
  testDir: "e2e",
  testMatch: /production-base\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  webServer: {
    command: "node e2e/ghPagesStaticServer.mjs",
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:4174",
  },
});
