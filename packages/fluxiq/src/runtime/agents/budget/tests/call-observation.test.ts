import { expect, it, vi } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { prepareObservedExecutionCallback, invokeOwnedExecutionCallbackSync } from "../../../execution-observation/owned/index.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";
import { automationStudioLlmBuildPurseHoldCall, AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../index.ts";

async function callFrame<TResult>(f: Awaited<ReturnType<typeof observationFixture>>, action: (execution: ModelExecutionOptions) => TResult) {
  const execution: ModelExecutionOptions = {};
  const core = { run() { return action(execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (!owned.observation) throw new Error("The original entered call frame is required.");
  Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(execution);
  return { owned, execution };
}

it("observes the original supplied refusal formatter at its undefined receiver without sending a call", async () => {
  const f = await observationFixture();
  const execution: ModelExecutionOptions = {};
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
  const provider = { estimateCostUsd() { return 0.02; } };
  ExecutionCallbackPolicies.remember(provider, provider.estimateCostUsd, "pure");
  let formats = 0;
  const core = { run() { return automationStudioLlmFlowPurseScope(purse, async () => automationStudioLlmBuildPurseHoldCall({
    provider, estimatedInputTokens: 10, maxOutputTokens: 5,
    diagnostic: function (this: unknown, refusal, scope) {
      expect(this).toBeUndefined();
      expect(scope).toBe("owner");
      formats++;
      return { severity: "error", code: refusal.code, message: "original supplied formatter" };
    }
  }, execution)); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (!owned.observation) throw new Error("The original entered call frame is required.");
  Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(execution);
  await expect(owned.invoke()).resolves.toMatchObject({ ok: false, diagnostic: { message: "original supplied formatter" } });
  await f.source.flush();
  expect(formats).toBe(1);
  expect(owned.completion()).toBe("unknown");
  expect(purse.spentCalls()).toBe(0);
  expect(purse.pendingUsd()).toBe(0);
});

it("uses a distinct current price frame and later unobserved allowance without reviving the prior child", async () => {
  const [first, second] = await Promise.all([observationFixture(), observationFixture()]);
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
  purse.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 500, outputTokens: 200 } });
  const provider = { estimateCostUsd() {
    expect(this).toBe(provider);
    return 0.001;
  } };
  const original = provider.estimateCostUsd;
  first.source.manage({ receiver: provider, callback: original, contract: "no_direct_effects" });
  second.source.manage({ receiver: provider, callback: original, contract: "no_direct_effects" });
  const one = await callFrame(first, execution => automationStudioLlmFlowPurseScope(purse, async () => {
    const held = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens: 100, maxOutputTokens: 20 }, execution);
    if (!held?.ok || !held.hold.settleObserved) throw new Error("The original priced call must be held.");
    await held.hold.settleObserved({ estimatedCostUsd: 0.0005 }, execution);
  }));
  await one.owned.invoke();
  expect(one.owned.completion()).toBe("settled");
  const before = vi.spyOn(first.source, "invokeSync");
  const current = vi.spyOn(second.source, "invokeSync");
  try {
    const two = await callFrame(second, execution => purse.judgingHoldUsd(execution));
    await expect(two.owned.invoke()).resolves.toBe(0.002);
    expect(two.owned.completion()).toBe("settled");
    expect(before).not.toHaveBeenCalled();
    expect(current.mock.calls.some(([observation, call]) => observation === two.execution.observation && call.receiver === provider && call.callback === original)).toBe(true);
    before.mockClear();
    current.mockClear();
    let replacements = 0;
    provider.estimateCostUsd = () => {
      replacements++;
      return 0.01;
    };
    expect(purse.allocatableUsd()).toBeCloseTo(0.0975, 12);
    expect(purse.allowance({ briefId: "brief.later", role: "builder", usd: 0.02 }).ok).toBe(true);
    expect(purse.allocatableUsd()).toBeCloseTo(0.0775, 12);
    expect(replacements).toBe(0);
    expect(before).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
  } finally {
    before.mockRestore();
    current.mockRestore();
  }
});

it("rejects copied and terminal-unknown current price observations before another estimator call", async () => {
  const first = await observationFixture();
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
  purse.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 500, outputTokens: 200 } });
  let prices = 0;
  const provider = { estimateCostUsd() {
    prices++;
    return 0.001;
  } };
  first.source.manage({ receiver: provider, callback: provider.estimateCostUsd, contract: "no_direct_effects" });
  const one = await callFrame(first, execution => automationStudioLlmFlowPurseScope(purse, async () => {
    const held = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens: 100, maxOutputTokens: 20 }, execution);
    if (!held?.ok) throw new Error("The original priced call must fit.");
    held.hold.release();
  }));
  await one.owned.invoke();
  const count = prices;
  const copied = { ...one.execution.observation! };
  expect(() => purse.judgingHoldUsd({ observation: copied })).toThrow("foreign_binding");
  expect(prices).toBe(count);
  const second = await observationFixture();
  let unknown = 0;
  const two = await callFrame(second, execution => {
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: undefined, callback: () => { unknown++; }, args: [] });
    return purse.judgingHoldUsd(execution);
  });
  await expect(two.owned.invoke()).rejects.toThrow("frame_outcome_unknown");
  await second.source.flush();
  expect(unknown).toBe(1);
  expect(prices).toBe(count);
  expect(two.owned.completion()).toBe("unknown");
});

it("preserves dynamic provider pricing for an ordinary unobserved native quote", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
  purse.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 500, outputTokens: 200 } });
  const provider = { estimateCostUsd() { return 0.001; } };
  await automationStudioLlmFlowPurseScope(purse, async () => {
    const held = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens: 100, maxOutputTokens: 20 });
    if (!held?.ok) throw new Error("The ordinary priced call must fit.");
    held.hold.release();
  });
  provider.estimateCostUsd = function () {
    expect(this).toBe(provider);
    return 0.002;
  };
  expect(purse.judgingHoldUsd()).toBe(0.004);
  expect(purse.allocatableUsd()).toBeCloseTo(0.096, 12);
});
