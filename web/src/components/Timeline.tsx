import { useRef, useState, type MouseEvent } from "react";
import { Slider } from "./ui/Slider";
import { useLocale } from "../i18n/LocaleContext";
import type { MatchFrame } from "../ws/types";
import { TOTAL_MATCHES } from "./replayFormat";
import styles from "./Timeline.module.css";

interface TimelineProps {
  seq: number;
  totalFrames: number;
  disabled?: boolean;
  onSeek: (seq: number) => void;
  seasonStart: string;
  seasonEnd: string;
  /** seq of the round frame where the active metric's crossover was first passed, or null if not reached yet. */
  crossoverSeq: number | null;
  /** Cached match frame at `seq`, or undefined if that far hasn't streamed/loaded in yet. */
  frameAt: (seq: number) => MatchFrame | undefined;
}

/**
 * Slider positions run 0..totalFrames, one more than there are frames:
 * position 0 is "before kickoff" (seq -1, nothing streamed into view) and
 * position p is frame p - 1. That keeps the season's start a place you can
 * drag back to without inventing a frame for it.
 *
 * value updates as the user drags (for visual feedback) but onSeek only
 * fires on release (onValueCommit, which Radix also fires for keyboard
 * moves) -- dragging across the whole season doesn't fire a network
 * catch-up on every pixel of motion.
 */
export function Timeline({
  seq,
  totalFrames,
  disabled,
  onSeek,
  seasonStart,
  seasonEnd,
  crossoverSeq,
  frameAt,
}: TimelineProps) {
  const { t, formatNumber, formatDate } = useLocale();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [hoverSeq, setHoverSeq] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const max = totalFrames;
  const value = dragValue ?? seq + 1;

  // Cleared synchronously in the same handler that commits the seek,
  // rather than in an effect watching `seq` -- no need to wait a render
  // for the prop to catch up.
  const commit = (position: number) => {
    onSeek(position - 1);
    setDragValue(null);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || max === 0) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverSeq(Math.round(pct * max)); // a slider position, not a seq
  };

  // dragValue wins over hoverSeq: mid-drag (mouse or keyboard), the preview
  // follows the thumb, not wherever the cursor happens to be.
  const previewPosition = dragValue ?? hoverSeq;
  const previewMatch = previewPosition !== null && previewPosition > 0 ? frameAt(previewPosition - 1) : undefined;
  const previewPct = previewPosition !== null && max > 0 ? (previewPosition / max) * 100 : null;
  const crossoverPct = crossoverSeq !== null && max > 0 ? ((crossoverSeq + 1) / max) * 100 : null;

  return (
    <div className={styles.wrap}>
      <div
        className={styles.track}
        ref={trackRef}
        onMouseMove={disabled ? undefined : handleMouseMove}
        onMouseLeave={() => setHoverSeq(null)}
      >
        <Slider
          aria-label={t("player.positionLabel")}
          data-testid="replay-timeline"
          min={0}
          max={max}
          value={value}
          disabled={disabled || totalFrames === 0}
          onValueChange={setDragValue}
          onValueCommit={commit}
        />
        {crossoverPct !== null && (
          <div
            className={styles.crossoverMark}
            style={{ left: `${crossoverPct}%` }}
            title={t("player.crossoverHint")}
            data-testid="timeline-crossover-mark"
            aria-hidden="true"
          />
        )}
        {previewPct !== null && (previewMatch || previewPosition === 0) && (
          <div className={styles.hoverPreview} style={{ left: `${previewPct}%` }} aria-hidden="true">
            {previewMatch
              ? t("player.hoverPreview", {
                  number: formatNumber(previewMatch.match_number),
                  total: formatNumber(TOTAL_MATCHES),
                  date: formatDate(previewMatch.played_at),
                })
              : t("player.preKickoffShort")}
          </div>
        )}
      </div>
      <div className={styles.dates} aria-hidden="true">
        <span title={t("player.seasonStart")}>{seasonStart ? formatDate(seasonStart) : ""}</span>
        <span title={t("player.seasonEnd")}>{seasonEnd ? formatDate(seasonEnd) : ""}</span>
      </div>
    </div>
  );
}
