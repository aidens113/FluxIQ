import { expect, it } from "vitest";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { bindPartialTrialContext, observePartialTrialCallback } from "../../../candidate-trials/partial/index.ts";
import { observeAutomationStudioTrialResultPolicy } from "../index.ts";

it("preserves a terminal trial's result through its exact pure postprocessing callback while refusing a new managed write", async () => {
  const f = await buildToolFixture();
  let writes = 0, postReads = 0, metadataWrites = 0, roots = 0;
  const owner = { async write() {
    writes++;
    return { first: "kept" };
  } };
  const data = { read() {
    postReads++;
    return [];
  } };
  const writer = { async write() { metadataWrites++; } };
  f.callbacks.manage({ receiver: data, callback: data.read, contract: "no_direct_effects" });
  f.callbacks.manage({ receiver: writer, callback: writer.write, contract: "managed_direct_effects", consumeCompletion: () => null });
  const run = async (request: object) => {
    const first = await observePartialTrialCallback(request, { receiver: owner, callback: owner.write, args: [] });
    expect(await observeAutomationStudioTrialResultPolicy(request, { receiver: data, callback: data.read, args: [] })).toEqual([]);
    await expect(observeAutomationStudioTrialResultPolicy(request, { receiver: writer, callback: writer.write, args: [] })).rejects.toThrow("execution_admission.reservation_not_active");
    expect(metadataWrites).toBe(0);
    return first;
  };
  f.callbacks.manage({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
  const request = Object.freeze({});
  expect(await f.roots.invoke({ receiver: undefined, callback: run, args: [request] }, undefined, { prepared: (parent, originalRoot) => {
    roots++;
    bindPartialTrialContext(request, { parent, callbacks: f.callbacks, automation: undefined, originalRoot });
  } })).toEqual({ first: "kept" });
  expect(writes).toBe(1);
  expect(postReads).toBe(1);
  expect(roots).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.roots.invoke({ receiver: undefined, callback: run, args: [{ ...request }] }, undefined, { prepared: () => { roots++; } })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  await expect(reopened.roots.invoke({ receiver: undefined, callback: run, args: [Object.freeze({})] }, undefined, { prepared: () => { roots++; } })).rejects.toThrow();
  expect(writes).toBe(1);
  expect(postReads).toBe(1);
  expect(metadataWrites).toBe(0);
  expect(roots).toBe(1);
});
