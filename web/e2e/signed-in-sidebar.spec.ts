import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The signed-in sidebar footer, with an address long enough to decide the
 * layout -- demo@plcrossover.dev alone once left "Sign out" wrapped onto
 * three lines and both pushed past the sidebar edge. Same widths as
 * layout.spec.ts; at 390 the sidebar is the full-screen drawer.
 */
const PASSWORD = "layout-check-password";
const API = "http://localhost:8000";
const WIDTHS = [1440, 1024, 900, 390] as const;

// One fresh account per test: parallel workers each registering "the"
// long address raced on the unique email and failed each other's setup.
async function signIn(page: Page) {
  const LONG_EMAIL = `a-rather-long-address-for-layout-checks-${crypto.randomUUID().slice(0, 8)}@plcrossover-example.dev`;
  const res = await page.request.post(`${API}/auth/register`, { data: { email: LONG_EMAIL, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  await page.getByTestId("sign-in-open-button").click();
  const dialog = page.getByTestId("auth-dialog");
  await dialog.getByTestId("auth-email-input").fill(LONG_EMAIL);
  await dialog.getByTestId("auth-password-input").fill(PASSWORD);
  await dialog.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("account-email")).toHaveAttribute("title", LONG_EMAIL);
}

for (const width of WIDTHS) {
  test(`signed-in footer fits the sidebar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/overview");
    if (width <= 720) await page.getByTestId("sidebar-toggle").click();
    await signIn(page);

    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const nav = await box("sidebar-nav");
    const email = await box("account-email");
    const signOut = await box("sign-out-button");

    // Inside the sidebar, horizontally, with room to spare for its padding.
    for (const b of [email, signOut]) {
      expect(b.x).toBeGreaterThanOrEqual(nav.x);
      expect(b.x + b.width).toBeLessThanOrEqual(nav.x + nav.width);
    }
    // The address truncates rather than overflowing.
    const truncated = await page
      .getByTestId("account-email")
      .evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === "ellipsis");
    expect(truncated).toBe(true);
    // "Sign out" is one line: its height is one line box plus padding, and
    // its label isn't clipped.
    const lineHeight = await page
      .getByTestId("sign-out-button")
      .evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5);
    expect(signOut.height).toBeLessThan(lineHeight * 2);
    const labelClipped = await page.getByTestId("sign-out-button").evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(labelClipped).toBe(false);
    // The two never share pixels.
    expect(email.y + email.height).toBeLessThanOrEqual(signOut.y);
    // And the sidebar itself never grows a horizontal scroll.
    const navOverflow = await page.getByTestId("sidebar-nav").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(navOverflow).toBeLessThanOrEqual(0);
  });
}

test("signed-in sidebar has no axe violations", async ({ page }) => {
  await page.goto("/overview");
  await signIn(page);
  const results = await new AxeBuilder({ page }).include('[data-testid="sidebar-nav"]').analyze();
  expect(results.violations).toEqual([]);
});
