import { expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPurseScope, automationStudioLlmFlowPurseScope } from "../index.ts";

const hold = (cost: number) => automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => cost }, estimatedInputTokens: 1_000, maxOutputTokens: 100 });

function carve(purse: AutomationStudioLlmBuildPurse, briefId: string, usd: number, role = "builder"): AutomationStudioLlmBuildPurse {
  const carved = purse.allowance({ briefId, role, usd });
  if (!carved.ok) throw new Error(`expected an allowance of ${usd} for ${briefId}`);
  return carved.allowance;
}

it("holds the build's chain and the Flow's purse, and says an allowance refused with the brief it serves", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // The build's purse is the allowance's whole, so nothing is left to top it up from (t627).
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.03 });
    const allowance = carve(build, "brief.cart", 0.03);
    const outcome = await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(allowance, async () => {
      const held = hold(0.02);
      expect([flow.pendingUsd(), build.pendingUsd(), allowance.pendingUsd()]).toEqual([0.02, 0.02, 0.02]);
      if (held?.ok) held.hold.settle({ estimatedCostUsd: 0.02 });
      return hold(0.02);
    }));
    expect(outcome).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { allowance: { briefId: "brief.cart", role: "builder" }, ceilingUsd: 0.03 } } });
    expect(outcome && !outcome.ok ? outcome.diagnostic.message : "").toMatch(/^The allowance for brief brief\.cart's spending limit of \$0\.0300/);
    expect([flow.pendingUsd(), build.pendingUsd(), allowance.pendingUsd()]).toEqual([0, 0, 0]);
  });
