import { defineConfig } from "@playwright/test";

// Runs against the real API + WebSocket, not demo mode -- the whole point
// of the resilience test is a live socket that can actually be dropped.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  webServer: [
    {
      command: ".venv/bin/python -m uvicorn api.app.main:app --port 8000",
      cwd: "..",
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PL_CORS_ORIGINS: "http://localhost:5175" },
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
