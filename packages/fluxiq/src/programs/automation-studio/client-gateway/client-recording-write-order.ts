/** The recording a queued write belongs to. */
type WriteTarget = { projectId?: string | null; recordingId: string };

type WriteQueue<TItem> = {
  items: TItem[];
  timer?: ReturnType<typeof setTimeout> | undefined;
  flushing?: Promise<void> | undefined;
};

/**
 * The order one client's recording messages reach storage in, kept per recording owner.
 *
 * The WebSocket host starts handling a frame without waiting for the one before it, so
 * two messages from one client can otherwise be stored in either order. Two rules make
 * the stored order the order the bridge received them:
 * - `run` puts a message's handling on its owner's chain, called before the handler's
 *   first await, so it runs only once every message received before it has been handled.
 * - High-frequency writes are queued with `enqueue` and written in batches. A handler
 *   about to write directly calls `flush` first, so nothing queued earlier lands after it.
 */
export class ClientRecordingWriteOrder<TItem extends WriteTarget> {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly queues = new Map<string, WriteQueue<TItem>>();
  private readonly write: (recording: WriteTarget, items: TItem[]) => Promise<unknown>;

  constructor(write: (recording: WriteTarget, items: TItem[]) => Promise<unknown>) {
    this.write = write;
  }

  /**
   * Runs `step` once every step queued before it for `ownerKey` has settled. The promise
   * is the step's own: a step that fails rejects only its caller, and the next step runs.
   */
  run<TResult>(ownerKey: string, step: () => Promise<TResult>): Promise<TResult> {
    const result = (this.chains.get(ownerKey) ?? Promise.resolve()).then(step);
    const tail = result.then(() => undefined, () => undefined);
    this.chains.set(ownerKey, tail);
    void tail.then(() => {
      if (this.chains.get(ownerKey) === tail) this.chains.delete(ownerKey);
    });
    return result;
  }

  /** Settles once every step queued for `ownerKey` so far has; a step queued later is not awaited. */
  settled(ownerKey: string): Promise<void> {
    return this.chains.get(ownerKey) ?? Promise.resolve();
  }

  /** Queues a write. It is written within 25 ms, once 50 are queued, or by the next `flush`. */
  enqueue(ownerKey: string, item: TItem): void {
    const queue = this.queues.get(ownerKey) ?? { items: [] };
    queue.items.push(item);
    this.queues.set(ownerKey, queue);
    if (queue.items.length >= 50) {
      void this.flush(ownerKey);
      return;
    }
    if (!queue.timer) {
      queue.timer = setTimeout(() => {
        queue.timer = undefined;
        void this.flush(ownerKey);
      }, 25);
    }
  }

  /** Writes everything queued for `ownerKey`, after any write of its queue already under way. */
  async flush(ownerKey: string): Promise<void> {
    const queue = this.queues.get(ownerKey);
    if (!queue) return;
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
    if (queue.flushing) {
      await queue.flushing;
      if (queue.items.length) await this.flush(ownerKey);
      return;
    }
    queue.flushing = (async () => {
      while (queue.items.length) {
        const batch = queue.items.splice(0, 100);
        const groups = new Map<string, { recording: WriteTarget; items: TItem[] }>();
        for (const item of batch) {
          const key = `${item.projectId ?? ""}\n${item.recordingId}`;
          const group = groups.get(key) ?? { recording: { ...(item.projectId !== undefined ? { projectId: item.projectId } : {}), recordingId: item.recordingId }, items: [] };
          group.items.push(item);
          groups.set(key, group);
        }
        for (const { recording, items } of groups.values()) await this.write(recording, items);
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
