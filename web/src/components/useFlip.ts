import { useEffect, useLayoutEffect, useRef } from "react";

// Shorter than the 200ms gap between match frames at 1x (BASE_FRAME_INTERVAL
// in routers/replay.py, BASE_FRAME_INTERVAL_MS in useDemoReplay.ts): at the
// old 400ms every reorder at 1x was still mid-flight when the next frame
// landed, so the table was never at rest. Ease-out, so most of the travel
// happens early and a row reads as "arrived" well before the next frame.
const FLIP_DURATION_MS = 180;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Hand-written FLIP (First, Last, Invert, Play): once React has committed
 * `keys` in a new order, each row still present jumps back to where it used
 * to be on screen via an inverse `translateY`, then eases that back to
 * zero. `getRow` looks up the live element for a key rather than this hook
 * owning refs itself, so the caller keeps its own ref map.
 *
 * The "Play" phase is driven by requestAnimationFrame rather than a CSS
 * transition, because a reorder here can be interrupted by the next one a
 * few frames later. getBoundingClientRect() during a running transition
 * reports the *interpolated* position, not the layout position, so a delta
 * measured mid-flight is measured against a moving target and compounds
 * into garbage within a few rapid re-renders -- confirmed empirically.
 * Resetting to `transform: none` before measuring is the standard way out,
 * but under a transition that reset animates too, so the read is still a
 * mid-flight value. Driving the offset ourselves avoids the problem at the
 * root: a position is only ever read back after an instantaneous reset.
 *
 * No dependency array on the main effect: this needs to run after *every*
 * commit, comparing against the positions captured after the *previous*
 * commit, so the "First" measurement for this reorder is just the "Last"
 * measurement left over from the last time the effect ran.
 */
export function useFlip<K>(keys: readonly K[], getRow: (key: K) => HTMLElement | null): void {
  const prevRects = useRef<Map<K, DOMRect>>(new Map());
  const prevKeys = useRef<readonly K[]>([]);
  const activeRafs = useRef<Map<K, number>>(new Map());
  // The translateY each row is visually offset by right now -- tracked here
  // rather than read back from the DOM (see below for why reading it back
  // is unreliable), so an interrupted animation can resume from where the
  // row actually is on screen instead of snapping back to its last layout
  // position first. At faster speeds interruption is the normal case.
  const currentOffsets = useRef<Map<K, number>>(new Map());

  useLayoutEffect(() => {
    // A re-render that doesn't actually reorder `keys` must be a no-op here,
    // not just a no-animation case: getBoundingClientRect() is
    // viewport-relative, so any render caused by something other than a
    // reorder (hover state toggling as the pointer's target changes under a
    // stationary cursor while the page scrolls, for instance) would measure
    // rows at their scrolled position and read the scroll delta itself as a
    // deltaY to "correct" -- animating every row as if it had just been
    // reordered, when the page had simply scrolled. Comparing by value
    // (not by array identity, which is a fresh literal every render
    // regardless) is what makes this check mean anything.
    const keysUnchanged =
      keys.length === prevKeys.current.length && keys.every((k, i) => k === prevKeys.current[i]);
    prevKeys.current = keys;
    if (keysUnchanged) return;

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
        // Where the row was *drawn* just before this commit: its previous
        // layout position plus whatever offset its interrupted animation
        // had reached.
        const deltaY = prev.top + (currentOffsets.current.get(key) ?? 0) - next.top;
        currentOffsets.current.delete(key);
        if (deltaY === 0) continue;

        const el = getRow(key);
        if (!el) continue;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / FLIP_DURATION_MS, 1);
          const offset = deltaY * (1 - easeOutCubic(t));
          el.style.transform = offset === 0 ? "none" : `translateY(${offset}px)`;
          currentOffsets.current.set(key, offset);
          if (t < 1) {
            activeRafs.current.set(key, requestAnimationFrame(tick));
          } else {
            activeRafs.current.delete(key);
            currentOffsets.current.delete(key);
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
