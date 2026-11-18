import type { PanelChangeEventStream, PanelChangeEventType, PanelChangeListener, PanelChangeSources, PanelChangeStatus, PanelChangesPort } from "./types";

const PANEL_CHANGES_URL = "/api/panel/changes";

/** `EventSource.CLOSED`: the browser will not re-open this stream by itself. */
const CLOSED = 2;

const EVENT_TYPES: readonly PanelChangeEventType[] = ["gateway", "conversation", "activity"];

type Parsed = { version: number; id?: string };

/** An event the server did not send in its own shape: what changed cannot be known. */
class UnreadableChange extends Error {
  constructor() {
    super("A change event could not be read.");
    this.name = "UnreadableChange";
  }
}

/** An event's data: its sequence and, for a thread or activity, the id to read. Throws when it is not what the server sends (`JSON.parse` too). */
function parsed(type: PanelChangeEventType, data: unknown): Parsed {
  if (typeof data !== "string") throw new UnreadableChange();
  const value: unknown = JSON.parse(data);
  if (value === null || typeof value !== "object") throw new UnreadableChange();
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "number" || !Number.isInteger(record.version)) throw new UnreadableChange();
  if (type === "gateway") return { version: record.version };
  const id = type === "conversation" ? record.conversationId : record.projectId;
  if (typeof id !== "string" || id === "") throw new UnreadableChange();
  return { version: record.version, id };
}

/**
 * The page's one subscription to `GET /api/panel/changes`, shared by every
 * reader: the pairing prompt and the client lists (the gateway), the chat's
 * threads (conversations) and its live activity. One stream per page,
 * however many readers there are.
 *
 * Nothing here runs on a timer. Each reader is told when to read: once when
 * the stream opens and again each time it re-opens (`opened`, so whatever
 * changed while it was down is read), and once per change it names. A change
 * whose number skips one, or that cannot be read, is a missed change and is
 * told as `opened` too. While the stream is down the status says so, and
 * readers show that rather than reading on an interval. A closed stream opens
 * again when the tab is shown, the network comes back, or a reader asks.
 *
 * The stream opens with the first reader and closes with the last.
 */
export class PanelChangeConnection implements PanelChangesPort {
  private readonly sources: PanelChangeSources;
  private readonly listeners = new Set<PanelChangeListener>();
  private current: PanelChangeStatus = "connecting";
  private stream: PanelChangeEventStream | undefined;
  private stopWake: (() => void) | undefined;
  // The last sequence number this stream sent; 0 when it has just opened.
  private lastVersion = 0;

  constructor(sources: PanelChangeSources) {
    this.sources = sources;
  }

  subscribe = (listener: PanelChangeListener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    else {
      listener.status?.(this.current);
      // It has read nothing yet: an open stream is its reason to read now.
      if (this.current === "live") listener.opened?.();
    }
    return () => {
      if (!this.listeners.delete(listener)) return;
      if (this.listeners.size === 0) this.stop();
    };
  };

  status = (): PanelChangeStatus => this.current;

  reopen = (): void => {
    if (this.listeners.size === 0) return;
    if (this.stream === undefined || this.stream.readyState === CLOSED) this.open();
  };

  private start(): void {
    this.open();
    this.stopWake = this.sources.onWake(() => this.reopen());
  }

  private stop(): void {
    this.stopWake?.();
    this.stopWake = undefined;
    this.closeStream();
    this.current = "connecting";
  }

  private open(): void {
    this.closeStream();
    const stream = this.sources.openStream(PANEL_CHANGES_URL);
    if (stream === undefined) {
      this.setStatus("closed", true);
      return;
    }
    this.stream = stream;
    this.setStatus("connecting", true);
    stream.onopen = () => {
      if (this.stream !== stream) return;
      this.lastVersion = 0;
      this.setStatus("live");
      this.tell((listener) => listener.opened?.());
    };
    for (const type of EVENT_TYPES) {
      stream.addEventListener(type, (event) => {
        if (this.stream !== stream) return;
        let change: Parsed;
        try {
          change = parsed(type, event.data);
        } catch {
          // What changed cannot be known, so every reader reads everything once.
          this.missed();
          return;
        }
        this.heard(type, change);
      });
    }
    stream.onerror = () => {
      if (this.stream !== stream) return;
      this.setStatus(stream.readyState === CLOSED ? "closed" : "reconnecting");
    };
  }

  /** A change may have been missed: every reader reads everything once, as when the stream opens. */
  private missed(): void {
    this.tell((listener) => listener.opened?.());
  }

  private heard(type: PanelChangeEventType, event: Parsed): void {
    if (event.version !== this.lastVersion + 1) {
      // A number was skipped: a change was missed.
      this.lastVersion = event.version;
      this.missed();
      return;
    }
    this.lastVersion = event.version;
    const id = event.id ?? "";
    if (type === "gateway") this.tell((listener) => listener.gateway?.());
    else if (type === "conversation") this.tell((listener) => listener.conversation?.(id));
    else this.tell((listener) => listener.activity?.(id));
  }

  private closeStream(): void {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream) return;
    stream.onopen = null;
    stream.onerror = null;
    stream.close();
  }

  /** `always` tells readers even an unchanged status: opening a stream again is news to a reader that saw it close. */
  private setStatus(status: PanelChangeStatus, always = false): void {
    if (status === this.current && !always) return;
    this.current = status;
    this.tell((listener) => listener.status?.(status));
  }

  private tell(call: (listener: PanelChangeListener) => void): void {
    for (const listener of [...this.listeners]) call(listener);
  }
}
