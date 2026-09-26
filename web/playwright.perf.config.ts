import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Same throwaway-DB trick as playwright.config.ts -- this run only ever
// reads through the replay/curves endpoints, but pointing at a scratch copy
// keeps it from ever being a reason `git status` goes dirty.
const SCRATCH_DB = path.join(REPO_ROOT, "data", ".e2e-perf-pl.db");
// Main process only: every worker process re-evaluates this config file,
// and a copy made from a worker overwrote the db under the already-running
// API -- wiping any account another test had just registered mid-run.
if (!process.env.TEST_WORKER_INDEX) copyFileSync(path.join(REPO_ROOT, "data", "pl.db"), SCRATCH_DB);

// Not part of `npm run test:e2e` -- see e2e-perf/README.md. This measures
// wall-clock timing and dropped frames, which a parallel worker sharing the
// CPU with this one would corrupt, so it gets its own config: one worker,
// no retries (a flaky retry would silently drop a data point instead of
// surfacing the flake), separate ports so it can run alongside a normal
// `npm run dev` without a port clash.
export default defineConfig({
  testDir: "e2e-perf",
  timeout: 400_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: [
    {
      command: ".venv/bin/python -m uvicorn api.app.main:app --port 8020",
      cwd: "..",
      port: 8020,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PL_CORS_ORIGINS: "http://localhost:5195,http://localhost:5196", PL_DB_PATH: SCRATCH_DB },
    },
    {
      command: "npm run dev -- --port 5195 --strictPort",
      port: 5195,
      reuseExistingServer: false,
      timeout: 30_000,
      // .env hardcodes VITE_API_BASE_URL=http://localhost:8000; this
      // already-set process env var wins over that (dotenv fills gaps, it
      // doesn't overwrite), pointing the dev server at the 8020 API above
      // instead.
      env: { VITE_API_BASE_URL: "http://localhost:8020" },
    },
    // The same app again, talking to the API through a fixed 25ms-each-way
    // delay (a 50ms round trip) -- see e2e-perf/latencyProxy.mjs for why
    // localhost alone can't show what a per-round-trip protocol costs.
    {
      command: "node e2e-perf/latencyProxy.mjs 8021 8020 25",
      port: 8021,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --port 5196 --strictPort",
      port: 5196,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_BASE_URL: "http://localhost:8021" },
    },
  ],
  use: {
    baseURL: "http://localhost:5195",
  },
});
