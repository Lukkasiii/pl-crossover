import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE_URL } from "../api/client";
import type { ReplayCommand, ReplayFrame, RoundFrame, TableRow } from "./types";

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

interface ReplayState {
  status: ConnectionStatus;
  totalFrames: number;
  seq: number;
  playing: boolean;
  speed: number;
  finished: boolean;
  error: string | null;
  table: TableRow[] | null;
  /** indexed by games - 1; holes only before that round has streamed in */
  rounds: (RoundFrame | undefined)[];
}

const initialState: ReplayState = {
  status: "connecting",
  totalFrames: 0,
  seq: 0,
  playing: false,
  speed: 1,
  finished: false,
  error: null,
  table: null,
  rounds: [],
};

/**
 * Owns the /ws/replay connection for one season pair. Match and round
 * frames arrive far faster than the UI needs to paint at high replay
 * speed (up to 50x => a frame every ~1ms), so incoming frames are
 * buffered in refs and only committed to React state once per
 * animation frame -- the render rate stays capped at the display's
 * refresh rate regardless of how fast the socket delivers data.
 */
export function useReplaySocket(pairId: number) {
  const [state, setState] = useState<ReplayState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingTable = useRef<TableRow[] | null>(null);
  const pendingRounds = useRef<RoundFrame[]>([]);
  const pendingSeq = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const table = pendingTable.current;
    const rounds = pendingRounds.current;
    const seq = pendingSeq.current;
    if (table === null && rounds.length === 0 && seq === null) return;

    pendingTable.current = null;
    pendingRounds.current = [];
    pendingSeq.current = null;

    setState((prev) => {
      let nextRounds = prev.rounds;
      if (rounds.length > 0) {
        nextRounds = [...prev.rounds];
        for (const r of rounds) nextRounds[r.games - 1] = r;
      }
      return {
        ...prev,
        table: table ?? prev.table,
        rounds: nextRounds,
        seq: seq ?? prev.seq,
      };
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/replay?pair=${pairId}`);
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, status: "open" }));
    ws.onclose = () => setState((s) => ({ ...s, status: "closed" }));
    ws.onerror = () => setState((s) => ({ ...s, status: "error" }));
    ws.onmessage = (ev) => {
      const frame: ReplayFrame = JSON.parse(ev.data);
      switch (frame.type) {
        case "init":
          setState((s) => ({ ...s, totalFrames: frame.total_frames }));
          break;
        case "match":
          pendingTable.current = frame.table;
          pendingSeq.current = frame.seq;
          scheduleFlush();
          break;
        case "round":
          pendingRounds.current.push(frame);
          pendingSeq.current = frame.seq;
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
  }, [pairId, scheduleFlush]);

  const send = useCallback((cmd: ReplayCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(cmd));
  }, []);

  const play = useCallback(
    (speed?: number) => {
      setState((s) => {
        const nextSpeed = speed ?? s.speed;
        send({ cmd: "play", speed: nextSpeed });
        return { ...s, playing: true, speed: nextSpeed, finished: false };
      });
    },
    [send],
  );

  const pause = useCallback(() => {
    send({ cmd: "pause" });
    setState((s) => ({ ...s, playing: false }));
  }, [send]);

  const seek = useCallback(
    (seq: number) => {
      send({ cmd: "seek", seq });
    },
    [send],
  );

  const roundsSoFar = state.rounds.filter((r): r is RoundFrame => r !== undefined);
  const latestRound = roundsSoFar.length > 0 ? roundsSoFar[roundsSoFar.length - 1] : null;

  return { ...state, roundsSoFar, latestRound, play, pause, seek };
}
