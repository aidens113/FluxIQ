import { afterEach, describe, expect, it, vi } from "vitest";
import { drainGateway, drainState } from "../index";

afterEach(() => drainState.reset());

function fakeGateway(counts: number[]) {
  const beginDrain = vi.fn();
  let calls = 0;
  return { beginDrain, openConnectionCount: () => counts[Math.min(calls++, counts.length - 1)]! };
}

describe("drainGateway", () => {
  it("marks draining, begins the gateway drain with the retry delay, and returns once connections reach zero", async () => {
    const gateway = fakeGateway([3, 2, 0]);
    let clock = 0;
    const result = await drainGateway({ gateway, drainSeconds: 30, now: () => clock, sleep: async (ms) => { clock += ms; } });
    expect(result).toBe(true);
    expect(drainState.isDraining()).toBe(true);
    expect(gateway.beginDrain).toHaveBeenCalledWith({ retryAfterMs: 30_000, reason: "shutdown" });
    expect(clock).toBeLessThan(30_000);
  });

  it("stops waiting when the time is up with connections still open", async () => {
    const gateway = fakeGateway([5]);
    let clock = 0;
    const result = await drainGateway({ gateway, drainSeconds: 2, pollMs: 500, now: () => clock, sleep: async (ms) => { clock += ms; } });
    expect(result).toBe(false);
    expect(clock).toBeGreaterThanOrEqual(2000);
    expect(clock).toBeLessThanOrEqual(2500);
  });

  it("only marks draining when there is no gateway", async () => {
    expect(await drainGateway({ gateway: null, drainSeconds: 5 })).toBe(true);
    expect(drainState.isDraining()).toBe(true);
  });
});
