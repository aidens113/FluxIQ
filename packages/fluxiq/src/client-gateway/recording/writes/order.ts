import type { RecordingWriteTarget } from "./target.ts";
import type { RecordingWriteFailure } from "./failure.ts";

type Queue<T> = { items: T[]; timer?: ReturnType<typeof setTimeout> | undefined; flushing?: Promise<void> | undefined };
type Settlement = { kind: "settled" } | { kind: "failed"; cause: unknown };

/** One owner chain and one batching authority, including observed background failures. */
export class ClientRecordingWriteOrder<TItem extends RecordingWriteTarget> {
  private readonly chains = new Map<string, Promise<Settlement>>();
  private readonly queues = new Map<string, Queue<TItem>>();
  private readonly background = new Map<string, Promise<Settlement>>();
  private readonly failures = new Map<string, unknown[]>();
  private readonly attempts = new Map<string, { recording: RecordingWriteTarget; entryCount: number }>();

  constructor(
    private readonly write: (recording: RecordingWriteTarget, items: TItem[]) => Promise<unknown>,
    private readonly onBackgroundFailure?: (failure: RecordingWriteFailure) => void | Promise<void>
  ) {}

  run<TResult>(ownerKey: string, step: () => Promise<TResult>): Promise<TResult> {
    const result = (this.chains.get(ownerKey) ?? Promise.resolve()).then(step);
    // Tracking only: each step's original rejecting promise is returned to its caller.
    const tail = result.then<Settlement, Settlement>(() => ({ kind: "settled" }), cause => ({ kind: "failed", cause }));
    this.chains.set(ownerKey, tail);
    void tail.then(() => {
      if (this.chains.get(ownerKey) === tail) this.chains.delete(ownerKey);
    });
    return result;
  }

  async settled(ownerKey: string): Promise<void> {
    await this.chains.get(ownerKey);
  }

  enqueue(ownerKey: string, item: TItem): void {
    const queue = this.queues.get(ownerKey) ?? { items: [] };
    queue.items.push(item);
    this.queues.set(ownerKey, queue);
    if (queue.items.length >= 50) {
      this.schedule(ownerKey);
      return;
    }
    if (!queue.timer) queue.timer = setTimeout(() => {
      queue.timer = undefined;
      this.schedule(ownerKey);
    }, 25);
  }

  async flush(ownerKey: string): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.drain(ownerKey);
    } catch (cause) {
      failures.push(cause);
    }
    await this.background.get(ownerKey);
    for (const cause of this.failures.get(ownerKey) ?? []) if (!failures.includes(cause)) failures.push(cause);
    this.failures.delete(ownerKey);
    this.attempts.delete(ownerKey);
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "recording.write_failed");
  }

  private schedule(ownerKey: string): void {
    if (this.background.has(ownerKey)) return;
    const task = this.drain(ownerKey).then<Settlement, Settlement>(
      () => ({ kind: "settled" }),
      async cause => {
        this.retain(ownerKey, cause);
        const attempted = this.attempts.get(ownerKey);
        try {
          await this.onBackgroundFailure?.({ ownerKey, recording: attempted?.recording, entryCount: attempted?.entryCount ?? 0, cause });
        } catch (observerCause) {
          this.retain(ownerKey, observerCause);
        }
        return { kind: "failed", cause };
      }
    );
    this.background.set(ownerKey, task);
    // Tracking only: original write/observer causes remain retained for awaited flush.
    void task.then(() => {
      if (this.background.get(ownerKey) === task) this.background.delete(ownerKey);
    });
  }

  private retain(ownerKey: string, cause: unknown): void {
    const failures = this.failures.get(ownerKey) ?? [];
    if (!failures.includes(cause)) failures.push(cause);
    this.failures.set(ownerKey, failures);
  }

  private async drain(ownerKey: string): Promise<void> {
    const queue = this.queues.get(ownerKey);
    if (!queue) return;
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
    if (queue.flushing) {
      await queue.flushing;
      if (queue.items.length) await this.drain(ownerKey);
      return;
    }
    queue.flushing = (async () => {
      while (queue.items.length) {
        const batch = queue.items.splice(0, 100);
        const groups = new Map<string, { recording: RecordingWriteTarget; items: TItem[] }>();
        for (const item of batch) {
          const key = `${item.projectId ?? ""}\n${item.recordingId}`;
          const group = groups.get(key) ?? { recording: { ...(item.projectId !== undefined ? { projectId: item.projectId } : {}), recordingId: item.recordingId }, items: [] };
          group.items.push(item);
          groups.set(key, group);
        }
        for (const { recording, items } of groups.values()) {
          this.attempts.set(ownerKey, { recording, entryCount: items.length });
          await this.write(recording, items);
        }
      }
    })();
    try {
      await queue.flushing;
    } finally {
      queue.flushing = undefined;
      if (!queue.items.length && !queue.timer) this.queues.delete(ownerKey);
    }
  }
}
