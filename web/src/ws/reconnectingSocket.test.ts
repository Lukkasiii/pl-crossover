import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectingSocket, backoffDelay } from "./reconnectingSocket";

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.triggerClose(1000);
  }

  /** Test helper: simulate the server accepting the handshake. */
  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper: simulate the connection dropping, with an optional close code. */
  triggerClose(code: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  triggerMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

describe("backoffDelay", () => {
  it("doubles each attempt up to the cap", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelay(0)).toBe(500);
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(2000);
    expect(backoffDelay(3)).toBe(4000);
    expect(backoffDelay(4)).toBe(8000); // capped
    expect(backoffDelay(10)).toBe(8000); // still capped
    vi.restoreAllMocks();
  });

  it("adds jitter so the delay is never below the base value", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(backoffDelay(0)).toBeCloseTo(750, 0);
    vi.restoreAllMocks();
  });
});

describe("ReconnectingSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(Math, "random").mockReturnValue(0);
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports connecting then open, and marks onOpen as the initial connection", () => {
    const statuses: string[] = [];
    const opens: boolean[] = [];
    new ReconnectingSocket("ws://test", {
      onStatusChange: (s) => statuses.push(s),
      onOpen: (wasReconnect) => opens.push(wasReconnect),
      onMessage: () => {},
    });

    expect(statuses).toEqual(["connecting"]);
    MockWebSocket.instances[0].triggerOpen();
    expect(statuses).toEqual(["connecting", "open"]);
    expect(opens).toEqual([false]);
  });

  it("reconnects after a non-fatal close, with exponential backoff, and resets on reopen", () => {
    const statuses: string[] = [];
    const opens: boolean[] = [];
    new ReconnectingSocket("ws://test", {
      onStatusChange: (s) => statuses.push(s),
      onOpen: (wasReconnect) => opens.push(wasReconnect),
      onMessage: () => {},
    });
    MockWebSocket.instances[0].triggerOpen();

    // A drop that isn't the server rejecting the pair id (code 1008).
    MockWebSocket.instances[0].triggerClose(1006);
    expect(statuses.at(-1)).toBe("reconnecting");
    expect(MockWebSocket.instances).toHaveLength(1); // no new socket until the backoff elapses

    vi.advanceTimersByTime(499);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2); // first backoff: 500ms

    MockWebSocket.instances[1].triggerOpen();
    expect(opens).toEqual([false, true]);
    expect(statuses.at(-1)).toBe("open");

    // Attempts reset after a successful reopen -- the next drop backs off from 500ms again, not 1000ms.
    MockWebSocket.instances[1].triggerClose(1006);
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("backs off longer on repeated drops before a reopen ever succeeds", () => {
    new ReconnectingSocket("ws://test", { onStatusChange: () => {}, onOpen: () => {}, onMessage: () => {} });

    MockWebSocket.instances[0].triggerClose(1006);
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1].triggerClose(1006); // still hasn't reopened -- second attempt
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3); // second backoff: 1000ms
  });

  it("does not retry after the server rejects the pair id (fatal close 1008)", () => {
    const statuses: string[] = [];
    new ReconnectingSocket("ws://test", {
      onStatusChange: (s) => statuses.push(s),
      onOpen: () => {},
      onMessage: () => {},
    });

    MockWebSocket.instances[0].triggerClose(1008);
    expect(statuses.at(-1)).toBe("offline");

    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1); // never reconnected
  });

  it("routes incoming messages to onMessage", () => {
    const messages: string[] = [];
    new ReconnectingSocket("ws://test", {
      onStatusChange: () => {},
      onOpen: () => {},
      onMessage: (data) => messages.push(data),
    });
    MockWebSocket.instances[0].triggerOpen();
    MockWebSocket.instances[0].triggerMessage('{"type":"init"}');
    expect(messages).toEqual(['{"type":"init"}']);
  });

  it("stops reconnecting once disposed", () => {
    new ReconnectingSocket("ws://test", { onStatusChange: () => {}, onOpen: () => {}, onMessage: () => {} }).dispose();

    MockWebSocket.instances[0].triggerClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
