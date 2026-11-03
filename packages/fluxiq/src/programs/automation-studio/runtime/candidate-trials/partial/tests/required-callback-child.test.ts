import { expect, it } from "vitest";
import { observationFixture } from "../../../../../../runtime/execution-observation/tests/fixture.ts";
import { bindPartialTrialContext, bindPartialTrialFrame, observePartialTrialCallback, partialTrialContext } from "../index.ts";

it("does not complete a callback-required Core frame when it ran no actual child", async () => {
  const f = await observationFixture();
  const request = Object.freeze({});
  const answer = Object.freeze({ kind: "controlled empty frame" });
  const callback = async () => answer;
  bindPartialTrialFrame(callback, "callbacks");
  bindPartialTrialContext(request, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  expect(await observePartialTrialCallback(request, { receiver: {}, callback, args: [] }, undefined, request)).toBe(answer);
  await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("waits for a real same-source child and restores the original request context after completion", async () => {
  const f = await observationFixture();
  const request = Object.freeze({});
  const answer = Object.freeze({ kind: "controlled acknowledged child" });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const owner = { async read() {
    started();
    await held;
    return answer;
  } };
  f.source.manage({ receiver: owner, callback: owner.read, contract: "no_direct_effects" });
  const callback = async (original: object) => await observePartialTrialCallback(original, { receiver: owner, callback: owner.read, args: [] }, undefined, original);
  bindPartialTrialFrame(callback, "callbacks");
  bindPartialTrialContext(request, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  let completed = false;
  const running = observePartialTrialCallback(request, { receiver: {}, callback, args: [request] }, undefined, request).then(value => {
    completed = true;
    return value;
  });
  try {
    await entered;
    expect(completed).toBe(false);
    expect(partialTrialContext(request)?.parent).not.toBe(f.parent);
    release();
    expect(await running).toBe(answer);
    expect(partialTrialContext(request)?.parent).toBe(f.parent);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  } finally {
    release();
    await Promise.allSettled([running]);
  }
});

it("retains an unknown child's first result and blocks another call rather than certifying its parent", async () => {
  const f = await observationFixture();
  const request = Object.freeze({});
  const answer = Object.freeze({ kind: "controlled unsupported child" });
  let calls = 0;
  const owner = { async write() {
    calls++;
    return answer;
  } };
  const callback = async (original: object) => await observePartialTrialCallback(original, { receiver: owner, callback: owner.write, args: [] }, undefined, original);
  bindPartialTrialFrame(callback, "callbacks");
  bindPartialTrialContext(request, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  const receiver = Object.freeze({});
  expect(await observePartialTrialCallback(request, { receiver, callback, args: [request] }, undefined, request)).toBe(answer);
  await expect(observePartialTrialCallback(request, { receiver, callback, args: [request] }, undefined, request)).rejects.toThrow();
  expect(calls).toBe(1);
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
