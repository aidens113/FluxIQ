// A call made under the build's purse and the Flow's (t438): both hold it, and
// either refusing refuses it. The user's words (2026-10-01): "bring the ceiling
// down to $0.1 per flow max".
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPurseScope, automationStudioLlmFlowPurseScope } from "../index.ts";

const provider = (costUsd: number) => ({ estimateCostUsd: () => costUsd });
const hold = (costUsd: number) => automationStudioLlmBuildPurseHoldCall({ provider: provider(costUsd), estimatedInputTokens: 1000, maxOutputTokens: 100 });

describe("a call under the build's purse and the Flow's", () => {
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
  });

  it("is refused when the Flow's purse cannot pay, letting the build's hold go and ending the build on cost", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const held = await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(build, async () => hold(0.02)));
    expect(held).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { purse: "flow", spentUsd: 0.09, ceilingUsd: 0.1 } } });
    expect(build.pendingUsd()).toBe(0);
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
