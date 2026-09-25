import { describe, expect, it } from "vitest";
import { FrameCache } from "./frameCache";
import type { MatchFrame, RoundFrame, TableRow } from "./types";

const table = (seq: number): TableRow[] => [{ team_id: 1, name: "Team A", games_played: seq } as TableRow];

const matchFrame = (seq: number): MatchFrame => ({
  type: "match",
  seq,
  match_number: seq + 1,
  played_at: "2016-08-13T15:30:00",
  table: table(seq),
});

const roundFrame = (seq: number, games: number): RoundFrame => ({
  type: "round",
  seq,
  games,
  weights: { prior: 5, data: games / 1.5 },
  metrics: {
    xg: { rmse: 1, mae: 1, r2: 1, prior_rmse: 1, crossover_passed: false },
    xgd: { rmse: 1, mae: 1, r2: 1, prior_rmse: 1, crossover_passed: false },
    gd: { rmse: 1, mae: 1, r2: 1, prior_rmse: 1, crossover_passed: false },
    points: { rmse: 1, mae: 1, r2: 1, prior_rmse: 1, crossover_passed: false },
  },
});

describe("FrameCache", () => {
  it("returns the latest match table at or before the view position", () => {
    const cache = new FrameCache();
    cache.add(matchFrame(0));
    cache.add(matchFrame(3));
    cache.add(matchFrame(7));

    expect(cache.getSnapshot(0).match?.table[0].games_played).toBe(0);
    expect(cache.getSnapshot(5).match?.table[0].games_played).toBe(3); // no frame at 5 -- nearest prior wins
    expect(cache.getSnapshot(7).match?.table[0].games_played).toBe(7);
  });

  it("hides round frames that are ahead of the view position", () => {
    const cache = new FrameCache();
    cache.add(roundFrame(2, 1));
    cache.add(roundFrame(20, 2));

    // Scrubbed back to seq 5: round 2 (seq 20) hasn't "happened" yet at this point.
    expect(cache.getSnapshot(5).roundsSoFar.map((r) => r.games)).toEqual([1]);
    expect(cache.getSnapshot(25).roundsSoFar.map((r) => r.games)).toEqual([1, 2]);
  });

  it("finds a cached round by week for the URL deep-link path", () => {
    const cache = new FrameCache();
    cache.add(roundFrame(50, 12));
    expect(cache.roundAtWeek(12)?.seq).toBe(50);
    expect(cache.roundAtWeek(13)).toBeUndefined();
  });

  it("tracks the highest seq seen, for deciding whether a seek needs a network catch-up", () => {
    const cache = new FrameCache();
    expect(cache.cachedThrough).toBe(-1);
    cache.add(matchFrame(4));
    cache.add(roundFrame(2, 1));
    expect(cache.cachedThrough).toBe(4);
  });

  it("looks up a cached match frame by seq for the timeline's hover preview, without touching the view position", () => {
    const cache = new FrameCache();
    cache.add(matchFrame(0));
    cache.add(matchFrame(3));

    expect(cache.matchAt(0)?.match_number).toBe(1);
    expect(cache.matchAt(2)?.match_number).toBe(1); // no frame at 2 -- nearest prior wins, same rule as getSnapshot
    expect(cache.matchAt(3)?.match_number).toBe(4);
    expect(cache.matchAt(100)).toBeUndefined(); // never streamed that far
  });

  it("returns the same snapshot reference when nothing relevant has changed", () => {
    // useSyncExternalStore re-renders forever if getSnapshot returns a new
    // object every call with no underlying change -- this is the contract
    // it depends on.
    const cache = new FrameCache();
    cache.add(matchFrame(0));
    const a = cache.getSnapshot(0);
    const b = cache.getSnapshot(0);
    expect(a).toBe(b);

    cache.add(matchFrame(1));
    const c = cache.getSnapshot(0);
    expect(c).not.toBe(a);
  });

  it("doesn't notify subscribers for frames ahead of the playhead they last read", () => {
    const cache = new FrameCache();
    cache.add(matchFrame(0));
    cache.getSnapshot(0);
    let notified = 0;
    cache.subscribe(() => notified++);

    cache.add(matchFrame(1));
    cache.add(roundFrame(2, 1));
    expect(notified).toBe(0);
    // ...but they're in the cache for the next read at a later playhead.
    expect(cache.getSnapshot(2).match?.seq).toBe(1);
    expect(cache.getSnapshot(2).roundsSoFar).toHaveLength(1);
  });

  it("notifies when a frame at or before the playhead changes (a reconnect overwrite)", () => {
    const cache = new FrameCache();
    cache.add(matchFrame(0));
    cache.add(matchFrame(1));
    cache.getSnapshot(1);
    let notified = 0;
    cache.subscribe(() => notified++);

    cache.add(matchFrame(1));
    expect(notified).toBe(1);
  });

  it("notifies before anything has been read, so the first frame renders", () => {
    const cache = new FrameCache();
    let notified = 0;
    cache.subscribe(() => notified++);
    cache.add(matchFrame(0));
    expect(notified).toBe(1);
  });
});
