import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { prepareObservedExecutionCallback } from "../../../execution-observation/owned/index.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";
import { AutomationStudioLlmBuildPurseJudgingReserve } from "../judging-reserve.ts";
import { AutomationStudioLlmBuildPurse } from "../purse.ts";

async function priceFrame<TResult>(action: (execution: ModelExecutionOptions) => TResult) {
  const f = await observationFixture();
  const execution: ModelExecutionOptions = {};
  const core = { run() { return action(execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (!owned.observation) throw new Error("The actual entered price frame is required.");
  Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(execution);
  return { ...f, owned, execution };
}

it("observes the retained original price receiver and two token arguments without changing reserve arithmetic", async () => {
  const reserve = new AutomationStudioLlmBuildPurseJudgingReserve();
  let calls = 0;
  const price = function (this: unknown, inputTokens: number, outputTokens: number): number {
    expect(this).toBe(reserve);
    expect([inputTokens, outputTokens]).toEqual([500, 200]);
    calls++;
    return 0.003;
  };
  ExecutionCallbackPolicies.remember(reserve, price, "pure");
  reserve.keepBack({ calls: 2, unpriced: { inputTokens: 500, outputTokens: 200 } });
  reserve.note({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 5, price });
  const f = await priceFrame(execution => reserve.holdUsd(execution));
  await expect(f.owned.invoke()).resolves.toBe(0.006);
  expect(f.owned.completion()).toBe("settled");
  expect(calls).toBe(1);
});

it("fences the actual purse frame after an unsupported supplied price returns a plausible value", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
  purse.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 500, outputTokens: 200 } });
  let calls = 0;
  const price = function (this: unknown): number {
    expect(this).toBeInstanceOf(AutomationStudioLlmBuildPurseJudgingReserve);
    calls++;
    return 0.001;
  };
  const f = await priceFrame(execution => purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 5, price }, execution));
  await expect(f.owned.invoke()).resolves.toMatchObject({ ok: true });
  await f.source.flush();
  expect(calls).toBe(1);
  expect(f.owned.completion()).toBe("unknown");
  let sends = 0;
  const next = { async send() { sends++; } };
  await expect(prepareObservedExecutionCallback(f.execution.observation, { receiver: next, callback: next.send, args: [] })).rejects.toThrow("reservation_not_active");
  expect(sends).toBe(0);
});

it("keeps legacy catch-as-unpriced while preserving an observed original price error", async () => {
  const reserve = new AutomationStudioLlmBuildPurseJudgingReserve();
  const error = new Error("the original reserve price failed");
  const price = (): number => { throw error; };
  ExecutionCallbackPolicies.remember(reserve, price, "pure");
  reserve.note({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 5, price });
  expect(reserve.priceUsd(500, 200)).toBeUndefined();
  const f = await priceFrame(execution => reserve.priceUsd(500, 200, execution));
  await expect(f.owned.invoke()).rejects.toBe(error);
});
