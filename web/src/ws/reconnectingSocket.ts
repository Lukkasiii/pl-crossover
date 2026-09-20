export type SocketStatus = "connecting" | "open" | "reconnecting" | "offline";

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/**
 * Exponential backoff with jitter, exported so it's unit-testable without a
 * socket at all. Jitter avoids every open tab reconnecting to the same
 * server in lockstep after a shared outage.
 */
export function backoffDelay(attempt: number): number {
  const capped = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return capped + Math.random() * 250;
}

export interface ReconnectingSocketHandlers {
  /** wasReconnect is false for the first connection, true for every one after a drop. */
  onOpen: (wasReconnect: boolean) => void;
  onMessage: (data: string) => void;
  onStatusChange: (status: SocketStatus) => void;
}

/**
 * Owns one logical replay connection across however many physical
 * WebSockets it takes to keep it alive. useReplaySocket talks to this, not
 * to `WebSocket` directly, so the backoff/retry decision is a plain class
 * that fake timers and a mocked WebSocket can drive in a unit test --
 * same split as FrameCache keeping cache logic out of the React tree.
 *
 * Frame semantics (idempotent snapshots keyed by seq, see FrameCache) mean
 * a duplicate or replayed frame from a reconnect is harmless to re-apply;
 * this class only has to guarantee delivery resumes, not de-duplicate.
 */
export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private everConnected = false;
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly url: string;
  private readonly handlers: ReconnectingSocketHandlers;

  constructor(url: string, handlers: ReconnectingSocketHandlers) {
    this.url = url;
    this.handlers = handlers;
    this.open();
  }

  private open(): void {
    this.handlers.onStatusChange(this.everConnected ? "reconnecting" : "connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      const wasReconnect = this.everConnected;
      this.attempts = 0;
      this.everConnected = true;
      this.handlers.onStatusChange("open");
      this.handlers.onOpen(wasReconnect);
    };
    ws.onmessage = (ev) => this.handlers.onMessage(ev.data);
    ws.onclose = (ev) => {
      if (this.disposed) return;
      this.ws = null;
      if (ev.code === 1008) {
        // Server rejected the pair id and won't accept a retry either.
        this.handlers.onStatusChange("offline");
        return;
      }
      this.scheduleReconnect();
    };
    // onerror is always followed by onclose for a browser WebSocket -- onclose owns the retry decision.
    ws.onerror = () => {};
  }

  private scheduleReconnect(): void {
    this.handlers.onStatusChange("reconnecting");
    const delay = backoffDelay(this.attempts);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) this.open();
    }, delay);
  }

  send(data: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(data);
    return true;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
