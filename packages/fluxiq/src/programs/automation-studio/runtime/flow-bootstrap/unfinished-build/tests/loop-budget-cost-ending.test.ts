// A build's cost ends only where its purse refuses a call, and says so in the
// purse's figures (t234; t194-w47 before it).
//
// `run-muqbzu32-8691a65e` (run 13): a chat build with a $0.10 ceiling made
// fifteen decisions costing $0.0738, the last of them carrying 72,677 input
// tokens. Before the sixteenth, the loop's own count
// (`../../../llm/loop-budget.ts`) held one average decision back and ended the
// round with $0.026 unspent -- a second cost authority beside the purse, which
// never saw the call. Now the build's one purse, opened for the Flow's creation
// with what earlier builds of it spent, is handed to the loop, and the loop
// ends on cost only when that purse refuses: here the sixteenth call's hold
// ($0.0227, every input token uncached plus its 750-token reply reserve, t254;
// it was $0.0314 with the 8,000-token allowance) does not fit what is left, so the purse refuses it before it is
// sent, and the ending says what was spent, how much of it earlier builds of
// this Flow spent, and what the call could have cost at most.
// This drives the real loop through the real harness with run 13's figures.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../../llm/harness.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases } from "../index.ts";

/** Run 13's fifteen decisions: reported input tokens and what each cost (`steps/*-decide/meta.json`). */
const RUN_13 = [
  [16_251, 0.00480354], [19_376, 0.00234096], [20_139, 0.002540628], [20_326, 0.002115144], [20_497, 0.002175612],
  [20_732, 0.002633664], [21_099, 0.002652468], [20_806, 0.002505336], [21_114, 0.002521272], [27_833, 0.004447308],
  [30_702, 0.004008168], [31_025, 0.003504252], [41_355, 0.008942676], [58_368, 0.013486896], [72_677, 0.01508286]
] as const;
const SPENT = RUN_13.reduce((sum, [, cost]) => sum + cost, 0);
/** A Flow creation's ceiling, as configured (FLUXIQ_LLM_RUN_COST_CEILING_USD). */
const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
/**
 * What an earlier build of this Flow left of the ceiling for this one. Run 13's
 * fifteen decisions fit in it, and the sixteenth's worst case does not fit in
 * what they leave ($0.0212), as it did not fit run 13's $0.0262.
 */
const LEFT_BY_EARLIER_BUILD = 0.095;
const CARRIED = CEILING - LEFT_BY_EARLIER_BUILD;
/** A decision's reply as the purse holds it: its observed-maximum reserve, never a cap (t254). */
const DECISION_REPLY = AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.decisionReplyTokens;
/** DeepSeek flash's peak rates, every input token a miss, plus the reply reserve: how the purse prices a request. */
const worstCase = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
const usd = (amount: number) => `$${amount.toFixed(3)}`;
/** That `message` opens with `prefix`, shown as a diff when it does not. */
const opens = (message: string, prefix: string) => expect(message.slice(0, prefix.length)).toBe(prefix);
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

describe("a build whose purse refused its next call (run 13)", () => {
  // Run 13's decisions only fit a ceiling at least what the earlier build left.
  it.skipIf(CEILING < LEFT_BY_EARLIER_BUILD)("ends on the purse's refusal alone, saying what was spent, earlier builds' part, and what the refused call could have cost", async () => {
    const llm = run13Provider();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: CARRIED });
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
      // The real loop, each decision asked through the real harness under the
      // build's purse. Completion is kept out of reach, as run 13 never had a
      // Flow to finish with, so cost alone decides when it stops.
      round: async (request) => await runAutomationStudioLlmEvidenceLoop({
        tools: [look], maxIterations: request.maxIterations, maxToolCalls: 40, minToolCalls: 30, completionSchema: { type: "object" }, propagateDecisionErrors: true,
        budget: request.budget,
        ...(request.purse ? { purse: request.purse } : {}),
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
      budget: { maxCostUsd: CEILING, maxDurationMs: 540_000 },
      purse,
      maxIterations: 40,
      keep: async () => undefined,
      now: () => 0
    });

    // Fifteen decisions sent; the sixteenth was priced and refused by the purse, never sent.
    expect(llm.asked).toBe(15);
    if (outcome.kind !== "unfinished") throw new Error(`expected an unfinished build, got ${outcome.kind}`);
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(SPENT, 9);
    expect(purse.spentUsd()).toBeCloseTo(CARRIED + SPENT, 9);
    expect(outcome.progress.exhaustion).toMatchObject({ bound: "budget", budgetBound: "cost", iterations: 15 });
    // The refusal is the purse's own, creation-wide: no second authority declined anything.
    const refusal = outcome.progress.exhaustion?.costRefusal;
    expect(refusal).toMatchObject({ code: "llm_budget.run_cost_limit", pendingUsd: 0, ceilingUsd: CEILING, maxOutputTokens: DECISION_REPLY });
    expect(refusal).not.toHaveProperty("declinedBy");
    expect(refusal?.spentUsd).toBeCloseTo(CARRIED + SPENT, 9);
    expect(refusal?.projectedCostUsd).toBeCloseTo(worstCase(72_677, DECISION_REPLY), 9);
    // Run 13 said "The build stopped at its spending limit of $0.10 before the Flow was finished." and no figure.
    const carried = CARRIED > 0 ? ` (${usd(CARRIED)} of it by earlier builds of this Flow)` : "";
    opens(outcome.ending.message, `The build stopped at its spending limit of $${CEILING.toFixed(2)} before the Flow was finished: it had spent ${usd(CARRIED + SPENT)}${carried}, and its next call could have cost up to ${usd(worstCase(72_677, DECISION_REPLY))}. `);
  });
});
