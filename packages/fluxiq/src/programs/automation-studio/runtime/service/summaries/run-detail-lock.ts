// Serializes each save of one run's detail within this process. A save reads
// the stored detail, merges onto it and writes the result; two saves of the same
// run interleaving would each merge onto the same stored detail, and the later
// write would drop what the earlier one added. The project database lease is
// shared, not exclusive, so it does not provide this on its own.
export class AutomationStudioRunDetailLock {
  private readonly tails = new Map<string, Promise<void>>();

  async withRun<TResult>(projectId: string, runId: string, operation: () => Promise<TResult>): Promise<TResult> {
    const key = JSON.stringify([projectId, runId]);
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
