/**
 * Checked at the moment of the gesture, not once at load: a visitor can
 * flip the OS setting while the tab is open, and the cover's slide-away
 * must respect whichever value is current -- CSS handles the rest of the
 * page's motion through the same media query.
 */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
