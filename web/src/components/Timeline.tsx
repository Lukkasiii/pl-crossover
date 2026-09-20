import { useState } from "react";

interface TimelineProps {
  seq: number;
  totalFrames: number;
  disabled?: boolean;
  onSeek: (seq: number) => void;
}

/**
 * A plain range input: value updates as the user drags (for visual
 * feedback) but onSeek only fires on release, so dragging across the
 * whole season doesn't fire a network catch-up on every pixel of motion.
 * Arrow/Home/End keys work natively on a focused range input; committing
 * on keyup gets them the same debounce as a mouse drag.
 */
export function Timeline({ seq, totalFrames, disabled, onSeek }: TimelineProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const max = Math.max(totalFrames - 1, 0);
  const value = dragValue ?? Math.max(seq, 0);

  // Cleared synchronously in the same handler that commits the seek,
  // rather than in an effect watching `seq` -- no need to wait a render
  // for the prop to catch up.
  const commit = (raw: string) => {
    onSeek(Number(raw));
    setDragValue(null);
  };

  return (
    <input
      type="range"
      aria-label="replay position"
      min={0}
      max={max}
      value={value}
      disabled={disabled || totalFrames === 0}
      onChange={(e) => setDragValue(Number(e.target.value))}
      onMouseUp={(e) => commit((e.target as HTMLInputElement).value)}
      onTouchEnd={(e) => commit((e.target as HTMLInputElement).value)}
      onKeyUp={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
          commit((e.target as HTMLInputElement).value);
        }
      }}
      style={{ width: "100%" }}
    />
  );
}
