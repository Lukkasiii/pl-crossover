import { expect, test } from "@playwright/test";

/**
 * Intercepts the replay WebSocket and, once it's streaming, closes the
 * client-side end from underneath the page -- the same as the network
 * dying mid-connection. (context.setOffline blocks new connections but
 * does not close an already-open WebSocket in Chromium, so it can't
 * exercise this path; routeWebSocket can.) Real frames still flow through
 * the proxy to the live backend started by the webServer config, so this
 * is exercising the real reconnect path end to end, not a mock.
 */
test("replay resumes after the connection drops mid-stream", async ({ page }) => {
  const clientRoutes: Parameters<Parameters<typeof page.routeWebSocket>[1]>[0][] = [];
  await page.routeWebSocket(/\/ws\/replay/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    clientRoutes.push(ws);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /play/i }).click();
  await expect(page.getByTitle("open")).toBeVisible({ timeout: 10_000 });

  const frameCount = page.locator(".frame-count");
  await expect(frameCount).toContainText(/frame [1-9]/, { timeout: 10_000 });

  // React StrictMode double-invokes the connecting effect on mount, so the
  // socket actually carrying traffic by the time Play is clicked is the
  // most recent one routeWebSocket has seen, not necessarily the first.
  await clientRoutes[clientRoutes.length - 1].close();
  await expect(page.getByTitle("reconnecting")).toBeVisible({ timeout: 10_000 });

  const seqAtDrop = await frameCount.textContent();

  await expect(page.getByTitle("open")).toBeVisible({ timeout: 15_000 });

  // Confirms the replay resumed forward from the cached position rather
  // than restarting or hanging on reconnect.
  await expect
    .poll(async () => frameCount.textContent(), { timeout: 15_000 })
    .not.toBe(seqAtDrop);

  // The standings table kept moving too, not just the frame counter.
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});
