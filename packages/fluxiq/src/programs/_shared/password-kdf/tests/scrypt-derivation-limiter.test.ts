import { afterEach, describe, expect, it, vi } from "vitest";
import { createScryptDerivationLimiter, scryptDerivationLimiter } from "../scrypt-derivation-limiter.ts";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

function gate(gates: Array<Deferred<void>>, index: number): Deferred<void> {
  const entry = gates[index];
  if (!entry) throw new Error(`no gate ${index}`);
  return entry;
}

describe("scrypt derivation limiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs at most two process-wide tasks at once and drains the queue in order", async () => {
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const started: number[] = [];
    let active = 0;
    let maxActive = 0;
    const results = gates.map((entry, index) => scryptDerivationLimiter.run(async () => {
      started.push(index);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await entry.promise;
      active -= 1;
      return index;
    }));

    await flushMicrotasks();
    expect(started).toEqual([0, 1]);
    expect(scryptDerivationLimiter.activeCount).toBe(2);
    expect(scryptDerivationLimiter.pendingCount).toBe(3);

    gate(gates, 1).resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2]);

    gate(gates, 0).resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2, 3]);

    gate(gates, 3).resolve();
    gate(gates, 2).resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    gate(gates, 4).resolve();

    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
    expect(scryptDerivationLimiter.activeCount).toBe(0);
    expect(scryptDerivationLimiter.pendingCount).toBe(0);
  });

  it("releases the slot of a task that rejects or throws synchronously", async () => {
    const limiter = createScryptDerivationLimiter(1);
    const rejected = limiter.run(() => Promise.reject(new Error("dummy async failure")));
    const thrown = limiter.run(() => {
      throw new Error("dummy sync failure");
    });
    const after = limiter.run(async () => "still runs");

    await expect(rejected).rejects.toThrow("dummy async failure");
    await expect(thrown).rejects.toThrow("dummy sync failure");
    await expect(after).resolves.toBe("still runs");
    expect(limiter.activeCount).toBe(0);
  });

  it("uses no timers, so it completes under fake timers without advancing them", async () => {
    vi.useFakeTimers();
    const limiter = createScryptDerivationLimiter(2);
    const gates = Array.from({ length: 4 }, () => deferred<void>());
    const results = gates.map((entry, index) => limiter.run(async () => {
      await entry.promise;
      return index;
    }));

    await flushMicrotasks();
    expect(vi.getTimerCount()).toBe(0);
    expect(limiter.activeCount).toBe(2);
    expect(limiter.pendingCount).toBe(2);

    for (const entry of gates) entry.resolve();
    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses a concurrency that is not a whole number of at least one", () => {
    expect(() => createScryptDerivationLimiter(0)).toThrow(RangeError);
    expect(() => createScryptDerivationLimiter(1.5)).toThrow(RangeError);
    expect(() => createScryptDerivationLimiter(Number.NaN)).toThrow(RangeError);
    expect(() => createScryptDerivationLimiter(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
