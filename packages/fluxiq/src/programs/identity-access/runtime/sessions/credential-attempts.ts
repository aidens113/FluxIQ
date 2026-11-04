// How many wrong passwords a signed-in session may offer. A stolen cookie must not get
// unlimited guesses at the cost of the server's CPU, and each guess runs a slow key
// derivation. Sign-in has its own durable limiter in the web app; this one covers every
// recheck of a person's password against a session they already hold, by person.

type Attempts = { failures: number; windowStartedAtMs: number; lockedUntilMs: number };

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;
const MAX_REMEMBERED_PEOPLE = 10_000;

/** Raised while a person's rechecks are held back. Says nothing about whether a guess was right. */
export const CREDENTIAL_ATTEMPTS_EXCEEDED = "Too many password attempts. Wait a few minutes, then try again.";

export class IdentityCredentialAttempts {
  private readonly attempts = new Map<string, Attempts>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Runs a recheck under the limit: a failure counts, a success clears. While held back it does not run, so a guess costs no derivation. */
  async guard<T>(userId: string, recheck: () => Promise<T>): Promise<T> {
    const nowMs = this.now();
    const state = this.attempts.get(userId);
    if (state && state.lockedUntilMs > nowMs) throw new Error(CREDENTIAL_ATTEMPTS_EXCEEDED);
    let result: T;
    try {
      result = await recheck();
    } catch (error) {
      this.fail(userId, nowMs);
      throw error;
    }
    this.attempts.delete(userId);
    return result;
  }

  private fail(userId: string, nowMs: number): void {
    const previous = this.attempts.get(userId);
    const current = previous && nowMs - previous.windowStartedAtMs <= WINDOW_MS ? previous : { failures: 0, windowStartedAtMs: nowMs, lockedUntilMs: 0 };
    current.failures += 1;
    if (current.failures >= MAX_FAILURES) current.lockedUntilMs = nowMs + LOCKOUT_MS;
    this.attempts.delete(userId);
    this.attempts.set(userId, current);
    if (this.attempts.size > MAX_REMEMBERED_PEOPLE) this.attempts.delete(this.attempts.keys().next().value as string);
  }
}
