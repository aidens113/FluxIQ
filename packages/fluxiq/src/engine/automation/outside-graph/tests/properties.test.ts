import { expect, it } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import { automationStudioDispatchWithNodeRetries } from "../index.ts";
import { automationObservationFixture } from "../../execution-admission/tests/fixture.ts";
import { createExecutionAdmissionAuthority } from "../../../../runtime/execution-admission/index.ts";

it.each(["own", "inherited"] as const)("refuses a %s retry reader getter installed by its dispatch", async placement => {
  const f = await automationObservationFixture();
  let reads = 0;
  let calls = 0;
  const owner = {};
  const input = { node: { id: "one", definitionId: "example.read" }, dispatch: async () => {
    calls++;
    Object.defineProperty(placement === "own" ? input : owner, "read", { configurable: true, get() {
      reads++;
      return () => ({ ok: true as const });
    } });
    return "answer";
  }, read: (_value: string) => ({ ok: true as const }) };
  if (placement === "inherited") {
    delete (input as Partial<typeof input>).read;
    Object.setPrototypeOf(input, owner);
  }
  f.engine.manage({ receiver: undefined, callback: input.dispatch, contract: "no_direct_effects" });
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow("callback_accessor_unsupported");
  expect(reads).toBe(0);
  expect(calls).toBe(1);
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow();
  expect(calls).toBe(1);
  const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
  const scope = await reopened.openScope(f.scopes.issue());
  expect((await reopened.consumer.inspect(scope)).state).toBe("pending");
});

it.each(["now", "delay", "dispatch"] as const)("refuses an initial retry %s getter before any delegate runs", async key => {
  const f = await automationObservationFixture();
  let reads = 0;
  let calls = 0;
  const input = { node: { id: "one", definitionId: "example.read" }, dispatch: async () => {
    calls++;
    return "answer";
  }, read: (_value: string) => ({ ok: true as const }) };
  Object.defineProperty(input, key, { get() {
    reads++;
    return () => {
      calls++;
      return 10;
    };
  } });
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow();
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("guards the fresh dispatch a real stale-target reacquire returns", async () => {
  const f = await automationObservationFixture();
  let reads = 0;
  let calls = 0;
  const failure: AutomationStudioFailureRecord = { category: "target_not_found", code: "target.stale", retryable: true, stage: "target_resolution", effect: "unacted" };
  type Answer = { ok: true } | { ok: false; failure: AutomationStudioFailureRecord };
  const found = { outcome: "found" as const, get dispatch() {
    reads++;
    return async (): Promise<Answer> => {
      calls++;
      return { ok: true };
    };
  } };
  const input = { node: { id: "one", definitionId: "example.read" }, dispatch: async (): Promise<Answer> => ({ ok: false, failure }), read: (value: Answer) => value, delay: async () => undefined, reacquire: async () => found };
  f.engine.manage({ receiver: undefined, callback: input.dispatch, contract: "no_direct_effects" });
  f.engine.manage({ receiver: undefined, callback: input.delay, contract: "no_direct_effects" });
  f.engine.manage({ receiver: undefined, callback: input.reacquire, contract: "no_direct_effects" });
  f.engine.manage({ receiver: input, callback: input.read, contract: "no_direct_effects" });
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow("callback_accessor_unsupported");
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("retains unobserved retry getter timing and original read receiver", async () => {
  let reads = 0;
  const input = { node: { id: "one", definitionId: "example.read" }, dispatch: async () => 7, get read() {
    reads++;
    return function(this: unknown, value: number) {
      expect(this).toBe(input);
      expect(value).toBe(7);
      return { ok: true as const };
    };
  } };
  expect((await automationStudioDispatchWithNodeRetries(input)).attempts).toBe(1);
  expect(reads).toBe(1);
});

it.each(["getter", "data"] as const)("refuses a native %s replacement between retry callback phases", async kind => {
  const f = await automationObservationFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
  let reads = 0;
  let calls = 0;
  const failure: AutomationStudioFailureRecord = { category: "target_not_found", code: "target.wait", retryable: true, stage: "target_resolution", effect: "unacted" };
  const replacement = () => {
    calls++;
    return 10;
  };
  const input = { node: { id: "one", definitionId: "example.read" }, dispatch: async () => {
    Object.defineProperty(Date, "now", kind === "getter" ? { configurable: true, get() {
      reads++;
      return replacement;
    } } : { configurable: true, value: replacement });
    return { ok: false as const, failure };
  }, read: (value: { ok: false; failure: AutomationStudioFailureRecord }) => value };
  f.engine.manage({ receiver: undefined, callback: input.dispatch, contract: "no_direct_effects" });
  f.engine.manage({ receiver: input, callback: input.read, contract: "no_direct_effects" });
  let caught: unknown;
  try { await automationStudioDispatchWithNodeRetries(input, f.observation); }
  catch (error) { caught = error; }
  finally { Object.defineProperty(Date, "now", descriptor); }
  expect(caught).toBeInstanceOf(Error);
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
