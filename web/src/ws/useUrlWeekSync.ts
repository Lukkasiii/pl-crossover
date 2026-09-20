import { useEffect, useRef } from "react";

/**
 * Keeps `?week=` in the URL in sync with the replay's current round: a
 * refresh keeps your place and links are shareable. `sigma` isn't in the
 * URL yet -- there's no control that sets it until Feature 2 lands, and an
 * inert query param is worse than none.
 */
export function useUrlWeekSync(ready: boolean, currentWeek: number | undefined, seekToWeek: (week: number) => void) {
  const appliedInitial = useRef(false);

  useEffect(() => {
    if (!ready || appliedInitial.current) return;
    appliedInitial.current = true;
    const week = Number(new URLSearchParams(window.location.search).get("week"));
    if (Number.isInteger(week) && week >= 1 && week <= 38) seekToWeek(week);
  }, [ready, seekToWeek]);

  useEffect(() => {
    if (!currentWeek) return;
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(currentWeek));
    window.history.replaceState(null, "", url);
  }, [currentWeek]);
}
