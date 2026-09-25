// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamingText } from "./useStreamingText";

/**
 * A controllable requestAnimationFrame stub: `tick()` runs every callback
 * queued so far (as the real rAF would, one per frame) rather than trusting
 * fake timers to model frame scheduling, which vitest/jsdom don't emulate.
 */
let queue: FrameRequestCallback[] = [];
let nextId = 1;
// The hook gates advances to real elapsed time (MIN_FRAME_INTERVAL_MS), not
// frame count, so callbacks need timestamps spaced far enough apart for
// every tick() to actually advance -- a fixed 20ms step comfortably clears
// that gate without needing to match it exactly.
let simulatedNow = 1000;

function tick() {
  const callbacks = queue;
  queue = [];
  simulatedNow += 20;
  act(() => {
    callbacks.forEach((cb) => cb(simulatedNow));
  });
}

beforeEach(() => {
  queue = [];
  nextId = 1;
  simulatedNow = 1000;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    // Real cancelAnimationFrame just marks the id inert; nothing here reads
    // ids back out of `queue`, so cancelling only needs to be a safe no-op
    // for tests that call it -- the id itself is never reused as an index.
    void id;
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStreamingText", () => {
  it("reveals charsPerFrame characters per animation frame", () => {
    const { result } = renderHook(() => useStreamingText("hello world", 3));
    expect(result.current.visibleText).toBe("");

    tick();
    expect(result.current.visibleText).toBe("hel");
    tick();
    expect(result.current.visibleText).toBe("hello ");
    expect(result.current.done).toBe(false);
  });

  it("reaches the full text and reports done", () => {
    const { result } = renderHook(() => useStreamingText("hi", 5));
    tick();
    expect(result.current.visibleText).toBe("hi");
    expect(result.current.done).toBe(true);
  });

  // Regression test: stop() used to only cancelAnimationFrame the *one* id
  // rafRef currently pointed at, but `step` reschedules itself directly via
  // requestAnimationFrame -- not through the effect -- so a frame that was
  // already queued *before* stop() ran would still fire afterwards and keep
  // the reveal going. This is exactly what React StrictMode's dev-mode
  // double-invoked effects can leave behind: two independent `step` chains,
  // only one of which the ref (and therefore stop()) knows about. Fixed
  // with a live generation counter each `step` checks on every invocation,
  // not just once at the top of the effect.
  it("stop() freezes the reveal even if a frame was already queued before it ran", () => {
    const { result } = renderHook(() => useStreamingText("hello world", 2));

    tick();
    const staleQueuedCallback = queue[0]; // the chain's next frame, already scheduled

    act(() => result.current.stop());
    const frozenAt = result.current.visibleText;
    expect(result.current.done).toBe(true);

    // Fires the stale frame directly, bypassing cancelAnimationFrame entirely
    // -- the same effect a second, uncancellable chain would have.
    simulatedNow += 20;
    act(() => staleQueuedCallback?.(simulatedNow));
    tick();
    tick();

    expect(result.current.visibleText).toBe(frozenAt);
  });

  it("restarts from the beginning when fullText changes", () => {
    const { result, rerender } = renderHook(({ text }) => useStreamingText(text, 20), {
      initialProps: { text: "first answer" },
    });
    tick();
    expect(result.current.visibleText).toBe("first answer");
    expect(result.current.done).toBe(true);

    rerender({ text: "second, different answer" });
    expect(result.current.visibleText).toBe("");
    expect(result.current.done).toBe(false);

    tick();
    expect(result.current.visibleText).toBe("second, different an");
  });

  it("reveals instantly when the viewer prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    const { result } = renderHook(() => useStreamingText("no animation here", 1));
    expect(result.current.visibleText).toBe("no animation here");
    expect(result.current.done).toBe(true);
    expect(queue).toHaveLength(0);
  });
});
