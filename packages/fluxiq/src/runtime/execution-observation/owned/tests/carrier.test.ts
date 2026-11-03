import { expect, it } from "vitest";
import { observationFixture } from "../../tests/fixture.ts";
import { prepareObservedExecutionCallback, readObservedExecutionCallbackCarrier } from "../index.ts";

it("keeps the exact original decorator argument through checked nested calls and restores the parent", async () => {
  const f = await observationFixture();
  const raw = { signal: new AbortController().signal };
  const inner = { run(actual: typeof raw) {
    expect(actual).toBe(raw);
    expect(readObservedExecutionCallbackCarrier(actual, inner, inner.run)).toBeDefined();
    return 8;
  } };
  f.source.manage({ receiver: inner, callback: inner.run, contract: "no_direct_effects" });
  const outer = { async run(actual: typeof raw) {
    expect(actual).toBe(raw);
    const parent = readObservedExecutionCallbackCarrier(actual, outer, outer.run)!;
    const child = await prepareObservedExecutionCallback(parent, { receiver: inner, callback: inner.run, args: [actual] });
    child.bindCarrier(actual);
    expect(await child.invoke()).toBe(8);
    expect(readObservedExecutionCallbackCarrier(actual, outer, outer.run)).toBe(parent);
    return 9;
  } };
  f.source.manage({ receiver: outer, callback: outer.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: outer, callback: outer.run, args: [raw] });
  owned.bindCarrier(raw);
  expect(() => readObservedExecutionCallbackCarrier(raw, outer, outer.run)).toThrow("carrier_inactive");
  await expect(owned.invoke()).resolves.toBe(9);
  expect(owned.completion()).toBe("settled");
  expect(() => readObservedExecutionCallbackCarrier(raw, outer, outer.run)).toThrow("carrier_inactive");
  expect(Object.keys(raw)).toEqual(["signal"]);
  expect(readObservedExecutionCallbackCarrier({ ...raw }, outer, outer.run)).toBeUndefined();
  const repeated = await prepareObservedExecutionCallback(f.observation, { receiver: outer, callback: outer.run, args: [raw] });
  expect(() => repeated.bindCarrier(raw)).toThrow("carrier_reused");
});

it("refuses a concurrent sibling swap while the actual original child is pending", async () => {
  const f = await observationFixture();
  const raw = { signal: new AbortController().signal };
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const called = new Promise<void>(resolve => { entered = resolve; });
  let first = 0;
  let swapped = 0;
  const inner = {
    async run(_actual: typeof raw) {
      first++;
      entered();
      await held;
      return 1;
    },
    other(_actual: typeof raw) {
      swapped++;
      return 2;
    }
  };
  f.source.manage({ receiver: inner, callback: inner.run, contract: "no_direct_effects" });
  const outer = { async run(actual: typeof raw) {
    const parent = readObservedExecutionCallbackCarrier(actual, outer, outer.run)!;
    const child = await prepareObservedExecutionCallback(parent, { receiver: inner, callback: inner.run, args: [actual] });
    child.bindCarrier(actual);
    const running = child.invoke();
    await called;
    const sibling = await prepareObservedExecutionCallback(parent, { receiver: inner, callback: inner.other, args: [actual] });
    expect(() => sibling.bindCarrier(actual)).toThrow("carrier_parent_mismatch");
    expect(() => readObservedExecutionCallbackCarrier(actual, inner, inner.other)).toThrow("carrier_foreign_call");
    release();
    return await running;
  } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: outer, callback: outer.run, args: [raw] });
  owned.bindCarrier(raw);
  await expect(owned.invoke()).resolves.toBe(1);
  expect(first).toBe(1);
  expect(swapped).toBe(0);
});

it("retires an inactive nested binding on pre-invoke cancellation and restores the original parent", async () => {
  const f = await observationFixture();
  const raw = { signal: new AbortController().signal };
  const controller = new AbortController();
  const reason = new Error("nested call cancelled before send");
  let sends = 0;
  const inner = { run(_actual: typeof raw) { sends++; } };
  const outer = { async run(actual: typeof raw) {
    const parent = readObservedExecutionCallbackCarrier(actual, outer, outer.run)!;
    const child = await prepareObservedExecutionCallback(parent, { receiver: inner, callback: inner.run, args: [actual] }, controller.signal);
    child.bindCarrier(actual);
    controller.abort(reason);
    try { await child.invoke(); }
    finally { expect(readObservedExecutionCallbackCarrier(actual, outer, outer.run)).toBe(parent); }
  } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: outer, callback: outer.run, args: [raw] });
  owned.bindCarrier(raw);
  await expect(owned.invoke()).rejects.toBe(reason);
  expect(sends).toBe(0);
  expect(() => readObservedExecutionCallbackCarrier(raw, outer, outer.run)).toThrow("carrier_inactive");
});
