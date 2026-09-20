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
  timeout: 30_000,
  fullyParallel: true,
  // Every page now autoplays on load (see ReplayDashboard), so every spec's
  // browser tab is an actively streaming WebSocket + chart-redrawing page,
  // not just the ones that click Play -- all sharing the one uvicorn
  // process the webServer below starts. replay-resilience.spec.ts measures
  // real wall-clock frame delivery under a tight timeout, and Playwright's
  // default worker count (half the machine's cores) is enough concurrent
  // load on an 8-core dev machine to make that assertion flake. Capped
  // rather than left to the default, so it doesn't regress if the CI
  // runner's core count changes under us.
  workers: 2,
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
