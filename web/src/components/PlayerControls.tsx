import { Timeline } from "./Timeline";
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

  return (
    <div className="player-controls">
      <div className="player-controls-row">
        <span title={status}>{statusDot(status)}</span>
        <button onClick={() => (playing ? onPause() : onPlay())} disabled={!canPlay}>
          {playing ? "⏸ Pause" : finished ? "↻ Replay" : "▶ Play"}
        </button>
        <label>
          speed{" "}
          <select
            value={speed}
            onChange={(e) => {
              const next = Number(e.target.value);
              onSpeedChange(next);
              if (playing) onPlay(next);
            }}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <span>
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
