import { describe, expect, it } from "vitest";
import { createSocketRateLimit } from "../rate-limit.ts";
import { TokenBucket } from "../token-bucket.ts";

describe("TokenBucket", () => {
  it("allows the burst, refuses beyond it, and refills at the rate", () => {
    let now = 0;
    const bucket = new TokenBucket(2, 3, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
    now = 500;
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);
    now = 10_000;
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
  });

  it("is off without a rate, and a burst left unset is one second's worth", () => {
    expect(createSocketRateLimit({ messagesPerSecond: null, messageBurst: 10 })).toBeNull();
    const bucket = createSocketRateLimit({ messagesPerSecond: 2, messageBurst: null });
    expect([bucket?.take(), bucket?.take(), bucket?.take()]).toEqual([true, true, false]);
  });
});
