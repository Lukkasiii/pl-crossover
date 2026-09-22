import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// e2e/auth-scenarios.spec.ts creates and deletes real rows (a demo user,
// scenarios) through the live API -- against the tracked data/pl.db that
// would leave a stray user row for `git status` to catch after every local
// run (a6fec41 already had to clean exactly that once, by hand). The
// webServer below points at a throwaway copy instead: same real, validated
// season data, disposable state.
const SCRATCH_DB = path.join(REPO_ROOT, "data", ".e2e-pl.db");
copyFileSync(path.join(REPO_ROOT, "data", "pl.db"), SCRATCH_DB);

// Runs against the real API + WebSocket, not demo mode -- the whole point
// of the resilience test is a live socket that can actually be dropped.
export default defineConfig({
  testDir: "e2e",
  // production-base.spec.ts runs under its own config (playwright.prod-base
  // .config.ts, `npm run test:e2e:prod-base`) against a built demo bundle
  // served at the real GitHub Pages base -- it 404s everything here, where
  // the dev server serves from base "/", not "/pl-crossover/".
  testIgnore: /production-base\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  webServer: [
    {
      command: ".venv/bin/python -m uvicorn api.app.main:app --port 8000",
      cwd: "..",
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PL_CORS_ORIGINS: "http://localhost:5175", PL_DB_PATH: SCRATCH_DB },
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      port: 5175,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  use: {
    baseURL: "http://localhost:5175",
  },
});
