import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchFrame, ReplayFrame, RoundFrame } from "../ws/types";
import type { ConnectionStatus } from "../ws/useReplaySocket";

const BASE_FRAME_INTERVAL_MS = 200; // matches the live server's 1x pacing

interface DemoState {
  status: ConnectionStatus;
  viewSeq: number;
  playing: boolean;
  speed: number;
}

/**
 * Same return shape as useReplaySocket, so useReplay's callers don't need
 * to know which one they're using. Every frame for the pair is fetched once
 * as a flat JSON array (frozen by scripts/export_demo_frames.py) instead of
 * streamed -- with the whole season already in memory, "seeking" is just
 * indexing the array, and there's no cache/catch-up machinery to write.
 * This is what lets the frontend deploy as a static site with no backend.
 *
 * Mounted with key={pairId} by the parent (see ReplaySessionContext), so a
 * pair switch remounts this hook from scratch rather than needing an
 * imperative reset effect.
 */
export function useDemoReplay(pairId: number) {
  const [frames, setFrames] = useState<ReplayFrame[] | null>(null);
  const [state, setState] = useState<DemoState>({
    status: "connecting",
    viewSeq: -1,
    playing: false,
    speed: 1,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}demo/frames-${pairId}.json`)
      .then((r) => r.json())
      .then((data: ReplayFrame[]) => {
        if (cancelled) return;
        setFrames(data);
        setState((s) => ({ ...s, status: "open" }));
      })
      .catch(() => setState((s) => ({ ...s, status: "offline" })));
    return () => {
      cancelled = true;
    };
  }, [pairId]);

  // The state transition (advance, or stop at the end) always happens
  // inside the timer callback, never synchronously while this effect
  // itself runs -- an effect that fires setState immediately on setup
  // just to react to its own dependencies is a smell; deferring to the
  // timer (even a 0ms one at the last frame) keeps this an effect that
  // synchronizes with an external clock, which is what it's for.
  useEffect(() => {
    if (!state.playing || frames === null) return;
    const atEnd = state.viewSeq >= frames.length - 1;
    const id = window.setTimeout(
      () => {
        if (atEnd) setState((s) => ({ ...s, playing: false }));
        else setState((s) => ({ ...s, viewSeq: s.viewSeq + 1 }));
      },
      atEnd ? 0 : BASE_FRAME_INTERVAL_MS / state.speed,
    );
    return () => window.clearTimeout(id);
  }, [state.playing, state.viewSeq, state.speed, frames]);

  const play = useCallback((speed?: number) => {
    setState((s) => ({ ...s, playing: true, speed: speed ?? s.speed }));
  }, []);

  const pause = useCallback(() => {
    setState((s) => ({ ...s, playing: false }));
  }, []);

  const seek = useCallback(
    (targetSeq: number) => {
      const max = (frames?.length ?? 1) - 1;
      const target = Math.max(0, Math.min(targetSeq, max));
      setState((s) => ({ ...s, playing: false, viewSeq: target }));
    },
    [frames],
  );

  const seekToWeek = useCallback(
    (week: number) => {
      if (!frames) return;
      const round = frames.find((f): f is RoundFrame => f.type === "round" && f.games === week);
      if (round) seek(round.seq);
    },
    [frames, seek],
  );

  const { match, roundsSoFar } = useMemo(() => {
    if (frames === null) return { match: null as MatchFrame | null, roundsSoFar: [] as RoundFrame[] };
    let match: MatchFrame | null = null;
    const roundsSoFar: RoundFrame[] = [];
    for (let i = 0; i <= state.viewSeq; i++) {
      const f = frames[i];
      if (f.type === "match") match = f;
      else if (f.type === "round") roundsSoFar.push(f);
    }
    return { match, roundsSoFar };
  }, [frames, state.viewSeq]);

  const latestRound = roundsSoFar.length > 0 ? roundsSoFar[roundsSoFar.length - 1] : null;
  const finished = frames !== null && state.viewSeq >= frames.length - 1;

  // The whole season is already in memory (see the class comment above) --
  // no cache to consult, just index straight into it.
  const frameAt = useCallback(
    (seq: number) => {
      const f = frames?.[seq];
      return f?.type === "match" ? f : undefined;
    },
    [frames],
  );

  return {
    status: state.status,
    totalFrames: frames?.length ?? 0,
    seq: state.viewSeq,
    playing: state.playing,
    speed: state.speed,
    finished,
    error: null as string | null,
    seeking: false,
    table: match?.table ?? null,
    match,
    roundsSoFar,
    latestRound,
    frameAt,
    play,
    pause,
    seek,
    seekToWeek,
  };
}
