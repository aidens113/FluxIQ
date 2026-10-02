// A build the loop's own cost count stopped says what it had spent and what its
// next call could have cost (t194-w47).
//
// `run-muqbzu32-8691a65e` (run 13): a chat build with a $0.10 ceiling made
// fifteen decisions costing $0.0738, the last of them carrying 72,677 input
// tokens. Before the sixteenth, the loop's count (`../../../llm/loop-budget.ts`)
// held one average decision back ($0.0049) and reserved the last request's
// worst case ($0.0314, all input uncached plus the 8,000-token reply allowance)
// against the $0.0213 that left, found no decision it could pay for, and ended
// the round. The purse never saw the call, so it refused nothing, the round's
// exhaustion carried no `costRefusal`, and the closing message said only "The
// build stopped at its spending limit of $0.10 before the Flow was finished."
// This drives the real loop through the real harness with run 13's figures.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../../llm/harness.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases } from "../index.ts";

/** Run 13's fifteen decisions: reported input tokens and what each cost (`steps/*-decide/meta.json`). */
const RUN_13 = [
  [16_251, 0.00480354], [19_376, 0.00234096], [20_139, 0.002540628], [20_326, 0.002115144], [20_497, 0.002175612],
  [20_732, 0.002633664], [21_099, 0.002652468], [20_806, 0.002505336], [21_114, 0.002521272], [27_833, 0.004447308],
  [30_702, 0.004008168], [31_025, 0.003504252], [41_355, 0.008942676], [58_368, 0.013486896], [72_677, 0.01508286]
] as const;
const SPENT = RUN_13.reduce((sum, [, cost]) => sum + cost, 0);
/** DeepSeek flash's peak rates, every input token a miss, plus the reply allowance: how the purse prices a request. */
const worstCase = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
const tokenLimits = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
const look: AutomationStudioLlmEvidenceTool = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } };
const INSTRUCTION = "Find every pair of wireless earbuds in the store under $50 with a rating of at least 4.";

/** A provider that prices each request as run 13's request at that position was priced, and reports what that decision cost. */
function run13Provider(): { provider: AutomationStudioLlmProvider; readonly asked: number } {
  let asked = 0;
  return {
    provider: {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      // Called once per request, before it is sent: `asked` is the request about to go out.
      estimateCostUsd: ({ outputTokens }) => worstCase(RUN_13[Math.min(asked, RUN_13.length - 1)]![0], outputTokens),
      runTask: async () => {
        const [inputTokens, costUsd] = RUN_13[asked]!;
        asked += 1;
        return {
          response: { kind: "evidence_tool_decision", summary: "Next.", decision: { kind: "tool_call", callId: `call.${asked}`, toolId: "inspect", input: { page: asked } } },
          usage: { inputTokens, outputTokens: 100, totalTokens: inputTokens + 100, estimatedCostUsd: costUsd }
        };
      }
    },
    get asked() { return asked; }
  };
}

describe("a build the loop's own cost count stopped (run 13)", () => {
  it("ends saying what it had spent and what its next call could have cost", async () => {
    const llm = run13Provider();
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
      // The real loop, each decision asked through the real harness. Completion
      // is kept out of reach, as run 13 never had a Flow to finish with, so the
      // cost count alone decides when it stops.
      round: async (request) => await runAutomationStudioLlmEvidenceLoop({
        tools: [look], maxIterations: request.maxIterations, maxToolCalls: 40, minToolCalls: 30, completionSchema: { type: "object" }, propagateDecisionErrors: true,
        budget: request.budget,
        executeTool: async ({ callId }) => ({ text: `${callId}: ${"x".repeat(300)}` }),
        decide: async ({ iteration, tools, evidence, decisionSchema, canComplete }) => {
          const decision = await runAutomationStudioLlmHarness({
            taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
            evidenceLoop: { iteration, tools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema: { type: "object" }, canComplete },
            provider: llm.provider, tokenLimits, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
          });
          if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error(`decision failed: ${decision.diagnostics.map((item) => item.code).join(",")}`);
          return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
        }
      }),
      test: async () => undefined,
      replayable: (steps) => steps.length > 0,
      checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
      budget: { maxCostUsd: 0.1, maxDurationMs: 540_000 },
      maxIterations: 40,
      keep: async () => undefined,
      now: () => 0
    });

    // Fifteen decisions sent, the sixteenth never asked for: the loop's count stopped it, not the purse.
    expect(llm.asked).toBe(15);
    if (outcome.kind !== "unfinished") throw new Error(`expected an unfinished build, got ${outcome.kind}`);
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(SPENT, 9);
    expect(outcome.progress.exhaustion).toMatchObject({ bound: "budget", budgetBound: "cost", iterations: 15 });
    // Run 13 said "The build stopped at its spending limit of $0.10 before the Flow was finished." and no figure.
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.10 before the Flow was finished: it had spent \$0\.074, and its next call could have cost \$0\.031 or more\. /u);
    // The figure is the last request's worst case, which the next, larger request costs at least at worst.
    expect(outcome.progress.exhaustion?.costRefusal).toMatchObject({ declinedBy: "loop_budget", spentUsd: SPENT, pendingUsd: 0, ceilingUsd: 0.1, maxOutputTokens: 8_000 });
    expect(outcome.progress.exhaustion?.costRefusal?.projectedCostUsd).toBeCloseTo(worstCase(72_677, 8_000), 9);
  });
});
