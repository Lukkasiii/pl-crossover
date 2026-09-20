import { Timeline } from "./Timeline";
import { Select } from "./ui/Select";
import type { ConnectionStatus } from "../ws/useReplaySocket";

const SPEEDS = [1, 5, 10, 25, 50];

interface PlayerControlsProps {
  status: ConnectionStatus;
  playing: boolean;
  speed: number;
  seq: number;
  totalFrames: number;
  finished: boolean;
  seeking: boolean;
  onPlay: (speed?: number) => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (seq: number) => void;
}

export function PlayerControls({
  status,
  playing,
  speed,
  seq,
  totalFrames,
  finished,
  seeking,
  onPlay,
  onPause,
  onSpeedChange,
  onSeek,
}: PlayerControlsProps) {
  const canPlay = status === "open";

  const togglePlay = () => {
    if (playing) {
      onPause();
    } else if (finished) {
      onSeek(0); // sent before play() below -- same socket, so order is preserved
      onPlay();
    } else {
      onPlay();
    }
  };

  return (
    <div className="player-controls">
      <div className="player-controls-row">
        <span title={status}>{statusDot(status)}</span>
        <button onClick={togglePlay} disabled={!canPlay}>
          {playing ? "⏸ Pause" : finished ? "↻ Replay" : "▶ Play"}
        </button>
        <Select
          aria-label="replay speed"
          value={String(speed)}
          onValueChange={(v) => {
            const next = Number(v);
            onSpeedChange(next);
            if (playing) onPlay(next);
          }}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))}
        />
        <span className="frame-count">
          frame {Math.max(seq, 0)} / {totalFrames || "?"}
          {seeking && " (seeking…)"}
        </span>
      </div>
      <Timeline seq={seq} totalFrames={totalFrames} disabled={!canPlay || seeking} onSeek={onSeek} />
    </div>
  );
}

function statusDot(status: ConnectionStatus): string {
  switch (status) {
    case "open":
      return "🟢 live";
    case "connecting":
      return "🟡 connecting";
    default:
      return "🔴 offline";
  }
}
