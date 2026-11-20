import type { PanelChange, PanelChangeTopic } from "./topics";

/**
 * How long the stream may stay silent before a comment line is sent. A proxy
 * or load balancer closes a connection it sees idle, and an idle stream is
 * otherwise indistinguishable from a dead one; each chunk is also where the
 * route re-checks the caller's authority (`withWorkspaceRouteStream`).
 */
const PANEL_CHANGE_KEEP_ALIVE_MS = 25_000;

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

/** Changes that mean the same read are one until sent: one gateway read, one model-access read, one read per thread, one per project's activity. */
function keyOf(change: PanelChange): string {
  if (change.topic === "gateway" || change.topic === "model-access") return change.topic;
  return change.topic === "conversation" ? `conversation:${change.conversationId}` : `activity:${change.projectId}`;
}

/**
 * The Server-Sent Events body of `GET /api/panel/changes`: an opening comment,
 * then one event each time a topic reports a change this caller may hear of,
 * and a comment whenever the stream has been silent for `keepAliveMs`.
 *
 * Events are `gateway` (read the gateway snapshot again), `conversation`
 * (read the thread `conversationId` again), `activity` (read project
 * `projectId`'s live activity again) and `model-access` (read the Secret Keys
 * snapshot again, for the caller's model access). Each carries `version`, a count of the
 * events this stream has sent, starting at 1 with no gaps: it cannot reveal
 * how many changes happened to anyone else, and a reader that sees a gap
 * knows it missed one. Nothing else is sent: no content, no kind of change.
 *
 * Changes found while the reader has not asked for the next chunk wait for it,
 * coalesced: one per thing to read, in the order first reported, since one
 * read covers every change before it.
 *
 * Ending it -- the reader cancelling, the request aborting, the caller's
 * authority lapsing -- stops every topic at once and settles a chunk still
 * being waited for, so the route's lease on the workspace is never held by a
 * wait. A topic that fails fails the stream.
 */
export class PanelChangeStream implements AsyncIterator<string, undefined> {
  private readonly stops: Array<() => void> = [];
  private readonly keepAliveMs: number;
  private readonly timers: Timers;
  private readonly pending: PanelChange[] = [];
  private sequence = 0;
  private waiting: Waiting | undefined;
  private keepAlive: unknown;
  private failure: { error: unknown } | undefined;
  private opened = false;
  private ended = false;

  constructor(topics: readonly PanelChangeTopic[], options: { keepAliveMs?: number; timers?: Timers } = {}) {
    this.keepAliveMs = options.keepAliveMs ?? PANEL_CHANGE_KEEP_ALIVE_MS;
    this.timers = options.timers ?? REAL_TIMERS;
    const sink = { changed: (change: PanelChange) => this.changed(change), fail: (error: unknown) => this.fail(error) };
    for (const topic of topics) {
      const stop = topic.start(sink);
      // A topic that failed while starting has already ended the stream: stop it too, and start no more.
      if (this.ended || this.failure) {
        stop();
        break;
      }
      this.stops.push(stop);
    }
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
    const queued = this.pending.shift();
    if (queued) return Promise.resolve({ done: false, value: this.event(queued) });
    return new Promise<Step>((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.keepAlive = this.timers.set(() => this.settle({ done: false, value: ": keep-alive\n\n" }), this.keepAliveMs);
    });
  }

  return(): Promise<Step> {
    this.end();
    return Promise.resolve(DONE);
  }

  private changed(change: PanelChange): void {
    if (this.ended || this.failure) return;
    if (this.waiting) {
      this.settle({ done: false, value: this.event(change) });
      return;
    }
    const key = keyOf(change);
    if (!this.pending.some((queued) => keyOf(queued) === key)) this.pending.push(change);
  }

  private event(change: PanelChange): string {
    this.sequence += 1;
    const version = this.sequence;
    if (change.topic === "gateway" || change.topic === "model-access") return `event: ${change.topic}\ndata: ${JSON.stringify({ version })}\n\n`;
    if (change.topic === "conversation") return `event: conversation\ndata: ${JSON.stringify({ conversationId: change.conversationId, version })}\n\n`;
    return `event: activity\ndata: ${JSON.stringify({ projectId: change.projectId, version })}\n\n`;
  }

  private stopTopics(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  private fail(error: unknown): void {
    if (this.ended || this.failure) return;
    this.failure = { error };
    this.pending.length = 0;
    this.stopTopics();
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
    this.pending.length = 0;
    this.stopTopics();
    this.settle(DONE);
  }
}
