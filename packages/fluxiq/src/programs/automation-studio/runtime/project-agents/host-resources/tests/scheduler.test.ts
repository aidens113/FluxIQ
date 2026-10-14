import { describe, expect, it } from "vitest";
import {
  type AutomationStudioHostResourceAcquireResult,
  type AutomationStudioHostResourceHolder,
  type AutomationStudioHostResourceLease,
  type AutomationStudioHostResourcePort,
  AutomationStudioHostResourcePortContractError,
  AutomationStudioHostResourceScheduler,
  AutomationStudioHostResourceStaleLeaseError
} from "../index.ts";
import { StubHost } from "./stub-host.ts";

const builder = (briefId: string): AutomationStudioHostResourceHolder => ({ role: "builder", briefId });

/** Lets every queued promise callback and port call run. */
const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Records the order leases resolve in, without awaiting them one by one. */
function track(promise: Promise<AutomationStudioHostResourceLease>, order: string[]) {
  const state: { lease?: AutomationStudioHostResourceLease; error?: unknown } = {};
  promise.then(
    (lease) => {
      state.lease = lease;
      order.push(lease.holder.briefId);
    },
    (error: unknown) => {
      state.error = error;
    }
  );
  return state;
}

describe("host-resource scheduler capacity", () => {
  it("with capacity 2 grants two leases and queues a third", async () => {
    const host = new StubHost({ capacity: 2 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const order: string[] = [];
    const a = track(scheduler.acquire(builder("a")), order);
    const b = track(scheduler.acquire(builder("b")), order);
    const c = track(scheduler.acquire(builder("c")), order);
    await drain();

    expect(order).toEqual(["a", "b"]);
    expect(a.lease?.resourceKey).not.toBe(b.lease?.resourceKey);
    expect(c.lease).toBeUndefined();
    expect(host.inUse()).toBe(2);
    expect(host.acquired.map((holder) => holder.briefId)).toEqual(["a", "b"]);
    expect(scheduler.snapshot().waiting).toEqual([builder("c")]);
  });

  it("never asks a port that would grant more than its declared capacity", async () => {
    let epoch = 0;
    const port: AutomationStudioHostResourcePort = {
      capacity: 2,
      acquire: () => {
        epoch += 1;
        return { resourceKey: `resource-${epoch}`, epoch };
      },
      release: () => undefined
    };
    const scheduler = new AutomationStudioHostResourceScheduler(port);
    const order: string[] = [];
    track(scheduler.acquire(builder("a")), order);
    track(scheduler.acquire(builder("b")), order);
    track(scheduler.acquire(builder("c")), order);
    await drain();

    expect(order).toEqual(["a", "b"]);
    expect(epoch).toBe(2);
  });

  it("counts a resource still being released against capacity", async () => {
    let epoch = 0;
    let finishRelease: (() => void) | undefined;
    const port: AutomationStudioHostResourcePort = {
      capacity: 1,
      acquire: () => {
        epoch += 1;
        return { resourceKey: `resource-${epoch}`, epoch };
      },
      release: () => new Promise<void>((resolve) => { finishRelease = resolve; })
    };
    const scheduler = new AutomationStudioHostResourceScheduler(port);
    const order: string[] = [];
    const a = await scheduler.acquire(builder("a"));
    const b = track(scheduler.acquire(builder("b")), order);
    const released = scheduler.release(a);
    // A new arrival while the release is in flight must not get the resource early.
    const c = track(scheduler.acquire(builder("c")), order);
    await drain();

    expect(scheduler.isCurrent(a)).toBe(false);
    expect(epoch).toBe(1);
    expect(order).toEqual([]);

    finishRelease?.();
    await released;
    await drain();
    expect(order).toEqual(["b"]);
    expect(b.lease?.epoch).toBe(2);
    expect(c.lease).toBeUndefined();
  });

  it("with capacity 1 runs holders one at a time", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 }));
    let running = 0;
    let most = 0;
    const order: string[] = [];
    const work = (id: string) => scheduler.run(builder(id), async () => {
      running += 1;
      most = Math.max(most, running);
      order.push(`start ${id}`);
      await drain();
      order.push(`end ${id}`);
      running -= 1;
    });
    await Promise.all([work("a"), work("b"), work("c")]);

    expect(most).toBe(1);
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("with capacity 2 runs two holders at once and never more", async () => {
    const host = new StubHost({ capacity: 2 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    let running = 0;
    let most = 0;
    const work = (id: string) => scheduler.run(builder(id), async () => {
      running += 1;
      most = Math.max(most, running);
      expect(host.inUse()).toBeLessThanOrEqual(2);
      await drain();
      await drain();
      running -= 1;
    });
    await Promise.all(["a", "b", "c", "d", "e"].map(work));

    expect(most).toBe(2);
    expect(host.inUse()).toBe(0);
    expect(scheduler.snapshot().held).toEqual([]);
  });
});

describe("host-resource scheduler queue", () => {
  it("hands a released resource to waiters first in, first out", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 }));
    const order: string[] = [];
    const states = ["a", "b", "c", "d"].map((id) => track(scheduler.acquire(builder(id)), order));
    await drain();
    expect(order).toEqual(["a"]);

    for (const state of states.slice(0, 3)) {
      await scheduler.release(state.lease as AutomationStudioHostResourceLease);
      await drain();
    }

    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("removes an aborted waiter, which never acquires", async () => {
    const host = new StubHost({ capacity: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const order: string[] = [];
    const a = track(scheduler.acquire(builder("a")), order);
    const cancel = new AbortController();
    const b = track(scheduler.acquire(builder("b"), { signal: cancel.signal }), order);
    const c = track(scheduler.acquire(builder("c")), order);
    await drain();

    cancel.abort(new Error("brief cancelled"));
    await drain();
    expect((b.error as Error).message).toBe("brief cancelled");
    expect(scheduler.snapshot().waiting).toEqual([builder("c")]);

    await scheduler.release(a.lease as AutomationStudioHostResourceLease);
    await drain();
    expect(order).toEqual(["a", "c"]);
    expect(host.acquired.map((holder) => holder.briefId)).toEqual(["a", "c"]);
    expect(c.lease).toBeDefined();
  });

  it("refuses a waiter whose signal is already aborted without queuing it", async () => {
    const host = new StubHost({ capacity: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const cancel = new AbortController();
    cancel.abort(new Error("already stopped"));

    await expect(scheduler.acquire(builder("a"), { signal: cancel.signal })).rejects.toThrow("already stopped");
    expect(host.acquired).toEqual([]);
    expect(scheduler.snapshot().waiting).toEqual([]);
  });

  it("gives back a grant that arrives after its waiter aborted and serves the next waiter", async () => {
    let grantFirst: ((result: AutomationStudioHostResourceAcquireResult) => void) | undefined;
    const released: AutomationStudioHostResourceLease[] = [];
    let epoch = 0;
    const port: AutomationStudioHostResourcePort = {
      capacity: 1,
      acquire: () => {
        epoch += 1;
        if (epoch === 1) return new Promise((resolve) => { grantFirst = resolve; });
        return { resourceKey: "resource-1", epoch };
      },
      release: (lease) => { released.push(lease); }
    };
    const scheduler = new AutomationStudioHostResourceScheduler(port);
    const order: string[] = [];
    const cancel = new AbortController();
    const a = track(scheduler.acquire(builder("a"), { signal: cancel.signal }), order);
    const b = track(scheduler.acquire(builder("b")), order);
    await drain();

    cancel.abort(new Error("stop a"));
    grantFirst?.({ resourceKey: "resource-1", epoch: 1 });
    await drain();

    expect((a.error as Error).message).toBe("stop a");
    expect(released.map((lease) => [lease.holder.briefId, lease.epoch])).toEqual([["a", 1]]);
    expect(order).toEqual(["b"]);
    expect(b.lease?.epoch).toBe(2);
  });

  it("waits when the port answers at_capacity below the declared capacity", async () => {
    const host = new StubHost({ capacity: 2, heldOutside: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const order: string[] = [];
    const a = track(scheduler.acquire(builder("a")), order);
    const b = track(scheduler.acquire(builder("b")), order);
    await drain();

    expect(order).toEqual(["a"]);
    expect(scheduler.snapshot().held).toHaveLength(1);
    expect(scheduler.snapshot().waiting).toEqual([builder("b")]);

    // A later arrival queues behind b without asking the full host again.
    const c = track(scheduler.acquire(builder("c")), order);
    await drain();
    expect(host.asked).toBe(2);
    expect(scheduler.snapshot().waiting).toEqual([builder("b"), builder("c")]);

    await scheduler.release(a.lease as AutomationStudioHostResourceLease);
    await drain();
    expect(order).toEqual(["a", "b"]);
    expect(b.lease).toBeDefined();
    expect(c.lease).toBeUndefined();
  });

  it("asks the port again on retryWaiting when a resource frees outside Core", async () => {
    const host = new StubHost({ capacity: 1, heldOutside: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const order: string[] = [];
    track(scheduler.acquire(builder("a")), order);
    await drain();
    expect(order).toEqual([]);

    host.heldOutside = 0;
    scheduler.retryWaiting();
    await drain();
    expect(order).toEqual(["a"]);
  });

  it("refuses a holder that already holds or waits", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 }));
    const lease = await scheduler.acquire(builder("a"));

    await expect(scheduler.acquire(builder("a"))).rejects.toThrow("already holds or waits");
    track(scheduler.acquire(builder("b")), []);
    await drain();
    await expect(scheduler.acquire(builder("b"))).rejects.toThrow("already holds or waits");
    expect(scheduler.isCurrent(lease)).toBe(true);
    expect(scheduler.snapshot().waiting).toEqual([builder("b")]);
  });

  it("refuses a holder without a role or brief", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 }));
    await expect(scheduler.acquire({ role: "", briefId: "a" })).rejects.toThrow(TypeError);
    await expect(scheduler.acquire({ role: "builder", briefId: "" })).rejects.toThrow(TypeError);
  });
});

