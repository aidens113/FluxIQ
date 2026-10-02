// What an exhausted loop has to say for itself (`../exhaustion.ts`), read off
// the loop's state at the moment its allowance ran out. The loop-level endings
// are held by the loop's own tests; these pin the arithmetic behind each field.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceLoopExhaustion } from "../index.ts";

const step = (position: number, overrides: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep => ({
  position, iteration: position, actionId: "press", input: {}, effect: "mutate", disposition: "kept", ...overrides
});
// Kept and applied; kept and not applied; dropped; a look; and a look that proposes itself.
const draftSteps = [
  step(1, {}),
  step(2, { effectApplied: false }),
  step(3, { disposition: "dropped" }),
  step(4, { effect: "observe" }),
  step(5, { effect: "observe", proposes: true })
];
const refusal = { code: "llm_budget.run_cost_limit" as const, projectedCostUsd: 0.14, estimatedInputTokens: 475_714, maxOutputTokens: 8_000, spentUsd: 0.154, pendingUsd: 0, ceilingUsd: 0.25 };
const base = {
  maxIterations: 26, iterations: 26, draftSteps, completionAttempts: 2,
  unusableInARow: 0, lastIssueCodes: ["flow.unreachable_step"], lastRemaining: undefined, purseRefusal: undefined, outstandingIssueCodes: ["flow.unreachable_step"]
};

describe("the record an exhausted evidence loop ends with", () => {
  it("counts the draft, and of it only the kept steps a Flow could be proposed from", () => {
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "iterations" })).toEqual({
      bound: "iterations", maxIterations: 26, iterations: 26, draftSteps: 5, proposableSteps: 2, completionAttempts: 2,
      lastIssueCodes: [], outstandingIssueCodes: ["flow.unreachable_step"]
    });
  });

  it("carries the last refusal's issues only while the run of refusals is unbroken, as a copy", () => {
    const lastIssueCodes = ["flow.unreachable_step"];
    const record = automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "tool_calls", unusableInARow: 3, lastIssueCodes });
    expect(record.lastIssueCodes).toEqual(lastIssueCodes);
    expect(record.lastIssueCodes).not.toBe(lastIssueCodes);
    expect(record).not.toHaveProperty("budgetBound");
  });

  it("names the budget bound that ran out, and only for a budget ending", () => {
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "budget", lastRemaining: { limitedBy: "tokens" } })).toMatchObject({ bound: "budget", budgetBound: "tokens" });
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "budget" })).not.toHaveProperty("budgetBound");
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "iterations", lastRemaining: { limitedBy: "tokens" } })).not.toHaveProperty("budgetBound");
  });

  it("names cost, and carries a copy of the purse's refusal, when the purse is what refused the next decision", () => {
    const record = automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "budget", lastRemaining: { limitedBy: "tokens" }, purseRefusal: refusal });
    expect(record).toMatchObject({ budgetBound: "cost", costRefusal: refusal });
    expect(record.costRefusal).not.toBe(refusal);
  });

  it("carries the purse's standing as the cost figures only where the loop's count ran out of cost (t194-w47)", () => {
    const standing = { ...refusal, projectedCostUsd: 0.0314, spentUsd: 0.0738, ceilingUsd: 0.1, declinedBy: "loop_budget" as const };
    // Run 13: the count found no decision the cost budget could pay for, and the purse never saw one.
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "budget", lastRemaining: { limitedBy: "cost" }, purseRefusal: standing }))
      .toMatchObject({ budgetBound: "cost", costRefusal: standing });
    // Tokens or time ran out: the standing is no cost ending's figures, and the bound stays the one that ran out.
    const tokens = automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "budget", lastRemaining: { limitedBy: "tokens" }, purseRefusal: standing });
    expect(tokens).toMatchObject({ budgetBound: "tokens" });
    expect(tokens).not.toHaveProperty("costRefusal");
    expect(automationStudioLlmEvidenceLoopExhaustion({ ...base, bound: "iterations", lastRemaining: { limitedBy: "cost" }, purseRefusal: standing })).not.toHaveProperty("costRefusal");
  });
});
