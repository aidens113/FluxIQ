import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { OriginalExecutionPromiseReceipts } from "../../../execution-observation/queue-completion/index.ts";
import { combineAutomationStudioLlmBuildPurseHolds } from "../combine-holds.ts";
import type { AutomationStudioLlmBuildPurseHold } from "../types.ts";
import { AutomationStudioLlmBuildPurse } from "../purse.ts";
import { prepareObservedExecutionCallback, invokeOwnedExecutionCallbackSync } from "../../../execution-observation/owned/index.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";

async function releaseFrame(action: (execution: ModelExecutionOptions) => void) {
  const f = await observationFixture();
  const execution: ModelExecutionOptions = {};
  const core = { run() { action(execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (!owned.observation) throw new Error("The original release frame is required.");
  Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(execution);
  return { ...f, owned };
}

it("retains the original settlement Promise before a delegate synchronously reenters", async () => {
  let calls = 0;
  let reentrant: Promise<void> | undefined;
  let combined!: AutomationStudioLlmBuildPurseHold;
  const delegate: AutomationStudioLlmBuildPurseHold = {
    settle() {},
    release() {},
    settleObserved() {
      calls++;
      reentrant = combined.settleObserved!();
      return Promise.resolve();
    }
  };
  combined = combineAutomationStudioLlmBuildPurseHolds([delegate]);
  const original = combined.settleObserved!();
  expect(reentrant).toBe(original);
  expect(calls).toBe(1);
  await original;
  expect(combined.settleObserved!()).toBe(original);
  expect(calls).toBe(1);
});

it("starts delegates in legacy order and drains every actual settlement before reporting both failures", async () => {
  const first = new Error("first settlement failed");
  const second = new Error("second settlement failed");
  const order: number[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const one: AutomationStudioLlmBuildPurseHold = { settle() {}, release() {}, settleObserved() {
    order.push(1);
    throw first;
  } };
  const two: AutomationStudioLlmBuildPurseHold = { settle() {}, release() {}, settleObserved() {
    order.push(2);
    return held.then(() => {
      order.push(3);
      throw second;
    });
  } };
  const combined = combineAutomationStudioLlmBuildPurseHolds([one, two]);
  const running = combined.settleObserved!();
  const outcome = running.then(() => undefined, error => error);
  expect(order).toEqual([1, 2]);
  release();
  const error: unknown = await outcome;
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError)) throw new Error("Expected both original settlement errors.");
  expect(error.errors).toEqual([first, second]);
  expect(error.cause).toBe(first);
  expect(order).toEqual([1, 2, 3]);
});

it("keeps unobserved structural fallback and release receiver/order unchanged", async () => {
  const order: string[] = [];
  const first = { settle() {
    expect(this).toBe(first);
    order.push("settle1");
  }, release() {
    expect(this).toBe(first);
    order.push("release1");
  } };
  const second = { settle() {
    expect(this).toBe(second);
    order.push("settle2");
  }, release() {
    expect(this).toBe(second);
    order.push("release2");
  } };
  const combined = combineAutomationStudioLlmBuildPurseHolds([first, second]);
  const running = combined.settleObserved!();
  expect(order).toEqual(["settle1", "settle2"]);
  await running;
  combined.release();
  expect(order).toEqual(["settle1", "settle2", "release1", "release2"]);
});

it("does not acknowledge an arbitrary structural settlement from its fulfilled Promise", async () => {
  const f = await observationFixture();
  let writes = 0;
  const supplied: AutomationStudioLlmBuildPurseHold = { settle() {}, release() {}, async settleObserved() { writes++; } };
  const execution = { observation: f.observation };
  const combined = combineAutomationStudioLlmBuildPurseHolds([supplied], execution);
  await expect(combined.settleObserved!(undefined, execution)).rejects.toThrow("settlement_callback_unverified");
  expect(writes).toBe(1);
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
  const second = combineAutomationStudioLlmBuildPurseHolds([supplied], execution);
  await expect(second.settleObserved!(undefined, execution)).rejects.toThrow("reservation_not_active");
  expect(writes).toBe(1);
});

it("accepts a supplied owner's one original Promise only after its actual held acknowledgment", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let committed = 0;
  const supplied: AutomationStudioLlmBuildPurseHold = {
    settle() {}, release() {},
    settleObserved(_usage, execution) {
      expect(this).toBe(supplied);
      expect(execution?.observation).not.toBe(f.observation);
      const observation = execution?.observation;
      if (!observation) throw new Error("The actual settlement child is required.");
      entered();
      const original = held.then(() => {
        committed++;
        receipts.issueObserved(original, observation, { disposition: "settled", completionDigest: "fixture.actual-commit", assessmentDigest: "fixture.original-prefix" });
      });
      return original;
    }
  };
  f.source.manage({ receiver: supplied, callback: supplied.settleObserved!, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const combined = combineAutomationStudioLlmBuildPurseHolds([supplied], { observation: f.observation });
  const running = combined.settleObserved!();
  await called;
  expect(committed).toBe(0);
  release();
  await running;
  expect(committed).toBe(1);
  expect(combined.settleObserved!()).toBe(running);
});

it("closes a genuine pre-send native hold release synchronously without spend or unverified coverage", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
  const f = await releaseFrame(execution => {
    const held = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 }, execution);
    if (!held.ok) throw new Error("The original pre-send hold must fit.");
    expect(purse.pendingUsd()).toBe(0.01);
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: held.hold, callback: held.hold.release, args: [] });
    expect(purse.pendingUsd()).toBe(0);
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: held.hold, callback: held.hold.release, args: [] });
  });
  await f.owned.invoke();
  await f.source.flush();
  expect(f.owned.completion()).toBe("settled");
  expect(purse.chargedReceipt()).toMatchObject({ calls: 0, chargedCostUsd: 0, pendingCalls: 0, pendingCostUsd: 0 });
});

it("keeps an unsupported structural release unknown and fences the next release callback", async () => {
  let first = 0;
  let second = 0;
  const supplied = { settle() {}, release() {
    expect(this).toBe(supplied);
    first++;
  } };
  const next = { settle() {}, release() { second++; } };
  const f = await releaseFrame(execution => {
    const combined = combineAutomationStudioLlmBuildPurseHolds([supplied, next], execution);
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: combined, callback: combined.release, args: [] });
  });
  await expect(f.owned.invoke()).rejects.toThrow("frame_outcome_unknown");
  await f.source.flush();
  expect(first).toBe(1);
  expect(second).toBe(0);
  expect(f.owned.completion()).toBe("unknown");
});
