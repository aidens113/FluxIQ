import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "../sliding-window-rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("admits up to the limit in any window, per key, and frees slots as they age out", () => {
    const clock = { nowMs: 0 };
    const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1_000 }, () => clock.nowMs);
    expect(limiter.take("a")).toBe(true);
    clock.nowMs = 500;
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    clock.nowMs = 1_001;
    // The first slot aged out; the one at 500 has not.
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    clock.nowMs = 1_501;
    expect(limiter.take("a")).toBe(true);
  });

  it("does not count refused requests", () => {
    const clock = { nowMs: 0 };
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1_000 }, () => clock.nowMs);
    expect(limiter.take("a")).toBe(true);
    for (let attempt = 0; attempt < 5; attempt += 1) expect(limiter.take("a")).toBe(false);
    clock.nowMs = 1_001;
    expect(limiter.take("a")).toBe(true);
  });
});
