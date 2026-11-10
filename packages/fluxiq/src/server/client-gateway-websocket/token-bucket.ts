/**
 * A token bucket: `capacity` messages at once, refilled at `ratePerSecond`.
 * One per socket; `take` answers whether one more message is within it.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number,
    private readonly now: () => number = () => performance.now()
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.ratePerSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
