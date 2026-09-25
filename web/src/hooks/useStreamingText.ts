import { useCallback, useEffect, useRef, useState } from "react";

// requestAnimationFrame's *rate* isn't guaranteed to be display-vsync-paced
// -- headless/off-screen rendering (exactly the environment Playwright runs
// under) can fire it far faster than 60Hz, and a high-refresh-rate real
// display can too. Gating advances to real elapsed time, not frame count,
// keeps the reveal at a readable, consistent pace either way.
const MIN_FRAME_INTERVAL_MS = 1000 / 60;

/**
 * Reveals `fullText` a few characters at a time, batched to at most one
 * `setState` per animation frame -- same reason the replay coalesces
 * WebSocket frames with `requestAnimationFrame` (see useReplaySocket.ts):
 * decouple the arrival rate of new characters (here: none, the whole answer
 * is already in hand) from the render rate, so a long cached answer doesn't
 * touch the DOM once per character.
 *
 * `stop()` freezes the reveal where it is, rather than jumping to the full
 * text -- a stop button should stop, not fast-forward.
 */
export function useStreamingText(fullText: string, charsPerFrame = 2) {
  // Lazy initializer -- read once at mount, not on every render.
  const [reduceMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Resetting on a prop change belongs during render, not in an effect (the
  // pattern React's own docs recommend for "adjusting state when a prop
  // changes" -- an effect that just resets state synchronously on every
  // dependency change re-renders twice for no reason).
  const [trackedText, setTrackedText] = useState(fullText);
  const [visibleLength, setVisibleLength] = useState(reduceMotion ? fullText.length : 0);
  const [stopped, setStopped] = useState(false);
  if (fullText !== trackedText) {
    setTrackedText(fullText);
    setVisibleLength(reduceMotion ? fullText.length : 0);
    setStopped(false);
  }

  const rafRef = useRef<number | null>(null);
  // Bumped every time a reveal chain starts or is stopped, and captured by
  // each `step` closure -- a chain only keeps scheduling itself while its
  // own generation is still current. Needed because StrictMode's dev-mode
  // double-invoked effects (mount -> cleanup -> mount) can leave two
  // independent `step` recursions alive at once: `step` re-schedules itself
  // directly via requestAnimationFrame, not through the effect, so the
  // effect's own cleanup can only cancel the *one* frame ID it knows about
  // -- an older chain's already-pending frame keeps running past it, and
  // past a stop() call, unless every step checks a live flag itself.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!fullText || stopped || reduceMotion) return undefined;

    const generation = ++generationRef.current;
    let lastAdvance = 0;
    const step = (timestamp: number) => {
      if (generationRef.current !== generation) return;
      if (timestamp - lastAdvance < MIN_FRAME_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      lastAdvance = timestamp;
      setVisibleLength((len) => {
        const next = Math.min(len + charsPerFrame, fullText.length);
        rafRef.current = next >= fullText.length ? null : requestAnimationFrame(step);
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [fullText, charsPerFrame, stopped, reduceMotion]);

  const stop = useCallback(() => {
    generationRef.current++;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStopped(true);
  }, []);

  const visibleText = fullText.slice(0, visibleLength);
  const done = stopped || visibleLength >= fullText.length;
  return { visibleText, done, stop };
}
