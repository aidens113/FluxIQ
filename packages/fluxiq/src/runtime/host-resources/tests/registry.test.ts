import { describe, expect, it } from "vitest";
import { automationStudioProjectHostLeaseScope } from "../index.ts";
import { StubHost } from "./stub-host.ts";

describe("the scheduler for an exact host port", () => {
  it("shares capacity and the waiting queue across callers using that port", async () => {
    const host = new StubHost({ capacity: 1 });
    const first = automationStudioProjectHostLeaseScope(host);
    const second = automationStudioProjectHostLeaseScope(host);
    expect(second).toBe(first);

    const held = await first.scheduler.acquire({ role: "builder", briefId: "build.first" });
    const waiting = second.scheduler.acquire({ role: "builder", briefId: "build.second" });
    expect(host.asked).toBe(1);
    expect(first.scheduler.snapshot().waiting).toEqual([{ role: "builder", briefId: "build.second" }]);

    await first.scheduler.release(held);
    const next = await waiting;
    expect(host.asked).toBe(2);
    expect(next.resourceKey).toBe(held.resourceKey);
    expect(next.epoch).toBeGreaterThan(held.epoch);
    expect(first.scheduler.isCurrent(held)).toBe(false);
    await second.scheduler.release(next);
    expect(host.inUse()).toBe(0);
  });

  it("gives separate port objects independent schedulers and capacity", async () => {
    const first = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }));
    const second = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }));
    expect(second).not.toBe(first);
    const holder = { role: "builder", briefId: "build.same-id" };
    const leases = await Promise.all([first.scheduler.acquire(holder), second.scheduler.acquire(holder)]);
    expect(first.scheduler.isCurrent(leases[0])).toBe(true);
    expect(second.scheduler.isCurrent(leases[1])).toBe(true);
    await Promise.all([first.scheduler.release(leases[0]), second.scheduler.release(leases[1])]);
  });
});
