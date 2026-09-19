import type { ConnectionStatus } from "../ws/useReplaySocket";

const SPEEDS = [1, 5, 10, 25, 50];

interface PlayerControlsProps {
  status: ConnectionStatus;
  playing: boolean;
  speed: number;
  seq: number;
  totalFrames: number;
  finished: boolean;
  onPlay: (speed?: number) => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
}

export function PlayerControls({
  status,
  playing,
  speed,
  seq,
  totalFrames,
  finished,
  onPlay,
  onPause,
  onSpeedChange,
}: PlayerControlsProps) {
  const canPlay = status === "open";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
        frame {seq} / {totalFrames || "?"}
      </span>
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
