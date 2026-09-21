import { expect, type Locator, test } from "@playwright/test";

const DROP_AT_FRAME = 300; // deep enough that the old O(n) round-trip catch-up (~13ms/frame through the WS proxy below, measured) can't finish inside RESUME_TIMEOUT_MS
const RESUME_TIMEOUT_MS = 2_000; // single-seek catch-up resumes in one round trip (~tens of ms); 300 sequential round trips takes ~4s

async function readFrame(frameCount: Locator): Promise<number> {
  const text = await frameCount.textContent();
  const match = text?.match(/frame (\d+)/);
  return match ? Number(match[1]) : -1;
}

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
  // Autoplay (see ReplayDashboard) starts the stream without a click.
  await expect(page.getByRole("button", { name: /pause/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTitle("open")).toBeVisible({ timeout: 10_000 });
  // Wait for the standings table to actually have a row before touching the
  // speed selector below it. StandingsTable's placeholder ("Press play...")
  // is much shorter than the populated table, so the page grows by several
  // hundred pixels the moment the first match frame lands -- pushing the
  // player-controls bar (and this select) further down the page. Racing that
  // one-time growth is what made this flaky: opening the dropdown before it
  // happens gets a popper position computed against the *short* layout, and
  // that position goes stale (off-screen) once the page grows underneath it,
  // since nothing reopens the popper to reposition it. Waiting for a row
  // here -- the same signal every other spec already waits on -- guarantees
  // the growth has already happened, so the popper's position is stable and
  // correct from the moment it opens.
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  // The speed select is a controlled component that only takes effect
  // while already playing (PlayerControls only calls onPlay(next) -- which
  // is what actually updates the streamed speed -- inside its `if
  // (playing)` branch), so it has to be changed after Play, not before.
  await page.getByRole("combobox", { name: "replay speed" }).click();
  await page.getByRole("option", { name: "10x" }).click();

  const frameCount = page.locator(".frame-count");
  // Deliberately not the first few frames: at frame 1-9 the counter moving
  // at all after reconnect would trivially satisfy a weak assertion, catch-up
  // or not, since even a from-scratch resume is at frame 1 by then.
  await expect.poll(() => readFrame(frameCount), { timeout: 20_000 }).toBeGreaterThanOrEqual(DROP_AT_FRAME);

  // React StrictMode double-invokes the connecting effect on mount, so the
  // socket actually carrying traffic by the time Play is clicked is the
  // most recent one routeWebSocket has seen, not necessarily the first.
  await clientRoutes[clientRoutes.length - 1].close();
  await expect(page.getByTitle("reconnecting")).toBeVisible({ timeout: 10_000 });

  const seqAtDrop = await readFrame(frameCount);

  await expect(page.getByTitle("open")).toBeVisible({ timeout: 15_000 });

  // Strictly greater, on a tight timeout the single-seek catch-up clears
  // comfortably but a from-scratch or O(n) round-trip catch-up cannot:
  // frame count is silent (no visible progress) for the whole time the
  // client's server-side cursor is still catching up, so a slow or broken
  // resume shows up here as "never exceeds seqAtDrop", not as a smaller
  // wrong number.
  await expect.poll(async () => readFrame(frameCount), { timeout: RESUME_TIMEOUT_MS }).toBeGreaterThan(seqAtDrop);

  // The standings table kept moving too, not just the frame counter.
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});
