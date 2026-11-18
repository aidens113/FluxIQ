import type { PanelChangeStatus } from "../panel-changes";
import type { GatewayChangeSources, GatewayChangeState, GatewaySnapshotRead } from "./types";

const INITIAL: GatewayChangeState = Object.freeze({ status: "connecting", snapshot: undefined, readFailed: false, refused: false, revision: 0 });

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/**
 * The panel's subscription to client gateway changes, shared by every reader
 * on the page: it listens on the page's one change stream
 * (`features/panel-changes`, `GET /api/panel/changes`) and does one snapshot
 * read per reason to read, however many readers there are.
 *
 * It reads the snapshot each time the stream opens -- the first time and on
 * every re-open, so a change made while the stream was down is never missed
 * -- and once per `gateway` change the stream names. A reason to read that
 * arrives while a read is under way waits for it and is served by one more
 * read, so reads never overlap and none is lost.
 *
 * Nothing here runs on a timer. While the stream is down the state says so,
 * and readers show that rather than reading on an interval: a stream the
 * browser is re-opening is `reconnecting`, one it gave up on is `closed`, and
 * a closed one opens again when the tab is shown, the network comes back, or a
 * reader calls `refresh`. If the stream fails before any snapshot was read,
 * the snapshot is read once so the page can show what is there.
 *
 * It listens with the first reader and stops with the last; the state starts
 * again from nothing after that.
 */
export class GatewayChangeSubscription {
  private readonly sources: GatewayChangeSources;
  private readonly listeners = new Set<() => void>();
  private state: GatewayChangeState = INITIAL;
  private stopChanges: (() => void) | undefined;
  // Bumped on every start and stop, so work begun under an earlier start is dropped.
  private generation = 0;
  // The generation a read loop is running for, and whether a reason to read arrived during it.
  private reading: number | undefined;
  private readAgain = false;

  constructor(sources: GatewayChangeSources) {
    this.sources = sources;
  }

  /** Adds a reader; the first one starts listening. Returns its unsubscribe; the last one stops. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      if (!this.listeners.delete(listener)) return;
      if (this.listeners.size === 0) this.stop();
    };
  };

  getState = (): GatewayChangeState => this.state;

  /** The state before anything was read, for a server render. */
  getInitialState = (): GatewayChangeState => INITIAL;

  /** Reads the snapshot now, and opens the stream again if the browser gave up on it. */
  refresh = (): void => {
    if (this.listeners.size === 0) return;
    this.sources.changes.reopen();
    this.requestRead();
  };

  private start(): void {
    this.generation += 1;
    this.stopChanges = this.sources.changes.subscribe({
      status: (status) => this.statusChanged(status),
      opened: () => this.reasonToRead(),
      gateway: () => this.reasonToRead()
    });
  }

  private stop(): void {
    this.generation += 1;
    const stop = this.stopChanges;
    this.stopChanges = undefined;
    stop?.();
    this.reading = undefined;
    this.readAgain = false;
    this.state = INITIAL;
  }

  private statusChanged(status: PanelChangeStatus): void {
    this.update({ status });
    if (status === "reconnecting" || status === "closed") this.readIfNeverRead();
  }

  private reasonToRead(): void {
    this.update({ revision: this.state.revision + 1 });
    this.requestRead();
  }

  /** One read so a page whose stream never opened still shows what there is; never more than one. */
  private readIfNeverRead(): void {
    if (this.state.snapshot !== undefined || this.state.readFailed || this.reading === this.generation) return;
    this.requestRead();
  }

  private requestRead(): void {
    if (this.reading === this.generation) {
      this.readAgain = true;
      return;
    }
    void this.readLoop(this.generation);
  }

  private async readLoop(generation: number): Promise<void> {
    this.reading = generation;
    try {
      do {
        this.readAgain = false;
        let result: GatewaySnapshotRead | undefined;
        try {
          result = await this.sources.readSnapshot();
        } catch {
          // The request could not be made at all; it reads as a failed read, which the state shows.
          result = undefined;
        }
        if (generation !== this.generation) return;
        this.applyRead(result);
      } while (this.readAgain);
    } finally {
      if (this.reading === generation) this.reading = undefined;
    }
  }

  private applyRead(result: GatewaySnapshotRead | undefined): void {
    const body = record(result?.body);
    const payload = result?.ok === true && body?.ok === true ? record(body.payload) : undefined;
    if (payload) {
      this.update({ snapshot: payload, readFailed: false, refused: false });
      return;
    }
    // A refusal means the person signed out or may not read it: what was shown is not theirs to keep seeing.
    if (result?.status === 401 || result?.status === 403) this.update({ snapshot: undefined, readFailed: true, refused: true });
    else this.update({ readFailed: true, refused: false });
  }

  private update(change: Partial<GatewayChangeState>): void {
    const next = { ...this.state, ...change };
    if ((Object.keys(next) as Array<keyof GatewayChangeState>).every((key) => next[key] === this.state[key])) return;
    this.state = Object.freeze(next);
    for (const listener of [...this.listeners]) listener();
  }
}
