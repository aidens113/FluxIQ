/** A proof operation's wait, bounded by its actual signal and the explicit controller lifetime. */
export class AutomationStudioInputUseOperation {
  static async run<T>(signal: AbortSignal | undefined, lifetime: AbortSignal, work: () => T | Promise<T>, discard?: (value: T) => void, unavailable?: () => void): Promise<T> {
    signal?.throwIfAborted();
    lifetime.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const detach = () => {
        signal?.removeEventListener("abort", abort);
        lifetime.removeEventListener("abort", close);
      };
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        detach();
        reject(reason);
      };
      const abort = () => fail(signal?.reason);
      const close = () => fail(signal?.aborted ? signal.reason : lifetime.reason);
      const release = (value: T) => {
        try { discard?.(value); }
        catch { unavailable?.(); }
      };
      signal?.addEventListener("abort", abort, { once: true });
      lifetime.addEventListener("abort", close, { once: true });
      if (signal?.aborted) abort();
      else if (lifetime.aborted) close();
      void Promise.resolve().then(() => {
        signal?.throwIfAborted();
        lifetime.throwIfAborted();
        return work();
      }).then(value => {
        if (settled) {
          release(value);
          return;
        }
        if (signal?.aborted || lifetime.aborted) {
          release(value);
          fail(signal?.aborted ? signal.reason : lifetime.reason);
          return;
        }
        settled = true;
        detach();
        resolve(value);
      }, error => fail(signal?.aborted ? signal.reason : error)).catch(error => {
        // Even a cleanup/notification callback cannot reject a detached chain after settlement.
        fail(signal?.aborted ? signal.reason : error);
      });
    });
  }

  static propagateCancellation(error: unknown, signal: AbortSignal | undefined): void {
    signal?.throwIfAborted();
    if ((error instanceof Error || error instanceof DOMException) && error.name === "AbortError") throw error;
  }
}
