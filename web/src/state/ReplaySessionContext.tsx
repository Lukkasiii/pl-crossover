import { createContext, useContext, useState, type ReactNode } from "react";
import { useSeasons } from "../api/useSeasons";
import { useReplay } from "../ws/useReplay";
import type { components } from "../api/schema";

type SeasonPair = components["schemas"]["SeasonPairOut"];
type Replay = ReturnType<typeof useReplay>;

interface ReplaySessionValue {
  pairs: SeasonPair[] | null;
  seasonsError: string | null;
  activePairId: number | null;
  activePair: SeasonPair | null;
  setPairId: (pairId: number) => void;
  /** null until a season pair has been resolved -- pairs is still loading. */
  replay: Replay | null;
}

const ReplaySessionContext = createContext<ReplaySessionValue | null>(null);

/**
 * Owns the one live replay connection (WS or demo JSON) shared by /season
 * and /model -- see AppShell's nested "replay" layout route, which is the
 * shared ancestor keeping this provider mounted across navigation between
 * those two routes. Without it, leaving /season would tear the socket and
 * FrameCache down with the component that used to own them, so flipping to
 * /model to read "Current RMSE by metric" would show a dead, disconnected
 * session instead of whatever the replay on /season is actually doing.
 *
 * Split into an outer component (resolves which pair is active) and an
 * inner one (actually calls useReplay) because useReplay needs a concrete
 * pairId and hooks can't be called conditionally -- the inner component
 * only mounts once a pair id exists, and remounts (key={pairId}) when the
 * user picks a different one, matching the reset-by-remount pattern this
 * hook already relied on before the route split.
 */
export function ReplaySessionProvider({ children }: { children: ReactNode }) {
  const { pairs, error: seasonsError } = useSeasons();
  const [pairId, setPairId] = useState<number | null>(null);
  const activePairId = pairId ?? pairs?.[0]?.id ?? null;
  const activePair = pairs?.find((p) => p.id === activePairId) ?? null;

  if (activePairId === null) {
    return (
      <ReplaySessionContext.Provider
        value={{ pairs, seasonsError, activePairId: null, activePair: null, setPairId, replay: null }}
      >
        {children}
      </ReplaySessionContext.Provider>
    );
  }

  return (
    <ReplaySessionInner
      key={activePairId}
      pairId={activePairId}
      pairs={pairs}
      seasonsError={seasonsError}
      activePair={activePair}
      setPairId={setPairId}
    >
      {children}
    </ReplaySessionInner>
  );
}

interface ReplaySessionInnerProps {
  pairId: number;
  pairs: SeasonPair[] | null;
  seasonsError: string | null;
  activePair: SeasonPair | null;
  setPairId: (pairId: number) => void;
  children: ReactNode;
}

function ReplaySessionInner({ pairId, pairs, seasonsError, activePair, setPairId, children }: ReplaySessionInnerProps) {
  const replay = useReplay(pairId);
  return (
    <ReplaySessionContext.Provider
      value={{ pairs, seasonsError, activePairId: pairId, activePair, setPairId, replay }}
    >
      {children}
    </ReplaySessionContext.Provider>
  );
}

export function useReplaySession(): ReplaySessionValue {
  const ctx = useContext(ReplaySessionContext);
  if (!ctx) throw new Error("useReplaySession must be used within a ReplaySessionProvider");
  return ctx;
}
