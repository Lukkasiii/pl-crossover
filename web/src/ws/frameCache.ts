import type { MatchFrame, ReplayFrame, RoundFrame } from "./types";

export interface FrameSnapshot {
  match: MatchFrame | null;
  roundsSoFar: RoundFrame[];
}

/**
 * Every match/round frame the socket has ever delivered, kept outside React
 * state and read during render through useSyncExternalStore rather than a
 * plain ref. A ref read directly in a component body can tear under
 * concurrent rendering (React may re-run a render function before
 * committing); useSyncExternalStore is the primitive built for exactly
 * this -- an external, imperatively-mutated source that still needs a
 * consistent read during render. getSnapshot returns the same object
 * reference between real changes (memoized on version+viewSeq), which
 * useSyncExternalStore requires to avoid re-rendering forever.
 */
export class FrameCache {
  private matches: (MatchFrame | undefined)[] = [];
  private rounds: (RoundFrame | undefined)[] = [];
  private version = 0;
  private lastSnapshot: { version: number; viewSeq: number; snapshot: FrameSnapshot } | null = null;
  private listeners = new Set<() => void>();
  cachedThrough = -1;

  add(frame: ReplayFrame): void {
    if (frame.type === "match") this.matches[frame.seq] = frame;
    else if (frame.type === "round") this.rounds[frame.games - 1] = frame;
    else return;
    if (frame.seq > this.cachedThrough) this.cachedThrough = frame.seq;
    this.version++;
    // Only a frame at or before the playhead the UI last read can change
    // what it shows. During playback almost every message is *ahead* of
    // that playhead (it only advances at the next rAF flush), and notifying
    // anyway made every subscriber re-run getSnapshot and -- because a new
    // version always built a new object -- re-render synchronously, once
    // per message: the rAF batching upstream saved nothing (README,
    // "Frontend decisions"). When the playhead does move, React re-renders
    // from its own state change and reads the new frames then.
    if (this.lastSnapshot !== null && frame.seq > this.lastSnapshot.viewSeq) return;
    this.listeners.forEach((l) => l());
  }

  roundAtWeek(week: number): RoundFrame | undefined {
    return this.rounds[week - 1];
  }

  /** Most recent cached match frame at or before `seq`; undefined if that far hasn't streamed in yet. */
  matchAt(seq: number): MatchFrame | undefined {
    if (seq > this.cachedThrough) return undefined;
    for (let i = seq; i >= 0; i--) {
      const m = this.matches[i];
      if (m) return m;
    }
    return undefined;
  }

  subscribe = (onStoreChange: () => void): (() => void) => {
    this.listeners.add(onStoreChange);
    return () => this.listeners.delete(onStoreChange);
  };

  getSnapshot = (viewSeq: number): FrameSnapshot => {
    const cached = this.lastSnapshot;
    if (cached && cached.version === this.version && cached.viewSeq === viewSeq) return cached.snapshot;

    let match: MatchFrame | null = null;
    for (let i = viewSeq; i >= 0; i--) {
      const m = this.matches[i];
      if (m) {
        match = m;
        break;
      }
    }
    const roundsSoFar = this.rounds.filter((r): r is RoundFrame => r !== undefined && r.seq <= viewSeq);

    const snapshot: FrameSnapshot = { match, roundsSoFar };
    this.lastSnapshot = { version: this.version, viewSeq, snapshot };
    return snapshot;
  };
}
