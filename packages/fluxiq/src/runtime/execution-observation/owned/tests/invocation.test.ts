import { expect, it } from "vitest";
import { OriginalExecutionPromiseReceipts } from "../../queue-completion/index.ts";
import { observationFixture } from "../../tests/fixture.ts";
import { OwnedExecutionCallback, prepareObservedExecutionCallback } from "../index.ts";

it("pins the original receiver, method and tuple before durable preparation", async () => {
  const f = await observationFixture();
  class Host {
    #value = 5;
    calls = 0;
    read(delta: number): number {
      this.calls++;
      return this.#value + delta;
    }
  }
  const host = new Host();
  const original = host.read;
  f.source.manage({ receiver: host, callback: original, contract: "no_direct_effects" });
  const args: [number] = [2];
  const paused = f.store.pauseNext("enter");
  const preparing = prepareObservedExecutionCallback(f.observation, { receiver: host, callback: original, args });
  await paused.entered;
  args[0] = 99;
  host.read = () => 1000;
  expect(host.calls).toBe(0);
  paused.release();
  const owned = await preparing;
  expect(owned.observation).toBeDefined();
  expect(owned.isManaged()).toBe(true);
  expect(owned.isReadOnly()).toBe(true);
  await expect(owned.invoke()).resolves.toBe(7);
  expect(owned.completion()).toBe("settled");
  expect(host.calls).toBe(1);
  await expect(owned.invoke()).rejects.toThrow("already_invoked");
});

it("denies an abort after preparation before invoking, retaining the original reason and open coverage", async () => {
  const f = await observationFixture();
  const controller = new AbortController();
  const reason = new Error("original cancellation");
  let sends = 0;
  const host = { send() { sends++; } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: host, callback: host.send, args: [] }, controller.signal);
  controller.abort(reason);
  await expect(owned.invoke()).rejects.toBe(reason);
  expect(sends).toBe(0);
  expect(owned.completion()).toBe("unknown");
  expect([...f.store.rows.values()].some(row => !row.closed && row.facts.some(fact => fact.kind === "interrupted"))).toBe(true);
  await expect(prepareObservedExecutionCallback(f.observation, { receiver: host, callback: host.send, args: [] })).rejects.toThrow("reservation_not_active");
  expect(sends).toBe(0);
});

it("preserves cancellation and surfaces the actual retained abort write failure on owner release", async () => {
  const f = await observationFixture();
  const controller = new AbortController();
  const host = { send() { throw new Error("must not send"); } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: host, callback: host.send, args: [] }, controller.signal);
  const failed = f.store.failNext("append");
  const reason = new Error("cancelled before dispatch");
  controller.abort(reason);
  await expect(owned.invoke()).rejects.toBe(reason);
  const error = await f.authority.consumer.release(f.reserved.reservation).catch(value => value as unknown);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toContain(failed);
  expect([...f.store.rows.values()].some(row => !row.closed)).toBe(true);
});

it("uses the prepared child for the same fresh internal carrier and actual original Promise receipt", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const carrier: { observation?: typeof f.observation | undefined } = {};
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const host = { write(actual: typeof carrier) {
    expect(actual).toBe(carrier);
    const original = held.then(() => {
      writes++;
      receipts.issueObserved(original, actual.observation!, { disposition: "settled", completionDigest: "actual.write.ack", assessmentDigest: "actual.original.promise" });
      return 11;
    });
    return original;
  } };
  f.source.manage({ receiver: host, callback: host.write, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: host, callback: host.write, args: [carrier] });
  carrier.observation = owned.observation;
  Object.freeze(carrier);
  const running = owned.invoke();
  expect(writes).toBe(0);
  expect(owned.completion()).toBe("pending");
  release();
  await expect(running).resolves.toBe(11);
  expect(owned.completion()).toBe("settled");
  expect(writes).toBe(1);
});

it("does not give copied objects or JSON an invoker", async () => {
  const f = await observationFixture();
  let sends = 0;
  const host = { send() { sends++; } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: host, callback: host.send, args: [] });
  const copied = { ...owned };
  expect(JSON.stringify(owned)).toBe('{"observation":{}}');
  await expect(Reflect.apply(OwnedExecutionCallback.prototype.invoke, copied, [])).rejects.toBeInstanceOf(TypeError);
  expect(sends).toBe(0);
});

it("preserves unobserved first results without granting managed completion", async () => {
  const original = Object.freeze({ value: 9 });
  const host = { read: () => original };
  const owned = await prepareObservedExecutionCallback(undefined, { receiver: host, callback: host.read, args: [] });
  await expect(owned.invoke()).resolves.toBe(original);
  expect(owned.observation).toBeUndefined();
  expect(owned.isManaged()).toBe(false);
  expect(owned.isReadOnly()).toBe(false);
  expect(owned.completion()).toBe("unverified");
});
