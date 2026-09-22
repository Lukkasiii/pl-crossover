import { Timeline } from "./Timeline";
import { Select } from "./ui/Select";
import { useLocale } from "../i18n/LocaleContext";
import type { ConnectionStatus } from "../ws/useReplaySocket";
import type { TranslationKey } from "../i18n/dictionaries";

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
  const { t } = useLocale();
  const canPlay = status === "open";
  const playState = playing ? "playing" : finished ? "finished" : "paused";

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
        <span title={status} role="status">
          <span aria-hidden="true">{statusEmoji(status)}</span> {t(statusLabelKey(status))}
        </span>
        <button onClick={togglePlay} disabled={!canPlay} data-testid="player-toggle" data-state={playState}>
          {playing ? `⏸ ${t("player.pause")}` : finished ? `↻ ${t("player.replay")}` : `▶ ${t("player.play")}`}
        </button>
        <Select
          aria-label={t("player.speedLabel")}
          data-testid="speed-select"
          value={String(speed)}
          onValueChange={(v) => {
            const next = Number(v);
            onSpeedChange(next);
            if (playing) onPlay(next);
          }}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))}
        />
        <span className="frame-count" data-testid="frame-counter" data-seq={Math.max(seq, 0)} data-total={totalFrames}>
          {t("player.frameCount", { seq: Math.max(seq, 0), total: totalFrames || "?" })}
          {seeking && ` ${t("player.seeking")}`}
        </span>
      </div>
      <Timeline seq={seq} totalFrames={totalFrames} disabled={!canPlay || seeking} onSeek={onSeek} />
    </div>
  );
}

function statusEmoji(status: ConnectionStatus): string {
  switch (status) {
    case "open":
      return "🟢";
    case "connecting":
    case "reconnecting":
      return "🟡";
    default:
      return "🔴";
  }
}

function statusLabelKey(status: ConnectionStatus): TranslationKey {
  switch (status) {
    case "open":
      return "player.statusLive";
    case "connecting":
      return "player.statusConnecting";
    case "reconnecting":
      return "player.statusReconnecting";
    default:
      return "player.statusOffline";
  }
}
