import { useEffect, useRef, useState } from "react";

const TWEEN_DURATION_MS = 400;

/**
 * Animates from whatever is currently displayed to `value` via
 * requestAnimationFrame, rounding to whole numbers (points, goal
 * difference). `displayRef` tracks the actual last-rendered number rather
 * than the previous target, so a value that changes again mid-tween
 * restarts smoothly from where the animation currently is instead of
 * snapping back to the old target first.
 */
export function useTweenedNumber(value: number): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = displayRef.current;
    if (reduceMotion || from === value) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / TWEEN_DURATION_MS, 1);
      const next = Math.round(from + (value - from) * t);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return display;
}