describe("host-resource leases", () => {
  it("is stale after release and when its resource is reissued", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 }));
    const first = await scheduler.acquire(builder("a"));
    expect(scheduler.isCurrent(first)).toBe(true);
    expect(() => scheduler.assertCurrent(first)).not.toThrow();

    await scheduler.release(first);
    expect(scheduler.isCurrent(first)).toBe(false);
    expect(() => scheduler.assertCurrent(first)).toThrow(AutomationStudioHostResourceStaleLeaseError);

    const second = await scheduler.acquire(builder("a"));
    expect(second.resourceKey).toBe(first.resourceKey);
    expect(second.epoch).toBeGreaterThan(first.epoch);
    expect(scheduler.isCurrent(second)).toBe(true);
    expect(scheduler.isCurrent(first)).toBe(false);
    expect(scheduler.isCurrent({ ...second, holder: builder("b") })).toBe(false);
  });

  it("treats a second release as harmless", async () => {
    const host = new StubHost({ capacity: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    const lease = await scheduler.acquire(builder("a"));

    await expect(scheduler.release(lease)).resolves.toBe(true);
    await expect(scheduler.release(lease)).resolves.toBe(false);
    expect(host.released).toHaveLength(1);
    expect(host.inUse()).toBe(0);
  });

  it("releases when the holder's work fails", async () => {
    const host = new StubHost({ capacity: 1 });
    const scheduler = new AutomationStudioHostResourceScheduler(host);
    let held: AutomationStudioHostResourceLease | undefined;

    await expect(scheduler.run(builder("a"), async (lease) => {
      held = lease;
      throw new Error("builder blocked");
    })).rejects.toThrow("builder blocked");

    expect(scheduler.isCurrent(held as AutomationStudioHostResourceLease)).toBe(false);
    expect(host.inUse()).toBe(0);
  });
});

