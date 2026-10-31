import type { IamAuditRecord, IamAuditSink } from "fluxiq/platform";

const DEFAULT_MAX_PENDING = 1_000;

/**
 * An `IamAuditSink` for instances created before the platform's own sink is
 * open: records are kept in memory until `resolve` gives the real sink, then
 * handed to it in order, and every later record goes straight to it.
 *
 * `record` never awaits or throws, as the registry needs. The records kept
 * while waiting are bounded: past `maxPending` the oldest is dropped and
 * counted in `droppedRecords`, never an unbounded buffer. A `resolve` that
 * fails is tried again on the next record or flush.
 */
export class DeferredIamAuditSink implements IamAuditSink {
  private target: IamAuditSink | null = null;
  private connecting: Promise<IamAuditSink> | null = null;
  private pending: IamAuditRecord[] = [];
  private dropped = 0;
  private readonly maxPending: number;
  private readonly onError: ((error: Error) => void) | undefined;

  constructor(private readonly resolve: () => Promise<IamAuditSink>, options: { maxPending?: number; onError?: (error: Error) => void } = {}) {
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
    if (!Number.isSafeInteger(this.maxPending) || this.maxPending <= 0) throw new Error("workspaces.invalid_audit_limit: maxPending must be a positive safe integer");
    this.onError = options.onError;
  }

  /** Records dropped, oldest first, while the real sink was not open and the buffer was full. */
  get droppedRecords(): number {
    return this.dropped;
  }

  /** Records waiting for the real sink. */
  get pendingRecords(): number {
    return this.pending.length;
  }

  record(record: IamAuditRecord): void {
    if (this.target) {
      this.target.record(record);
      return;
    }
    this.pending.push(record);
    if (this.pending.length > this.maxPending) {
      this.pending.shift();
      this.dropped += 1;
    }
    void this.connect().catch((error: unknown) => this.report(error));
  }

  /** Opens the real sink if records wait for it, hands them over, and flushes it; with nothing ever recorded it opens nothing. */
  async flush(): Promise<void> {
    if (!this.target && !this.connecting && this.pending.length === 0) return;
    const target = await this.connect();
    await target.flush();
  }

  private connect(): Promise<IamAuditSink> {
    if (this.target) return Promise.resolve(this.target);
    this.connecting ??= this.resolve().then((target) => {
      this.target = target;
      const waiting = this.pending;
      this.pending = [];
      for (const record of waiting) target.record(record);
      return target;
    }, (error: unknown) => {
      this.connecting = null;
      throw error;
    });
    return this.connecting;
  }

  private report(error: unknown): void {
    try {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    } catch (callbackError) {
      // A failing error callback must not break `record`; the original failure is retried on the next record.
      console.warn("[FluxIQ] The IAM audit error callback failed.", { reason: callbackError instanceof Error ? callbackError.name : "unknown" });
    }
  }
}
