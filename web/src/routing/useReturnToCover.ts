import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// A deliberate upward pull, not the tail of a scroll that just reached the
// top: the page has to have *been* at the top for a moment before a wheel
// or swipe counts, and the pull has to add up to more than a stray tick.
const SETTLE_MS = 350;
const WHEEL_THRESHOLD = 120;
const SWIPE_THRESHOLD = 80;

/**
 * Scrolling up past the very top of /overview brings the cover back. Never
 * prevents default and never listens below the top, so ordinary scrolling
 * -- including back up to the top -- is untouched; only a further pull once
 * already there leaves. Keyboard users have the site title link instead.
 */
export function useReturnToCover() {
  const navigate = useNavigate();

  useEffect(() => {
    let atTopSince = window.scrollY <= 0 ? performance.now() : null;
    let pull = 0;
    let touchStartY: number | null = null;
    let left = false;

    const settledAtTop = () => atTopSince !== null && performance.now() - atTopSince >= SETTLE_MS;
    const leave = () => {
      if (left) return;
      left = true;
      navigate({ pathname: "/", search: window.location.search }, { state: { returning: true } });
    };

    const onScroll = () => {
      if (window.scrollY > 0) {
        atTopSince = null;
        pull = 0;
      } else if (atTopSince === null) {
        atTopSince = performance.now();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0 || !settledAtTop()) {
        pull = 0;
        return;
      }
      pull -= e.deltaY;
      if (pull >= WHEEL_THRESHOLD) leave();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = settledAtTop() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      if (y - touchStartY >= SWIPE_THRESHOLD) leave();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [navigate]);
}
