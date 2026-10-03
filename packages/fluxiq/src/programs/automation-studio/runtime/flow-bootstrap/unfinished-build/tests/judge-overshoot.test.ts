// What a build records is what its purse charged, the judge's calls included
// (t254 stage 2, decision 3). A judge call whose reply costs more than it was
// held at is a breach on the purse; the judge's spend arrives as a verdict, so
// its overshoot used to reach the purse and not the build's accounting.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases } from "../index.ts";

function step(position: number): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ranWith: { target: `t${position}` }, replay: { from: { at: "start" } } };
}

describe("a judge reply that cost more than its hold (t254 stage 2)", () => {
  it("reaches the build's accounting: its spend and overshoot equal what the purse charged", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
      round: async () => {
        // One decision held at $0.008 that cost $0.010: the round's own breach, which its loop accounts (`../../../llm/evidence-loop/cost-purse.ts`).
        const held = purse.hold({ projectedCostUsd: 0.008, estimatedInputTokens: 1, maxOutputTokens: 1 });
        if (held.ok) held.hold.settle({ estimatedCostUsd: 0.01 });
        return { ok: true, result: { summary: "Clicks." }, trace: [], steps: [step(1)], accounting: { iterations: 1, toolCalls: 1, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0.01, budgetBreaches: 1, budgetOvershootUsd: 0.002 } };
      },
      judge: async ({ loop }) => {
        // Two judge calls: the first within its hold, the second held at $0.002 and billed $0.005.
        const first = purse.hold({ projectedCostUsd: 0.003, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
        if (first.ok) first.hold.settle({ estimatedCostUsd: 0.001 });
        const second = purse.hold({ projectedCostUsd: 0.002, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
        if (second.ok) second.hold.settle({ estimatedCostUsd: 0.005 });
        return { verdict: "yes", spent: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.006 }, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) };
      },
      test: async () => undefined,
      replayable: () => true,
      checklist: () => undefined,
      budget: { maxCostUsd: 0.1 },
      purse,
      maxIterations: 8,
      keep: async () => undefined,
      now: () => 0
    });

    expect(outcome.kind).toBe("finished");
    expect(purse.breaches).toBe(2);
    expect(purse.overshootUsd).toBeCloseTo(0.005, 12);
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(purse.spentUsd(), 12);
    expect(outcome.accounting.budgetBreaches).toBe(purse.breaches);
    expect(outcome.accounting.budgetOvershootUsd).toBeCloseTo(purse.overshootUsd, 12);
  });

  it("adds no breach when every judge call kept within its hold", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
      round: async () => ({ ok: true, result: { summary: "Clicks." }, trace: [], steps: [step(1)], accounting: { iterations: 1, toolCalls: 1, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } }),
      judge: async ({ loop }) => {
        const held = purse.hold({ projectedCostUsd: 0.003, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
        if (held.ok) held.hold.settle({ estimatedCostUsd: 0.002 });
        return { verdict: "yes", spent: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.002 }, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) };
      },
      test: async () => undefined,
      replayable: () => true,
      checklist: () => undefined,
      budget: { maxCostUsd: 0.1 },
      purse,
      maxIterations: 8,
      keep: async () => undefined,
      now: () => 0
    });

    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(purse.spentUsd(), 12);
    expect(outcome.accounting.budgetBreaches).toBeUndefined();
    expect(outcome.accounting.budgetOvershootUsd).toBeUndefined();
  });
});
