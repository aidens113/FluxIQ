import { expect, it } from "vitest";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { bindPartialTrialContext, observePartialTrialCallback } from "../index.ts";

it("preserves an unmanaged partial callback's fulfilled result but blocks ordinary roots and reopened owners before another write", async () => {
  const f = await buildToolFixture();
  let writes = 0;
  const owner = { async write() {
    writes++;
    return { written: true };
  } };
  const run = async (request: object) => await observePartialTrialCallback(request, { receiver: owner, callback: owner.write, args: [] });
  f.callbacks.manage({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
  const request = Object.freeze({});
  expect(await f.roots.invoke({ receiver: undefined, callback: run, args: [request] }, undefined, { prepared: (parent, originalRoot) => {
    bindPartialTrialContext(request, { parent, callbacks: f.callbacks, automation: undefined, originalRoot });
  } })).toEqual({ written: true });
  expect(writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.roots.invoke({ receiver: undefined, callback: run, args: [{ ...request }] })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  await expect(reopened.roots.invoke({ receiver: undefined, callback: run, args: [Object.freeze({})] })).rejects.toThrow();
  expect(writes).toBe(1);
});

it("keeps original supported no-direct partial callbacks reusable with fresh original requests", async () => {
  const f = await buildToolFixture();
  let reads = 0;
  const owner = { async read() {
    reads++;
    return { value: "isolated" };
  } };
  f.callbacks.manage({ receiver: owner, callback: owner.read, contract: "no_direct_effects" });
  const run = async (request: object) => await observePartialTrialCallback(request, { receiver: owner, callback: owner.read, args: [] });
  f.callbacks.manage({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
  for (let index = 0; index < 2; index++) {
    const request = Object.freeze({});
    expect(await f.roots.invoke({ receiver: undefined, callback: run, args: [request] }, undefined, { prepared: (parent, originalRoot) => {
      bindPartialTrialContext(request, { parent, callbacks: f.callbacks, automation: undefined, originalRoot });
    } })).toEqual({ value: "isolated" });
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  }
  expect(reads).toBe(2);
});
