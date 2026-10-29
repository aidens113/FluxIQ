import type { ProvisioningListenerRateLimit } from "../types";

/**
 * A sliding-window request budget per key (the source address): a request is
 * admitted when fewer than `limit` admitted requests from that key fall in
 * the last `windowMs`. A refused request does not count. Keys idle for a whole
 * window are swept, so memory follows the sources active in the last window.
 */
export class SlidingWindowRateLimiter {
  private readonly admitted = new Map<string, number[]>();
  private sweptAtMs: number;

  constructor(
    private readonly budget: ProvisioningListenerRateLimit,
    private readonly now: () => number
  ) {
    this.sweptAtMs = now();
  }

  /** Admits and counts one request from `key`, or refuses it. */
  take(key: string): boolean {
    const nowMs = this.now();
    const since = nowMs - this.budget.windowMs;
    this.sweep(nowMs, since);
    const recent = (this.admitted.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= this.budget.limit) {
      this.admitted.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.admitted.set(key, recent);
    return true;
  }

  private sweep(nowMs: number, since: number): void {
    if (nowMs - this.sweptAtMs < this.budget.windowMs) return;
    this.sweptAtMs = nowMs;
    for (const [key, times] of this.admitted) {
      const newest = times[times.length - 1];
      if (newest === undefined || newest <= since) this.admitted.delete(key);
    }
  }
}
