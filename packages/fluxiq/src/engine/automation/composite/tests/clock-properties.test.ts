import { expect, it } from "vitest";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { automationStudioCallAcrossBoundary } from "../boundary.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../index.ts";

const trace: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: 1, finishedAt: 1, attempts: [], values: {}, effects: [] };

it.each(["own", "inherited"] as const)("refuses a %s composite clock accessor in the actual parent frame", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    const owner = placement === "own" ? options : {};
    if (placement === "inherited") Object.setPrototypeOf(options, owner);
    Object.defineProperty(owner, "now", { get() {
      reads++;
      return () => 1;
    } });
    await expect(automationStudioCallAcrossBoundary({ contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {}, parentOptions: options, maxAttempts: 1, frame: () => undefined, runChild: async () => {
      calls++;
      return trace;
    }, executedTrace: value => value, failedMessage: "child failed" })).rejects.toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  await f.pending();
});

it("rechecks a native clock while a bounded child waits for cancellation", async () => {
  const f = await enteredAutomationFrameFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
  let calls = 0;
  await f.run(async options => {
    const controller = new AbortController();
    options.signal = controller.signal;
    let failure: unknown;
    try {
      await automationStudioCallAcrossBoundary({ contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {}, parentOptions: options, maxAttempts: 1, frame: () => undefined, runChild: async () => {
        Object.defineProperty(Date, "now", { configurable: true, value: () => {
          calls++;
          return 999;
        } });
        controller.abort();
        return await new Promise<AutomationStudioGraphExecutionTrace>(() => undefined);
      }, executedTrace: value => value, failedMessage: "child failed" });
    } catch (error) { failure = error; }
    finally { Object.defineProperty(Date, "now", descriptor); }
    expect(failure).toBeInstanceOf(Error);
  });
  expect(calls).toBe(0);
  await f.pending();
});

it("checks a captured command port's stop method after the child begins waiting", async () => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    const controller = new AbortController();
    const command = {
      signal: controller.signal, acceptsComposite: () => true,
      own: <T>(start: () => Promise<T>) => start(), checkpoint: async () => undefined,
      context: async () => { throw new Error("Unused command context."); }, consume: async () => undefined,
      stop: async (_reason: string) => undefined, receipted: () => false, withdraw: () => false
    };
    options.commandRun = command;
    options.signal = controller.signal;
    await expect(automationStudioCallAcrossBoundary({ contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {}, parentOptions: options, maxAttempts: 1, frame: () => undefined, runChild: async () => {
      Object.defineProperty(command, "stop", { get() {
        reads++;
        return async () => { calls++; };
      } });
      controller.abort();
      return await new Promise<AutomationStudioGraphExecutionTrace>(() => undefined);
    }, executedTrace: value => value, failedMessage: "child failed" })).rejects.toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  await f.pending();
});
