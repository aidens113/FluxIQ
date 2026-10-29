import type { IamAuditRecord, IamAuditSink } from "../types.ts";
import type { IamAuditStore } from "./store.ts";

const DEFAULT_FLUSH_MS = 1000;
const DEFAULT_MAX_ROWS = 100;
const DEFAULT_RETAINED_ROWS = 10_000;

/** Tuning for the buffered writer; the defaults are the plan's: 1 s, 100 rows. */
export type BufferedIamAuditOptions = {
  flushIntervalMs?: number;
  maxRows?: number;
  /** Rows kept for retry while the store keeps failing; beyond it the oldest are dropped and counted. */
  retainedRows?: number;
  /** Called with every flush failure as it happens (the failure is also thrown by the next `flush` or `close`). */
  onError?: (error: Error) => void;
};

/**
 * The service's `IamAuditSink`: `record()` appends to memory and never awaits
 * or throws; a flush writes the buffer in one transaction.
 *
 * - `allow` rows flush when 100 are buffered or 1 s after the first one. A
 *   crash can therefore lose up to 1 s of allows.
 * - `deny` and `iam-change` rows flush at once (they are never delayed).
 * - A failed flush puts its rows back at the front of the buffer, keeps the
 *   error, calls `onError`, and is thrown by the next `flush()` or `close()`
 *   that cannot write them either. Nothing is dropped silently: rows past
 *   `retainedRows` are dropped oldest first and counted in `droppedRows`.
 * - The timer is unref'd, so it never keeps a process alive.
 */
export class BufferedIamAuditSink implements IamAuditSink {
  private buffer: IamAuditRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private dropped = 0;
  private readonly flushIntervalMs: number;
  private readonly maxRows: number;
  private readonly retainedRows: number;
  private readonly onError: ((error: Error) => void) | undefined;

  constructor(private readonly store: IamAuditStore, options: BufferedIamAuditOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
    this.retainedRows = options.retainedRows ?? DEFAULT_RETAINED_ROWS;
    this.onError = options.onError;
  }

  /** Rows dropped because the store kept failing and the retry buffer filled. */
  get droppedRows(): number {
    return this.dropped;
  }

  /** Rows waiting for a flush. */
  get bufferedRows(): number {
    return this.buffer.length;
  }

  record(record: IamAuditRecord): void {
    try {
      this.buffer.push(record);
      if (record.category !== "allow" || this.buffer.length >= this.maxRows) this.flushInBackground();
      else this.arm();
    } catch (error) {
      this.fail(error);
    }
  }

  /** Writes everything buffered; rejects with the last write failure, if any rows could not be written. */
  async flush(): Promise<void> {
    this.disarm();
    const rows = this.buffer;
    this.buffer = [];
    const run = this.chain.then(() => this.drain(rows));
    this.chain = run.then(() => undefined, () => undefined);
    await run;
  }

  /** Flushes, stops the timer, and rejects when rows could not be written. The store stays open. */
  async close(): Promise<void> {
    await this.flush();
  }

  private flushInBackground(): void {
    this.flush().catch(/* best-effort: the failure is kept, passed to onError and thrown by the next flush */ () => undefined);
  }

  private arm(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushInBackground();
    }, this.flushIntervalMs);
    this.timer.unref();
  }

  private disarm(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain(rows: IamAuditRecord[]): Promise<void> {
    if (rows.length > 0) {
      try {
        await this.store.write(rows);
        this.failure = null;
      } catch (error) {
        this.buffer = [...rows, ...this.buffer];
        this.trim();
        this.fail(error);
      }
    }
    if (this.failure !== null && this.buffer.length > 0) throw this.failure;
    this.failure = null;
  }

  private trim(): void {
    const excess = this.buffer.length - this.retainedRows;
    if (excess <= 0) return;
    this.buffer = this.buffer.slice(excess);
    this.dropped += excess;
  }

  private fail(error: unknown): void {
    this.failure = error instanceof Error ? error : new Error(String(error));
    try {
      this.onError?.(this.failure);
    } catch {
      /* best-effort: a failing error callback must not break the writer */
    }
  }
}
