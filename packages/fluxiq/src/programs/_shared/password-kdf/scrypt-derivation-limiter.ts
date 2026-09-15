/**
 * Derivations the process runs at once. scrypt allocates about 128·N·r bytes,
 * 128 MiB at N=2^17, so two bound transient scrypt memory to about 256 MiB. It
 * also leaves two of libuv's four default threads for file system and sqlite
 * work.
 */
const SCRYPT_DERIVATION_CONCURRENCY = 2;

export type ScryptDerivationLimiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
};

/**
 * A first-in, first-out concurrency gate built on promises alone. It uses no
 * timers, so it behaves identically under `vi.useFakeTimers()`.
 */
export function createScryptDerivationLimiter(concurrency: number): ScryptDerivationLimiter {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A scrypt derivation limiter needs a whole-number concurrency of at least 1.");
  }
  let active = 0;
  const waiting: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }

  function release(): void {
    const next = waiting.shift();
    // The slot passes straight to the oldest waiter, so a later caller cannot
    // overtake it.
    if (next) {
      next();
      return;
    }
    active -= 1;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get activeCount(): number {
      return active;
    },
    get pendingCount(): number {
      return waiting.length;
    }
  };
}

/** The process-wide limiter every scrypt derivation runs through. */
export const scryptDerivationLimiter: ScryptDerivationLimiter = createScryptDerivationLimiter(SCRYPT_DERIVATION_CONCURRENCY);
