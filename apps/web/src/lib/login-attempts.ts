export type LoginAttemptState = {
  count: number;
  windowStartedAtMs: number;
  lockedUntilMs: number;
};

export class LoginAttemptTracker {
  private readonly attempts = new Map<string, LoginAttemptState>();

  constructor(
    private readonly options: { windowMs: number; lockoutMs: number; maxAttempts: number },
    private readonly now: () => number = Date.now,
  ) {}

  remainingLockout(key: string): number {
    const nowMs = this.now();
    const state = this.attempts.get(key);
    if (!state) return 0;
    if (state.lockedUntilMs > nowMs) return state.lockedUntilMs - nowMs;
    if (nowMs - state.windowStartedAtMs > this.options.windowMs) this.attempts.delete(key);
    return 0;
  }

  registerFailure(key: string): LoginAttemptState {
    const nowMs = this.now();
    const existing = this.attempts.get(key);
    const state = !existing || nowMs - existing.windowStartedAtMs > this.options.windowMs ? { count: 0, windowStartedAtMs: nowMs, lockedUntilMs: 0 } : existing;
    state.count += 1;
    if (state.count >= this.options.maxAttempts) state.lockedUntilMs = nowMs + this.options.lockoutMs;
    this.attempts.set(key, state);
    return { ...state };
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
