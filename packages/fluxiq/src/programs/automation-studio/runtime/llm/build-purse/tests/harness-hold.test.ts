// A call made under the build's purse and the Flow's (t438): both hold it, and
// either refusing refuses it. The user's words (2026-10-01): "bring the ceiling
// down to $0.1 per flow max".
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPurseScope, automationStudioLlmFlowPurseScope } from "../index.ts";

const provider = (costUsd: number) => ({ estimateCostUsd: () => costUsd });
const hold = (costUsd: number) => automationStudioLlmBuildPurseHoldCall({ provider: provider(costUsd), estimatedInputTokens: 1000, maxOutputTokens: 100 });

describe("a call under the build's purse and the Flow's", () => {
  it("counts a nested allowance's call once in its owning root's charged receipt", async () => {
    const root = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const carved = root.allowance({ briefId: "brief.synthetic", role: "builder", usd: 0.05 });
    expect(carved.ok).toBe(true);
    if (!carved.ok) throw new Error("The synthetic allowance was not available.");
    await automationStudioLlmFlowPurseScope(root, async () => await automationStudioLlmBuildPurseScope(carved.allowance, async () => {
      const held = hold(0.02);
      expect(held?.ok).toBe(true);
      if (held?.ok) held.hold.settle();
    }));
    expect(root.chargedReceipt()).toEqual({ calls: 1, chargedCostUsd: 0.02, pendingCalls: 0, pendingCostUsd: 0, unreportedZeroChargeCalls: 0 });
    expect(carved.allowance.chargedReceipt()).toEqual(root.chargedReceipt());
  });
  it("is held and charged on both", async () => {
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, onSettled: (usd) => charged.push(usd) });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(build, async () => {
      const held = hold(0.02);
      expect(held?.ok).toBe(true);
      expect(flow.pendingUsd()).toBe(0.02);
      expect(build.pendingUsd()).toBe(0.02);
      if (held?.ok) held.hold.settle({ estimatedCostUsd: 0.015 });
    }));
    expect(flow.spentUsd()).toBe(0.015);
    expect(build.spentUsd()).toBe(0.015);
    expect(charged).toEqual([0.015]);
    expect(build.chargedReceipt()).toEqual({ calls: 1, chargedCostUsd: 0.015, pendingCalls: 0, pendingCostUsd: 0, unreportedZeroChargeCalls: 0 });
    expect(flow.chargedReceipt()).toEqual(build.chargedReceipt());
  });

  it("is refused when the Flow's purse cannot pay, letting the build's hold go and ending the build on cost", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const held = await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(build, async () => hold(0.02)));
    expect(held).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { purse: "flow", spentUsd: 0.09, ceilingUsd: 0.1 } } });
    expect(build.pendingUsd()).toBe(0);
    expect(build.chargedReceipt()).toEqual({ calls: 0, chargedCostUsd: 0, pendingCalls: 0, pendingCostUsd: 0, unreportedZeroChargeCalls: 0 });
    expect(build.refusal).toMatchObject({ code: "llm_budget.run_cost_limit", ceilingUsd: 0.1 });
  });

  it("is held on the Flow's purse alone when no build is running: a check, a recovery", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const held = await automationStudioLlmFlowPurseScope(flow, async () => hold(0.04));
    expect(held?.ok).toBe(true);
    expect(flow.pendingUsd()).toBe(0.04);
    expect(hold(0.04)).toBeUndefined();
  });
});
