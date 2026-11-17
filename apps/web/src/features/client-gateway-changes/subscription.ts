import type { GatewayChangeSources, GatewayChangeState, GatewayChangeStream, GatewaySnapshotRead } from "./types";

const GATEWAY_CHANGES_URL = "/api/client-gateway/changes";

/** `EventSource.CLOSED`: the browser will not re-open this stream by itself. */
const CLOSED = 2;

const INITIAL: GatewayChangeState = Object.freeze({ status: "connecting", snapshot: undefined, readFailed: false, refused: false, revision: 0 });

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/**
 * The panel's one subscription to client gateway changes, shared by every
 * reader on the page: one `GET /api/client-gateway/changes` stream and one
 * snapshot read per reason to read, however many readers there are.
 *
 * It reads the snapshot each time the stream opens -- the first time and on
 * every re-open, so a change made while the stream was down is never missed
 * -- and once per change the stream signals. A reason to read that arrives
 * while a read is under way waits for it and is served by one more read, so
 * reads never overlap and none is lost.
 *
 * Nothing here runs on a timer. While the stream is down the state says so,
 * and readers show that rather than reading on an interval: a stream the
 * browser is re-opening is `reconnecting`, one it gave up on is `closed`, and
 * a closed one opens again when the tab is shown, the network comes back, or a
 * reader calls `refresh`. If the stream fails before any snapshot was read,
 * the snapshot is read once so the page can show what is there.
 *
 * The stream opens with the first reader and closes with the last; the state
 * starts again from nothing after that.
 */
export class GatewayChangeSubscription {
  private readonly sources: GatewayChangeSources;
  private readonly listeners = new Set<() => void>();
  private state: GatewayChangeState = INITIAL;
  private stream: GatewayChangeStream | undefined;
  private stopWake: (() => void) | undefined;
  // Bumped on every start and stop, so work begun under an earlier start is dropped.
  private generation = 0;
  // The generation a read loop is running for, and whether a reason to read arrived during it.
  private reading: number | undefined;
  private readAgain = false;

  constructor(sources: GatewayChangeSources) {
    this.sources = sources;
  }

  /** Adds a reader; the first one opens the stream. Returns its unsubscribe; the last one closes the stream. */
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
    if (this.stream === undefined || this.stream.readyState === CLOSED) this.open();
    this.requestRead();
  };

  private start(): void {
    this.generation += 1;
    this.open();
    this.stopWake = this.sources.onWake(() => {
      if (this.stream === undefined || this.stream.readyState === CLOSED) this.open();
    });
  }

  private stop(): void {
    this.generation += 1;
    this.stopWake?.();
    this.stopWake = undefined;
    this.closeStream();
    this.reading = undefined;
    this.readAgain = false;
    this.state = INITIAL;
  }

  private open(): void {
    this.closeStream();
    const stream = this.sources.openStream(GATEWAY_CHANGES_URL);
    if (stream === undefined) {
      this.update({ status: "closed" });
      this.readIfNeverRead();
      return;
    }
    this.stream = stream;
    this.update({ status: "connecting" });
    stream.onopen = () => {
      if (this.stream !== stream) return;
      this.update({ status: "live", revision: this.state.revision + 1 });
      this.requestRead();
    };
    stream.addEventListener("change", () => {
      if (this.stream !== stream) return;
      this.update({ revision: this.state.revision + 1 });
      this.requestRead();
    });
    stream.onerror = () => {
      if (this.stream !== stream) return;
      this.update({ status: stream.readyState === CLOSED ? "closed" : "reconnecting" });
      this.readIfNeverRead();
    };
  }

  private closeStream(): void {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream) return;
    stream.onopen = null;
    stream.onerror = null;
    stream.close();
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
