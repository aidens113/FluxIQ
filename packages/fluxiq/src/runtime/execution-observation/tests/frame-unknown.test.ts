import { expect, it } from "vitest";
import { observationFixture } from "./fixture.ts";

it("retains generic synchronous gap behavior until the owning adapter explicitly fences its frame", async () => {
  const f = await observationFixture();
  const value = Object.freeze({ original: true });
  const owner = { read: () => value };
  const callback = () => f.source.invokeSync(f.source.forParent(f.source.context(prepared)), { receiver: owner, callback: owner.read, args: [] });
  f.source.manage({ receiver: undefined, callback, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const call = { receiver: undefined, callback, args: [] as [] };
  const prepared = await f.source.prepare(f.observation, call);
  expect(await f.source.invoke(prepared, call)).toBe(value);
  expect(f.source.completion(prepared)).toBe("unverified");
});

it("lets the owner persist unknown on the original frame and refuses another synchronous send", async () => {
  const f = await observationFixture();
  let writes = 0;
  const original = Object.freeze({ diagnostic: "original fulfilled result" });
  const backend = { write: () => {
    writes++;
    return original;
  } };
  const callback = () => {
    const observation = f.source.forParent(f.source.context(prepared));
    const result = f.source.invokeSync(observation, { receiver: backend, callback: backend.write, args: [] });
    f.source.markFrameUnknown(observation);
    f.source.markFrameUnknown(observation);
    expect(() => f.source.invokeSync(observation, { receiver: backend, callback: backend.write, args: [] })).toThrow("execution_observation.frame_outcome_unknown");
    return result;
  };
  f.source.manage({ receiver: undefined, callback, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const call = { receiver: undefined, callback, args: [] as [] };
  const prepared = await f.source.prepare(f.observation, call);
  expect(await f.source.invoke(prepared, call)).toBe(original);
  await f.source.flush();
  expect(writes).toBe(1);
  expect(f.source.completion(prepared)).toBe("unknown");
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
});

it("recognizes only the original declared read-only pair and refuses copied observation handles", async () => {
  const f = await observationFixture();
  const owner = { read: () => "known" };
  f.source.manage({ receiver: owner, callback: owner.read, contract: "no_direct_effects" });
  expect(f.source.isReadOnly({ receiver: owner, callback: owner.read })).toBe(true);
  expect(f.source.isReadOnly({ receiver: {}, callback: owner.read })).toBe(false);
  expect(f.source.isReadOnly({ receiver: owner, callback: owner.read, binding: {} })).toBe(false);
  expect(() => f.source.markFrameUnknown(Object.assign({}, f.observation))).toThrow("execution_observation.foreign_binding");
});
