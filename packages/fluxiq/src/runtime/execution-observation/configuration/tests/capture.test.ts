import { expect, it } from "vitest";
import type { ExecutionCallbackCompletionConfiguration, ExecutionCallbackRegistrar } from "../index.ts";
import { captureExecutionCallbackCompletions } from "../index.ts";
import { observationFixture } from "../../tests/fixture.ts";

const registration = () => ({ receiver: undefined, callback: () => 7, contract: "no_direct_effects" as const });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function refused(configuration: ExecutionCallbackCompletionConfiguration): Error {
  try { captureExecutionCallbackCompletions(configuration); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    return error;
  }
  throw new Error("Expected configuration refusal");
}

it("captures immediately with the original private configure receiver and only a frozen manage port", () => {
  const records: object[] = [];
  class Configuration {
    #calls = 0;
    configure(registrar: ExecutionCallbackRegistrar): void {
      this.#calls += 1;
      expect(Object.keys(registrar)).toEqual(["manage"]);
      expect(Object.isFrozen(registrar)).toBe(true);
      registrar.manage(registration());
    }
    calls() { return this.#calls; }
  }
  const configuration = new Configuration();
  const policy = captureExecutionCallbackCompletions(configuration);
  expect(configuration.calls()).toBe(1);
  expect(records).toEqual([]);
  configuration.configure = () => { throw new Error("replacement configure invoked"); };
  const target = { manage(value: object) {
    expect(this).toBe(target);
    records.push(value);
  } };
  policy.apply(target);
  expect(configuration.calls()).toBe(1);
  expect(records).toHaveLength(1);
  expect(Object.isFrozen(policy)).toBe(true);
  expect(Object.isFrozen(records[0])).toBe(true);
});

it("snapshots callback, receiver, binding, contract and source array before later mutation", async () => {
  const f = await observationFixture();
  const receiver = { read: () => 7 };
  const callback = receiver.read;
  const binding = Object.freeze({});
  const declaration = { receiver, callback, binding, contract: "no_direct_effects" as const };
  const declarations = [declaration];
  const policy = captureExecutionCallbackCompletions({ configure(registrar) {
    for (const value of declarations) registrar.manage(value);
  } });
  declaration.receiver = { read: () => 8 };
  declaration.callback = () => 9;
  declaration.binding = Object.freeze({});
  Reflect.set(declaration, "contract", "managed_direct_effects");
  declarations.splice(0);
  declarations.push(declaration);
  policy.apply(f.source);
  expect(f.source.isManaged({ receiver, callback, binding })).toBe(true);
  expect(f.source.isManaged(declaration)).toBe(false);
  const invocation = await f.source.prepare(f.observation, { receiver, callback, binding });
  expect(await f.source.invoke(invocation, { receiver, callback, binding, args: [] })).toBe(7);
  expect(f.source.completion(invocation)).toBe("settled");
});

it("matches exact original callback pairs and bindings rather than a copied name or owner", async () => {
  const f = await observationFixture();
  const receiver = {};
  const binding = Object.freeze({});
  const callback = function read() { return 4; };
  const counterfeit = function read() { return 4; };
  captureExecutionCallbackCompletions({ configure(registrar) {
    registrar.manage({ receiver, callback, binding, contract: "no_direct_effects" });
  } }).apply(f.source);
  expect(callback.name).toBe(counterfeit.name);
  expect(f.source.isManaged({ receiver, callback, binding })).toBe(true);
  expect(f.source.isManaged({ receiver, callback: counterfeit, binding })).toBe(false);
  expect(f.source.isManaged({ receiver: { ...receiver }, callback, binding })).toBe(false);
  expect(f.source.isManaged({ receiver, callback, binding: { ...binding } })).toBe(false);
});

it("closes a retained registrar after capture without changing its immutable policy", () => {
  let retained: ExecutionCallbackRegistrar | undefined;
  const value = registration();
  const policy = captureExecutionCallbackCompletions({ configure(registrar) {
    retained = registrar;
    registrar.manage(value);
  } });
  expect(() => retained!.manage(registration())).toThrow("configuration_closed");
  const received: object[] = [];
  policy.apply({ manage: declaration => { received.push(declaration); } });
  expect(received).toEqual([value]);
});

it("closes partial capture and preserves the original synchronous configure error", async () => {
  const f = await observationFixture();
  const failure = new Error("original configuration failed");
  const value = registration();
  let retained: ExecutionCallbackRegistrar | undefined;
  expect(() => captureExecutionCallbackCompletions({ configure(registrar) {
    retained = registrar;
    registrar.manage(value);
    throw failure;
  } })).toThrow(failure);
  expect(f.source.isManaged(value)).toBe(false);
  expect(() => retained!.manage(value)).toThrow("configuration_closed");
});

it("applies one immutable snapshot to separate registries and leaves duplicate refusal to Source", async () => {
  const first = await observationFixture();
  const second = await observationFixture();
  const value = registration();
  const policy = captureExecutionCallbackCompletions({ configure: registrar => registrar.manage(value) });
  policy.apply(first.source);
  policy.apply(second.source);
  expect(first.source.isManaged(value)).toBe(true);
  expect(second.source.isManaged(value)).toBe(true);
  expect(() => policy.apply(first.source)).toThrow("contract_already_bound");
});

it("preserves a target registrar's original failure and stops forwarding declarations", () => {
  const policy = captureExecutionCallbackCompletions({ configure(registrar) {
    registrar.manage(registration());
    registrar.manage(registration());
  } });
  const failure = new Error("actual registry refused declaration");
  let calls = 0;
  const target = { manage() {
    calls += 1;
    throw failure;
  } };
  expect(() => policy.apply(target)).toThrow(failure);
  expect(calls).toBe(1);
});

it("refuses async configuration and rejects its later declarations without detached failure", async () => {
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  const failure = refused({ async configure(registrar) {
    registrar.manage(registration());
    await held;
    registrar.manage(registration());
  } });
  expect(failure.message).toContain("configuration_must_be_synchronous");
  Object.freeze(failure);
  release();
  await tick();
  expect(failure.cause).toBeInstanceOf(Error);
  expect(failure.cause).toHaveProperty("message", "execution_observation.configuration_closed");
});

it("retains an original rejected async configuration error on the reported refusal", async () => {
  const original = new Error("actual asynchronous configuration rejection");
  const failure = refused({ configure: () => Promise.reject(original) });
  Object.freeze(failure);
  await tick();
  expect(failure.cause).toBe(original);
});

it("refuses a fulfilled async configuration even when its declarations precede its promise", async () => {
  let retained: ExecutionCallbackRegistrar | undefined;
  const failure = refused({ async configure(registrar) {
    retained = registrar;
    registrar.manage(registration());
  } });
  expect(failure.message).toContain("configuration_must_be_synchronous");
  await tick();
  expect(() => retained!.manage(registration())).toThrow("configuration_closed");
});

it("refuses a non-void synchronous configuration result", () => {
  expect(refused({ configure: () => 1 }).message).toContain("configuration_must_be_synchronous");
});

it("leaves an unrelated callback unsupported when no declaration was captured", async () => {
  const f = await observationFixture();
  captureExecutionCallbackCompletions({ configure() {} }).apply(f.source);
  const result = Object.freeze({ status: "succeeded", complete: true });
  const callback = () => result;
  expect(f.source.isManaged({ receiver: undefined, callback })).toBe(false);
  const invocation = await f.source.prepare(f.observation, { receiver: undefined, callback });
  expect(await f.source.invoke(invocation, { receiver: undefined, callback, args: [] })).toBe(result);
  expect(f.source.completion(invocation)).toBe("unverified");
});
