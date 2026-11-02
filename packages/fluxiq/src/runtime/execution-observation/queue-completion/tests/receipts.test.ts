import { expect, it } from "vitest";
import type { ExecutionCallbackCompletion, PreparedExecutionCallback } from "../../index.ts";
import { observationFixture } from "../../tests/fixture.ts";
import { OriginalExecutionPromiseReceipts } from "../index.ts";

const completion: ExecutionCallbackCompletion = { disposition: "settled", completionDigest: "owned.writer.ack", assessmentDigest: "owned.writer.original_commit" };

it("requires explicit owner issuance after held work and consumes the original Promise once", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  let release!: () => void, handle!: PreparedExecutionCallback, original!: Promise<string>, writes = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const writer = { run() {
    const parent = f.source.context(handle);
    const returned = held.then(() => {
      writes++;
      receipts.issue(returned, f.source, parent, completion);
      return "original public value";
    });
    original = returned;
    return returned;
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  const running = f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] });
  expect(writes).toBe(0);
  expect(f.source.completion(handle)).toBe("pending");
  release();
  await expect(running).resolves.toBe("original public value");
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("settled");
  expect(receipts.consume({ invocation: handle, outcome: { kind: "fulfilled", value: "original public value" }, returned: original }).disposition).toBe("unknown");
  expect(() => receipts.issue(original, f.source, f.parent, completion)).toThrow("reissued");
});

it.each(["missing", "copied", "wrong_parent"] as const)("keeps a %s receipt terminal unknown while preserving the original result", async kind => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  let handle!: PreparedExecutionCallback, writes = 0;
  const writer = { run() {
    const parent = f.source.context(handle);
    const original = Promise.resolve().then(() => {
      writes++;
      if (kind !== "missing") receipts.issue(original, f.source, kind === "wrong_parent" ? f.parent : parent, completion);
      return 7;
    });
    return kind === "copied" ? original.then(value => value) : original;
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  await expect(f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] })).resolves.toBe(7);
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("unknown");
});

it("does not clear an unknown supplied child even when the owner issued after its local work", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  let handle!: PreparedExecutionCallback, writes = 0;
  const supplied = { write() {
    writes++;
    return Promise.resolve();
  } };
  const writer = { run() {
    const parent = f.source.context(handle);
    const returned = Promise.resolve().then(async () => {
      const child = await f.source.prepare(f.source.forParent(parent), { receiver: supplied, callback: supplied.write });
      await f.source.invoke(child, { receiver: supplied, callback: supplied.write, args: [] });
      receipts.issue(returned, f.source, parent, completion);
    });
    return returned;
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  await f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] });
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("unknown");
});

it("pins the canonical source readers and original receipt reader before the producer awaits", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  let handle!: PreparedExecutionCallback, release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const writer = { run() {
    const parent = f.source.context(handle);
    const returned = held.then(() => { receipts.issue(returned, f.source, parent, completion); });
    return returned;
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  const running = f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] });
  f.source.context = () => { throw new Error("replacement context reader invoked"); };
  f.source.frameCompletion = () => { throw new Error("replacement frame reader invoked"); };
  receipts.consume = () => { throw new Error("replacement receipt reader invoked"); };
  release();
  await running;
  expect(f.source.completion(handle)).toBe("settled");
});

it("retains the original error and pending state after actual work throws", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  const error = new Error("owned write lost acknowledgement");
  let writes = 0;
  const writer = { run() { return Promise.resolve().then(() => {
    writes++;
    throw error;
  }); } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  const handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  await expect(f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] })).rejects.toBe(error);
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("pending");
});

it("preserves an unacted result DTO without authenticating it as a private receipt", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  const dto = { disposition: "unacted", completionDigest: "copied", assessmentDigest: "copied", effectApplied: false };
  let writes = 0;
  const writer = { run() {
    writes++;
    return Promise.resolve(dto);
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  const handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  await expect(f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] })).resolves.toBe(dto);
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("unknown");
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("keeps abort pending even after a late owning acknowledgement and explicit recheck", async () => {
  const f = await observationFixture(), receipts = new OriginalExecutionPromiseReceipts();
  let handle!: PreparedExecutionCallback, release!: () => void, writes = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const writer = { run() {
    const parent = f.source.context(handle);
    const returned = held.then(() => {
      writes++;
      receipts.issue(returned, f.source, parent, completion);
    });
    return returned;
  } };
  const consume = receipts.consume;
  f.source.manage({ receiver: writer, callback: writer.run, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
  handle = await f.source.prepare(f.observation, { receiver: writer, callback: writer.run });
  const running = f.source.invoke(handle, { receiver: writer, callback: writer.run, args: [] });
  await f.source.interrupt(handle, "aborted");
  release();
  await expect(running).resolves.toBeUndefined();
  expect(writes).toBe(1);
  expect(f.source.completion(handle)).toBe("unknown");
  await expect(f.source.recheck(handle)).resolves.toBe("unknown");
  await f.authority.consumer.release(f.reserved.reservation);
  const origin = f.root.origin();
  const grant = f.rootPorts.issuer.fromOrdinaryAdmission(f.root.admit(origin));
  await expect(f.authority.consumer.reserve(f.scope, grant)).rejects.toThrow("store.blocked");
  expect(writes).toBe(1);
});
