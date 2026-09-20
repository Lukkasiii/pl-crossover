import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WS_BASE_URL } from "../api/client";
import { FrameCache } from "./frameCache";
import type { ReplayCommand, ReplayFrame } from "./types";

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

interface ReplayState {
  status: ConnectionStatus;
  totalFrames: number;
  /** -1 before the first frame has been shown */
  viewSeq: number;
  playing: boolean;
  speed: number;
  finished: boolean;
  error: string | null;
  /** true while a seek is scanning frames the client hasn't cached yet */
  seeking: boolean;
}

const initialState: ReplayState = {
  status: "connecting",
  totalFrames: 0,
  viewSeq: -1,
  playing: false,
  speed: 1,
  finished: false,
  error: null,
  seeking: false,
};

/**
 * Owns the /ws/replay connection for one season pair.
 *
 * Every match/round frame the server has ever sent is kept in a FrameCache
 * (see frameCache.ts). React state only tracks the playhead (viewSeq) and
 * connection flags; the visible table and round history come from
 * useSyncExternalStore reading that cache. Two things fall out of that
 * split for free:
 *
 * - during normal playback, one cache write per message plus one state
 *   commit per animation frame keeps the render rate capped however fast
 *   the socket streams (up to 50x = a frame every ~4ms)
 * - seeking backward to an already-seen seq is a pure cache read, no
 *   network round trip
 *
 * Seeking forward past what has streamed in has to fetch the gap first
 * (`seek` fetches frame-by-frame in order) because the round panels need
 * every round frame up to that point, not just the one at the target.
 */
export function useReplaySocket(pairId: number) {
  const [state, setState] = useState<ReplayState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);

  const [cache] = useState(() => new FrameCache());

  const resolverQueueRef = useRef<((frame: ReplayFrame | null) => void)[]>([]);
  const isSeekingRef = useRef(false);

  const pendingSeqRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const seq = pendingSeqRef.current;
    if (seq === null) return;
    pendingSeqRef.current = null;
    setState((s) => (s.viewSeq === seq ? s : { ...s, viewSeq: seq }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const send = useCallback((cmd: ReplayCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(cmd));
  }, []);

  /** Sends a command and resolves with the one frame that answers it; null if the socket wasn't open to send on. */
  const requestFrame = useCallback((cmd: ReplayCommand) => {
    return new Promise<ReplayFrame | null>((resolve) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }
      resolverQueueRef.current.push(resolve);
      wsRef.current.send(JSON.stringify(cmd));
    });
  }, []);

  useEffect(() => {
    resolverQueueRef.current = [];
    pendingSeqRef.current = null;

    const ws = new WebSocket(`${WS_BASE_URL}/ws/replay?pair=${pairId}`);
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, status: "open" }));
    ws.onclose = () => setState((s) => ({ ...s, status: "closed" }));
    ws.onerror = () => setState((s) => ({ ...s, status: "error" }));
    ws.onmessage = (ev) => {
      const frame: ReplayFrame = JSON.parse(ev.data);

      // A pending seek's answer is consumed here instead of the normal
      // streaming path -- the caller is awaiting it directly.
      if (resolverQueueRef.current.length > 0 && (frame.type === "match" || frame.type === "round")) {
        cache.add(frame);
        resolverQueueRef.current.shift()!(frame);
        return;
      }

      switch (frame.type) {
        case "init":
          setState((s) => ({ ...s, totalFrames: frame.total_frames }));
          break;
        case "match":
        case "round":
          cache.add(frame);
          pendingSeqRef.current = frame.seq;
          scheduleFlush();
          break;
        case "done":
          setState((s) => ({ ...s, playing: false, finished: true }));
          break;
        case "error":
          setState((s) => ({ ...s, status: "error", error: frame.message }));
          break;
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [pairId, cache, scheduleFlush]);

  const play = useCallback(
    (speed?: number) => {
      const nextSpeed = speed ?? state.speed;
      send({ cmd: "play", speed: nextSpeed });
      setState((s) => ({ ...s, playing: true, speed: nextSpeed, finished: false }));
    },
    [send, state.speed],
  );

  const pause = useCallback(() => {
    send({ cmd: "pause" });
    setState((s) => ({ ...s, playing: false }));
  }, [send]);

  const seek = useCallback(
    async (targetSeq: number) => {
      if (isSeekingRef.current) return;
      const target = Math.max(0, Math.min(targetSeq, state.totalFrames - 1));
      if (state.playing) pause();

      isSeekingRef.current = true;
      if (target > cache.cachedThrough) {
        setState((s) => ({ ...s, seeking: true }));
        for (let i = cache.cachedThrough + 1; i <= target; i++) {
          const frame = await requestFrame({ cmd: "seek", seq: i });
          if (frame === null) break;
        }
        setState((s) => ({ ...s, seeking: false }));
      } else {
        // Already cached -- just tell the server so its own cursor agrees, for the next play().
        send({ cmd: "seek", seq: target });
      }
      isSeekingRef.current = false;
      setState((s) => ({ ...s, viewSeq: target, finished: target >= s.totalFrames - 1 }));
    },
    [state.playing, state.totalFrames, cache, pause, requestFrame, send],
  );

  /** For the `?week=` deep link: scan forward until that round has streamed in, without rendering every step. */
  const seekToWeek = useCallback(
    async (week: number) => {
      if (isSeekingRef.current || week <= 0) return;
      const cached = cache.roundAtWeek(week);
      if (cached) {
        setState((s) => ({ ...s, viewSeq: cached.seq }));
        return;
      }

      isSeekingRef.current = true;
      setState((s) => ({ ...s, seeking: true }));
      let found: number | null = null;
      for (let i = cache.cachedThrough + 1; found === null && i < state.totalFrames; i++) {
        const frame = await requestFrame({ cmd: "seek", seq: i });
        if (frame === null) break;
        if (frame.type === "round" && frame.games === week) found = frame.seq;
      }
      isSeekingRef.current = false;
      setState((s) => ({ ...s, seeking: false, viewSeq: found ?? s.viewSeq }));
    },
    [state.totalFrames, cache, requestFrame],
  );

  const getSnapshot = useCallback(() => cache.getSnapshot(state.viewSeq), [cache, state.viewSeq]);
  const { table, roundsSoFar } = useSyncExternalStore(cache.subscribe, getSnapshot);
  const latestRound = roundsSoFar.length > 0 ? roundsSoFar[roundsSoFar.length - 1] : null;

  return {
    ...state,
    seq: state.viewSeq,
    table,
    roundsSoFar,
    latestRound,
    play,
    pause,
    seek,
    seekToWeek,
  };
}
