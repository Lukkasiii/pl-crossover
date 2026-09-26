import { Timeline } from "./Timeline";
import { Select } from "./ui/Select";
import { gamesPlayedRange, TOTAL_MATCHES } from "./replayFormat";
import { useLocale } from "../i18n/LocaleContext";
import type { ConnectionStatus } from "../ws/useReplaySocket";
import type { MatchFrame, TableRow } from "../ws/types";
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
  match: MatchFrame | null;
  table: TableRow[] | null;
  seasonStart: string;
  seasonEnd: string;
  crossoverSeq: number | null;
  frameAt: (seq: number) => MatchFrame | undefined;
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
  match,
  table,
  seasonStart,
  seasonEnd,
  crossoverSeq,
  frameAt,
  onPlay,
  onPause,
  onSpeedChange,
  onSeek,
}: PlayerControlsProps) {
  const { t, formatNumber, formatDate } = useLocale();
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

  const range = gamesPlayedRange(table);
  const gamesLabel = range
    ? range[0] === range[1]
      ? formatNumber(range[0])
      : `${formatNumber(range[0])}–${formatNumber(range[1])}`
    : formatNumber(0);
  const matchStatus = match
    ? t("player.matchStatus", {
        number: formatNumber(match.match_number),
        total: formatNumber(TOTAL_MATCHES),
        date: formatDate(match.played_at),
        games: gamesLabel,
      })
    : seq < 0 && table
      ? t("player.preKickoff", { total: formatNumber(TOTAL_MATCHES) })
      : "";

  return (
    <div className="player-controls">
      <div className="player-controls-row">
        <span title={status} role="status" data-live-state={canPlay ? (playing ? "playing" : "paused") : status}>
          <span aria-hidden="true">{statusEmoji(status, playing)}</span> {t(statusLabelKey(status))}
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
            // Always remember the new speed; only actually resend it to the
            // server (restarting the stream at that rate) if playback is
            // already running -- changing your mind while paused shouldn't
            // start it.
            onSpeedChange(next);
            if (playing) onPlay(next);
          }}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))}
        />
        <span className="frame-count" data-testid="frame-counter" data-seq={seq} data-total={totalFrames}>
          {matchStatus}
          {seeking && ` ${t("player.seeking")}`}
        </span>
      </div>
      <Timeline
        seq={seq}
        totalFrames={totalFrames}
        disabled={!canPlay || seeking}
        onSeek={onSeek}
        seasonStart={seasonStart}
        seasonEnd={seasonEnd}
        crossoverSeq={crossoverSeq}
        frameAt={frameAt}
      />
    </div>
  );
}

function statusEmoji(status: ConnectionStatus, playing: boolean): string {
  switch (status) {
    case "open":
      return playing ? "🟢" : "🔴";
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
