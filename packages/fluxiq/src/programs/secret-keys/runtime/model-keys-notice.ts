import { AsyncLocalStorage } from "node:async_hooks";

/** One held write: whether a change was announced inside it, and whether it has ended. */
type Hold = { pending: boolean; released: boolean };

/**
 * Tells listeners that the keys or the model-key choices changed, after the
 * write landed (t928). A write whose model access is not final when it lands
 * holds the notice (`holding`): a saved key's free check records the
 * provider's answer after the commit, and a notice at the commit would let
 * every client read the key as ready for the moment before the check said
 * otherwise. Held notices are given once, when the write settles, however it
 * settles: returned, thrown or rejected.
 *
 * The hold belongs to the write's own asynchronous chain
 * (`AsyncLocalStorage`), so another person's write running at the same time
 * still notifies at once. No timer: the hold lasts exactly as long as the
 * write. An announcement that arrives on a chain whose hold already ended
 * (work the write started and left running) is given at once, never lost.
 */
export class ModelKeysChangeNotice {
  private readonly listeners = new Set<() => void>();
  private readonly holds = new AsyncLocalStorage<Hold>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  announce(): void {
    const hold = this.holds.getStore();
    if (hold && !hold.released) {
      hold.pending = true;
      return;
    }
    this.tell();
  }

  /** Runs `run` with every notice inside it held, then gives one if any was announced. A hold inside a hold joins the outer one. */
  async holding<T>(run: () => Promise<T>): Promise<T> {
    const outer = this.holds.getStore();
    if (outer && !outer.released) return await run();
    const hold: Hold = { pending: false, released: false };
    try {
      return await this.holds.run(hold, run);
    } finally {
      hold.released = true;
      if (hold.pending) this.tell();
    }
  }

  /** One listener that throws costs nothing else; only its error's name is logged. */
  private tell(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.warn(`A Secret Keys change listener failed (${error instanceof Error ? error.name : "non_error"}).`);
      }
    }
  }
}
