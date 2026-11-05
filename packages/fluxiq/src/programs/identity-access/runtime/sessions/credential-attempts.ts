// How many wrong passwords one signed-in session may offer. A stolen cookie must not get
// unlimited guesses at the cost of the server's CPU, and each guess runs a slow key
// derivation. Sign-in has its own durable limiter in the web app; this one covers every
// recheck of a person's password against a session they already hold. Counted per session,
// so guesses on a stolen one do not hold back the person on their own, and a fresh sign-in
// is always a way out.

type Attempts = { failures: number; running: number; windowStartedAtMs: number; lockedUntilMs: number };

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;
const MAX_REMEMBERED_SESSIONS = 10_000;

/** Raised while a session's rechecks are held back. Says nothing about whether a guess was right. */
export const CREDENTIAL_ATTEMPTS_EXCEEDED = "Too many password attempts. Wait a few minutes, then try again.";

export class IdentityCredentialAttempts {
  private readonly attempts = new Map<string, Attempts>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /**
   * Runs a recheck under the limit: counted as it starts, so guesses sent together cannot
   * all run; a failure stays counted, a success clears. Held back, it does not run, so a
   * guess costs no derivation.
   */
  async guard<T>(key: string, recheck: () => Promise<T>): Promise<T> {
    const nowMs = this.now();
    const state = this.current(key, nowMs);
    if (state.lockedUntilMs > nowMs || state.failures + state.running >= MAX_FAILURES) throw new Error(CREDENTIAL_ATTEMPTS_EXCEEDED);
    state.running += 1;
    this.remember(key, state);
    let result: T;
    try {
      result = await recheck();
    } catch (error) {
      state.running -= 1;
      state.failures += 1;
      if (state.failures >= MAX_FAILURES) state.lockedUntilMs = nowMs + LOCKOUT_MS;
      throw error;
    }
    state.running -= 1;
    state.failures = 0;
    if (state.running === 0) this.attempts.delete(key);
    return result;
  }

  private current(key: string, nowMs: number): Attempts {
    const known = this.attempts.get(key);
    if (known && (known.running > 0 || known.lockedUntilMs > nowMs || nowMs - known.windowStartedAtMs <= WINDOW_MS)) return known;
    return { failures: 0, running: 0, windowStartedAtMs: nowMs, lockedUntilMs: 0 };
  }

  private remember(key: string, state: Attempts): void {
    this.attempts.delete(key);
    this.attempts.set(key, state);
    if (this.attempts.size > MAX_REMEMBERED_SESSIONS) this.attempts.delete(this.attempts.keys().next().value as string);
  }
}
