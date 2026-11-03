/**
 * Runs repository writes for one record id strictly in the order they were
 * queued, so a slow earlier write cannot land after a later one: an in-flight
 * re-seal `put` cannot resurrect a record a later `delete` removed. Writes for
 * different ids run independently. A failed write does not block the writes
 * queued behind it; its own caller still receives the error.
 */
export class RecordWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private currentFrontier: object = Object.freeze({});

  enqueue<T>(recordId: string, write: () => Promise<T>): Promise<T> {
    this.currentFrontier = Object.freeze({});
    const previous = this.tails.get(recordId) ?? Promise.resolve();
    const result = previous.then(write);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(recordId, tail);
    void tail.then(() => {
      if (this.tails.get(recordId) === tail) {
        this.tails.delete(recordId);
        this.currentFrontier = Object.freeze({});
      }
    });
    return result;
  }

  /** Record ids with a write queued or running. */
  pendingRecordCount(): number {
    return this.tails.size;
  }

  /** Settlement barrier only: original callers retain write errors; this issues no completion. */
  prefix(): Promise<void> {
    return Promise.all([...this.tails.values()]).then(() => undefined);
  }

  /** A private live scheduling identity; it is never an execution right. */
  frontier(): object {
    return this.currentFrontier;
  }
}
