import { useEffect, useLayoutEffect, useRef } from "react";

const FLIP_DURATION_MS = 400;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Hand-written FLIP (First, Last, Invert, Play): once React has committed
 * `keys` in a new order, each row still present jumps back to where it used
 * to be on screen via an inverse `translateY`, then eases that back to
 * zero. `getRow` looks up the live element for a key rather than this hook
 * owning refs itself, so the caller keeps its own ref map.
 *
 * The "Play" phase is driven by requestAnimationFrame rather than a CSS
 * transition. A CSS-transitioned transform on a <tr> read back via a
 * forced-reflow getBoundingClientRect (needed to interrupt one reorder with
 * the next) compounds into garbage values within a few rapid re-renders --
 * confirmed empirically, matches `<tr>` being outside the elements the
 * transforms spec guarantees behave predictably on. Setting an exact
 * translateY every frame from our own arithmetic sidesteps it entirely: we
 * only ever read a position back after explicitly resetting to `none`.
 *
 * No dependency array on the main effect: this needs to run after *every*
 * commit, comparing against the positions captured after the *previous*
 * commit, so the "First" measurement for this reorder is just the "Last"
 * measurement left over from the last time the effect ran.
 */
export function useFlip<K>(keys: readonly K[], getRow: (key: K) => HTMLElement | null): void {
  const prevRects = useRef<Map<K, DOMRect>>(new Map());
  const activeRafs = useRef<Map<K, number>>(new Map());

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Two passes, not one interleaved loop: writing a row's transform and
    // then immediately reading another row's (or its own) bounding rect
    // forces the browser to flush layout on every iteration. Resetting
    // every row first, then measuring every row, forces at most one reflow
    // for the whole table instead of one per row.
    for (const key of keys) {
      const el = getRow(key);
      if (!el) continue;
      const runningRaf = activeRafs.current.get(key);
      if (runningRaf !== undefined) {
        cancelAnimationFrame(runningRaf);
        activeRafs.current.delete(key);
      }
      el.style.transform = "none"; // true layout position, not a mid-animation one
    }

    const nextRects = new Map<K, DOMRect>();
    for (const key of keys) {
      const el = getRow(key);
      if (!el) continue;
      nextRects.set(key, el.getBoundingClientRect());
    }

    if (!reduceMotion) {
      for (const [key, next] of nextRects) {
        const prev = prevRects.current.get(key);
        if (!prev) continue; // newly mounted row -- nothing to animate from
        const deltaY = prev.top - next.top;
        if (deltaY === 0) continue;

        const el = getRow(key);
        if (!el) continue;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / FLIP_DURATION_MS, 1);
          const offset = deltaY * (1 - easeOutCubic(t));
          el.style.transform = offset === 0 ? "none" : `translateY(${offset}px)`;
          if (t < 1) {
            activeRafs.current.set(key, requestAnimationFrame(tick));
          } else {
            activeRafs.current.delete(key);
          }
        };
        activeRafs.current.set(key, requestAnimationFrame(tick));
      }
    }

    prevRects.current = nextRects;
  });

  // Separate, mount-once effect: its cleanup only needs to run when this
  // component instance goes away, not before every render's main effect
  // above (which would cancel animations that are supposed to survive
  // being interrupted by the next reorder).
  useEffect(() => {
    const rafs = activeRafs.current; // stable Map identity, only ever mutated in place
    return () => {
      rafs.forEach((id) => cancelAnimationFrame(id));
      rafs.clear();
    };
  }, []);
}
