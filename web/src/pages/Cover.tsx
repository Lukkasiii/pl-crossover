import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { usePooledCurve, type PooledCurve } from "../api/usePooledCurve";
import { prefersReducedMotion } from "../routing/coverTransition";
import styles from "./Cover.module.css";

const VIEW_W = 1000;
const VIEW_H = 320;
// Bottom padding leaves room under the curve's last point for its HTML label.
const PAD = { left: 8, right: 8, top: 8, bottom: 44 };
/** Seconds for the current-season line to draw across all 38 games -- linear, so the crossover marker's delay is just its share of this. */
const DRAW_SECONDS = 7;

// Keys that enter the dashboard. Arrow/Page Down count as "scrolling" for a
// keyboard user -- the page has nothing else to scroll to.
const ENTER_KEYS = new Set(["Enter", " ", "ArrowDown", "PageDown"]);
// A trackpad fires many small wheel events per gesture; one stray tick
// shouldn't fling a visitor into the dashboard.
const WHEEL_THRESHOLD = 40;
const SWIPE_THRESHOLD = 40;

interface CurveGeometry {
  currentPath: string;
  priorY: number;
  crossoverX: number;
  endY: number;
  crossoverDelay: number;
}

/**
 * The xG curve from the same pooled fit the Overview chart draws, scaled
 * into the cover's viewBox. Real data, not a decorative squiggle: the line
 * that draws itself is the one the whole site is about.
 */
function geometry(curve: PooledCurve): CurveGeometry | null {
  if (curve.games.length < 2 || curve.crossover === null) return null;
  const values = [...curve.currentRmse, curve.priorRmse];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const firstGame = curve.games[0];
  const lastGame = curve.games[curve.games.length - 1];
  const x = (g: number) => PAD.left + ((g - firstGame) / (lastGame - firstGame)) * (VIEW_W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (VIEW_H - PAD.top - PAD.bottom);
  const currentPath = curve.games
    .map((g, i) => `${i === 0 ? "M" : "L"}${x(g).toFixed(1)},${y(curve.currentRmse[i]).toFixed(1)}`)
    .join(" ");
  return {
    currentPath,
    priorY: y(curve.priorRmse),
    crossoverX: x(curve.crossover),
    endY: y(curve.currentRmse[curve.currentRmse.length - 1]),
    crossoverDelay: ((curve.crossover - firstGame) / (lastGame - firstGame)) * DRAW_SECONDS,
  };
}

/**
 * The cover `/` serves: one question, one sentence, one way in. Scroll,
 * swipe, click, Enter or Space all lead to /overview; nothing here can
 * scroll, so there is nothing to trap -- every gesture that would scroll
 * is the gesture that leaves.
 */
export default function Cover() {
  const { t, locale, setLocale, formatNumber } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { curve } = usePooledCurve("xg");
  const geo = useMemo(() => (curve ? geometry(curve) : null), [curve]);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const returning = (location.state as { returning?: boolean } | null)?.returning === true;

  // ?lang= rides along, so a Chinese-language visitor lands on a Chinese dashboard.
  const overviewTarget = useMemo(() => ({ pathname: "/overview", search: location.search }), [location.search]);

  const enter = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (prefersReducedMotion()) navigate(overviewTarget);
    else setLeaving(true);
  }, [navigate, overviewTarget]);

  useEffect(() => {
    document.title = t("nav.siteTitle");
  }, [t]);

  useEffect(() => {
    let wheelTotal = 0;
    let touchStartY: number | null = null;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) {
        wheelTotal = 0;
        return;
      }
      wheelTotal += e.deltaY;
      if (wheelTotal >= WHEEL_THRESHOLD) enter();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      if (touchStartY - y >= SWIPE_THRESHOLD) enter();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ENTER_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
      // Enter/Space on a focused control (the language buttons, the enter
      // link itself) should do what that control does, not be hijacked.
      if (e.target instanceof HTMLElement && e.target.closest("button, a, input, select, textarea")) return;
      e.preventDefault();
      enter();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enter]);

  const className = [styles.cover, leaving && styles.leaving, returning && !leaving && styles.returning]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-testid="page-cover"
      data-state={leaving ? "leaving" : "idle"}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) navigate(overviewTarget);
      }}
    >
      <header className={styles.topbar}>
        <span className={styles.brand}>{t("nav.siteTitle")}</span>
        <div className="locale-switcher" role="group" aria-label={t("nav.langSwitcher")}>
          <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")} data-testid="locale-en">
            EN
          </button>
          <button type="button" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")} data-testid="locale-zh">
            中文
          </button>
        </div>
      </header>

      <main className={styles.body}>
        <h1 className={styles.headline}>{t("cover.headline")}</h1>
        <p className={styles.subtitle}>{t("cover.subtitle")}</p>
        <Link
          to={overviewTarget}
          className={styles.enter}
          data-testid="cover-enter"
          onClick={(e) => {
            e.preventDefault();
            enter();
          }}
        >
          {t("cover.enter")} <span aria-hidden="true">→</span>
        </Link>
      </main>

      {geo && curve?.crossover != null && (
        <div className={styles.chart}>
          {/* Labels are HTML beside the SVG, not SVG text: preserveAspectRatio
              "none" stretches the curve to any width, and SVG text would
              stretch with it. */}
          <div className={styles.markerRow} aria-hidden="true">
            <span
              className={styles.markerLabel}
              style={{ left: `${(geo.crossoverX / VIEW_W) * 100}%`, animationDelay: `${geo.crossoverDelay}s` }}
            >
              ⚡ {formatNumber(curve.crossover, { maximumFractionDigits: 1 })}
            </span>
          </div>
          <div className={styles.plot}>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={t("cover.chartLabel", { games: formatNumber(curve.crossover, { maximumFractionDigits: 1 }) })}
              data-testid="cover-curve"
            >
              <line
                className={styles.prior}
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={geo.priorY}
                y2={geo.priorY}
                vectorEffect="non-scaling-stroke"
              />
              <path
                className={styles.current}
                d={geo.currentPath}
                pathLength={1}
                vectorEffect="non-scaling-stroke"
                style={{ animationDuration: `${DRAW_SECONDS}s` }}
              />
              <line
                className={styles.marker}
                x1={geo.crossoverX}
                x2={geo.crossoverX}
                y1={0}
                y2={VIEW_H}
                vectorEffect="non-scaling-stroke"
                style={{ animationDelay: `${geo.crossoverDelay}s` }}
              />
            </svg>
            <span className={styles.priorLabel} style={{ top: `${(geo.priorY / VIEW_H) * 100}%` }} aria-hidden="true">
              {t("cover.priorLabel")}
            </span>
            <span
              className={styles.currentLabel}
              style={{ top: `${(geo.endY / VIEW_H) * 100}%`, animationDelay: `${DRAW_SECONDS}s` }}
              aria-hidden="true"
            >
              {t("cover.currentLabel")}
            </span>
          </div>
        </div>
      )}

      <div className={styles.scrollHint} aria-hidden="true">
        <span>{t("cover.scroll")}</span>
        <span className={styles.chevron}>↓</span>
      </div>
    </div>
  );
}
