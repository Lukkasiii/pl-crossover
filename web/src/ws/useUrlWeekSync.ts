import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useUrlParamWriter } from "../routing/useUrlParamWriter";

/**
 * Keeps `?week=` in the URL in sync with the replay's current round: a
 * refresh keeps your place and links are shareable. Writes go through
 * useUrlParamWriter (shared with LocaleContext's `?lang=`) rather than a
 * bare useSearchParams/history.replaceState -- see that hook's comment for
 * why: two independent writers on the same URL race unless both merge from
 * the live `window.location`, not a react-router `location` snapshot.
 * `sigma` isn't in the URL yet -- there's no control that sets it until
 * Feature 2 lands, and an inert query param is worse than none.
 */
/**
 * `currentWeek` is undefined while nothing is known yet (still connecting,
 * or mid-seek) and null once the replay is deliberately before kickoff --
 * only the latter clears `?week=`, and only after a week has been written,
 * so a deep link's own week is never wiped before its seek lands.
 */
export function useUrlWeekSync(
  ready: boolean,
  currentWeek: number | null | undefined,
  seekToWeek: (week: number) => void,
) {
  const [searchParams] = useSearchParams();
  const writeUrlParam = useUrlParamWriter();
  const appliedInitial = useRef(false);
  const wroteWeek = useRef(false);

  useEffect(() => {
    if (!ready || appliedInitial.current) return;
    appliedInitial.current = true;
    const week = Number(searchParams.get("week"));
    if (Number.isInteger(week) && week >= 1 && week <= 38) seekToWeek(week);
    // Intentionally only depends on `ready`/`seekToWeek` -- this reads the
    // URL once, on the transition into "ready", not on every search-param
    // change (that would re-seek on an unrelated ?lang= toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seekToWeek]);

  useEffect(() => {
    if (currentWeek === null) {
      if (wroteWeek.current) writeUrlParam((params) => params.delete("week"));
      wroteWeek.current = false;
      return;
    }
    if (!currentWeek) return;
    wroteWeek.current = true;
    writeUrlParam((params) => params.set("week", String(currentWeek)));
  }, [currentWeek, writeUrlParam]);
}
