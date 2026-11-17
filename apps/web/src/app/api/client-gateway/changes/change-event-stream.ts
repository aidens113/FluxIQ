import { createHash } from "node:crypto";
import type { ClientGatewayChangesPort } from "fluxiq/client-gateway";

/**
 * How long the stream may stay silent before a comment line is sent. A proxy
 * or load balancer closes a connection it sees idle, and an idle stream is
 * otherwise indistinguishable from a dead one; each chunk is also where the
 * route re-checks the caller's authority (`withWorkspaceRouteStream`).
 */
const CHANGE_STREAM_KEEP_ALIVE_MS = 25_000;

type Timers = {
  set(fire: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
};

const REAL_TIMERS: Timers = {
  set: (fire, delayMs) => setTimeout(fire, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

type Step = IteratorResult<string, undefined>;
type Waiting = { resolve(step: Step): void; reject(error: unknown): void };

const DONE: Step = Object.freeze({ done: true, value: undefined });

/**
 * The Server-Sent Events body of `GET /api/client-gateway/changes`: an opening
 * comment, then one `change` event each time THIS caller's own view of the
 * gateway changed, and a comment whenever the stream has been silent for
 * `keepAliveMs`.
 *
 * `view` returns the caller's view as the snapshot route would serve it,
 * already filtered to what the caller may know. The stream remembers a
 * fingerprint of it, recomputes it on every gateway signal, and sends an event
 * only when the fingerprint differs. A signal for a pairing or client the
 * caller cannot see therefore produces nothing, and an event carries no kind
 * and no gateway version: only `version`, a count of the events this stream
 * has sent, which cannot reveal how many changes happened to anyone else.
 *
 * Changes found while the reader has not asked for the next chunk wait for it
 * as one event: an event means "read the snapshot again", and one read covers
 * every change before it. The sequence is numbered as events are sent, so it
 * starts at 1 and has no gaps.
 *
 * Ending it -- the reader cancelling, the request aborting, the caller's
 * authority lapsing -- unsubscribes at once and settles a chunk still being
 * waited for, so the route's lease on the workspace is never held by a wait. A
 * view that cannot be read (authority lost) fails the stream.
 */
export class ChangeEventStream implements AsyncIterator<string, undefined> {
  private readonly unsubscribe: () => void;
  private readonly keepAliveMs: number;
  private readonly timers: Timers;
  private readonly view: () => Promise<unknown>;
  private fingerprint: string | undefined;
  private recomputing = false;
  private dirty = false;
  private unsent = false;
  private sequence = 0;
  private waiting: Waiting | undefined;
  private keepAlive: unknown;
  private failure: { error: unknown } | undefined;
  private opened = false;
  private ended = false;

  constructor(changes: ClientGatewayChangesPort, view: () => Promise<unknown>, options: { keepAliveMs?: number; timers?: Timers } = {}) {
    this.keepAliveMs = options.keepAliveMs ?? CHANGE_STREAM_KEEP_ALIVE_MS;
    this.timers = options.timers ?? REAL_TIMERS;
    this.view = view;
    // Subscribed before the first view is read, so a change during that read is compared against it.
    this.unsubscribe = changes.subscribe(() => this.heard());
    this.dirty = true;
    void this.recompute();
  }

  next(): Promise<Step> {
    if (this.ended) return Promise.resolve(DONE);
    if (this.failure) return Promise.reject(this.failure.error);
    if (this.waiting) return Promise.reject(new Error("A change stream chunk is already being waited for."));
    // The first chunk goes out at once, so every proxy on the way passes the headers and the browser sees the stream open.
    if (!this.opened) {
      this.opened = true;
      return Promise.resolve({ done: false, value: ": open\n\n" });
    }
    if (this.unsent) {
      this.unsent = false;
      return Promise.resolve({ done: false, value: this.event() });
    }
    return new Promise<Step>((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.keepAlive = this.timers.set(() => this.settle({ done: false, value: ": keep-alive\n\n" }), this.keepAliveMs);
    });
  }

  return(): Promise<Step> {
    this.end();
    return Promise.resolve(DONE);
  }

  private heard(): void {
    if (this.ended) return;
    this.dirty = true;
    void this.recompute();
  }

  /** Reads the view once per burst of signals, one read at a time, and notes whether it differs from the last one seen. */
  private async recompute(): Promise<void> {
    if (this.recomputing) return;
    this.recomputing = true;
    try {
      while (this.dirty && !this.ended) {
        this.dirty = false;
        const next = fingerprintOf(await this.view());
        if (this.ended) return;
        const first = this.fingerprint === undefined;
        const changed = !first && next !== this.fingerprint;
        this.fingerprint = next;
        if (changed) this.changed();
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.recomputing = false;
    }
  }

  private changed(): void {
    if (this.waiting) this.settle({ done: false, value: this.event() });
    else this.unsent = true;
  }

  private event(): string {
    this.sequence += 1;
    return `event: change\ndata: ${JSON.stringify({ version: this.sequence })}\n\n`;
  }

  private fail(error: unknown): void {
    if (this.ended) return;
    this.failure = { error };
    this.unsent = false;
    this.unsubscribe();
    if (this.keepAlive !== undefined) this.timers.clear(this.keepAlive);
    this.keepAlive = undefined;
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.reject(error);
  }

  private settle(step: Step): void {
    if (this.keepAlive !== undefined) this.timers.clear(this.keepAlive);
    this.keepAlive = undefined;
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.resolve(step);
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.unsent = false;
    this.unsubscribe();
    this.settle(DONE);
  }
}

function fingerprintOf(view: unknown): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("hex");
}