describe("host-resource port contract", () => {
  const port = (overrides: Partial<AutomationStudioHostResourcePort>): AutomationStudioHostResourcePort => ({
    capacity: 1,
    acquire: () => ({ resourceKey: "resource-1", epoch: 1 }),
    release: () => undefined,
    ...overrides
  });

  it("refuses a capacity below 1 or not a whole number", () => {
    expect(() => new AutomationStudioHostResourceScheduler(port({ capacity: 0 }))).toThrow(AutomationStudioHostResourcePortContractError);
    expect(() => new AutomationStudioHostResourceScheduler(port({ capacity: 1.5 }))).toThrow(AutomationStudioHostResourcePortContractError);
  });

  it("refuses a grant that overlaps a live lease", async () => {
    let epoch = 0;
    const scheduler = new AutomationStudioHostResourceScheduler(port({
      capacity: 2,
      acquire: () => {
        epoch += 1;
        return { resourceKey: "resource-1", epoch };
      }
    }));
    await scheduler.acquire(builder("a"));
    await expect(scheduler.acquire(builder("b"))).rejects.toThrow(AutomationStudioHostResourcePortContractError);
  });

  it("carries the grant's session onto the lease, and leaves it off a grant without one", async () => {
    const withSession = new AutomationStudioHostResourceScheduler(port({ acquire: () => ({ resourceKey: "resource-1", epoch: 1, sessionId: "session.a" }) }));
    expect(await withSession.acquire(builder("a"))).toEqual({ resourceKey: "resource-1", epoch: 1, sessionId: "session.a", holder: builder("a") });
    const lease = await new AutomationStudioHostResourceScheduler(port({})).acquire(builder("a"));
    expect(Object.hasOwn(lease, "sessionId")).toBe(false);
  });

  it("refuses a grant whose session id is not a non-empty string", async () => {
    for (const sessionId of ["", 7]) {
      const scheduler = new AutomationStudioHostResourceScheduler(port({ acquire: () => ({ resourceKey: "resource-1", epoch: 1, sessionId: sessionId as string }) }));
      await expect(scheduler.acquire(builder("a"))).rejects.toThrow(AutomationStudioHostResourcePortContractError);
    }
  });

  it("refuses a reissue whose epoch does not rise", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(port({}));
    const lease = await scheduler.acquire(builder("a"));
    await scheduler.release(lease);
    await expect(scheduler.acquire(builder("b"))).rejects.toThrow(AutomationStudioHostResourcePortContractError);
  });

  it("rejects the waiter when the port's acquire fails and serves the next", async () => {
    let calls = 0;
    const scheduler = new AutomationStudioHostResourceScheduler(port({
      acquire: () => {
        calls += 1;
        if (calls === 1) throw new Error("host down");
        return { resourceKey: "resource-1", epoch: calls };
      }
    }));
    const first = scheduler.acquire(builder("a"));
    const second = scheduler.acquire(builder("b"));
    await expect(first).rejects.toThrow("host down");
    await expect(second).resolves.toMatchObject({ holder: builder("b") });
  });
});
