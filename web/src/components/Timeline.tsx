import { useState } from "react";
import { Slider } from "./ui/Slider";

interface TimelineProps {
  seq: number;
  totalFrames: number;
  disabled?: boolean;
  onSeek: (seq: number) => void;
}

/**
 * value updates as the user drags (for visual feedback) but onSeek only
 * fires on release (onValueCommit, which Radix also fires for keyboard
 * moves) -- dragging across the whole season doesn't fire a network
 * catch-up on every pixel of motion.
 */
export function Timeline({ seq, totalFrames, disabled, onSeek }: TimelineProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const max = Math.max(totalFrames - 1, 0);
  const value = dragValue ?? Math.max(seq, 0);

  // Cleared synchronously in the same handler that commits the seek,
  // rather than in an effect watching `seq` -- no need to wait a render
  // for the prop to catch up.
  const commit = (next: number) => {
    onSeek(next);
    setDragValue(null);
  };

  return (
    <Slider
      aria-label="replay position"
      min={0}
      max={max}
      value={value}
      disabled={disabled || totalFrames === 0}
      onValueChange={setDragValue}
      onValueCommit={commit}
    />
  );
}
