import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmUsageSummary } from "../../harness.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceTool } from "../../evidence-loop.ts";

// `run-mup2u8o3-6697c4be`, cause 4: a build's ninth decision was sent with
// $0.154 of its $0.25 spent, re-read 475,714 of its 477,506 input tokens
// uncached, and cost $0.1429. The loop counted decisions at the average of the
// cache-discounted ones before; nothing priced the request about to be sent.
// These drive the loop through the real harness, as a build does.

/** DeepSeek flash's peak rates: every input token a cache miss, and the reply allowance. */
const priceUsd = ({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
const tokenLimits = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
const look: AutomationStudioLlmEvidenceTool = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } };
const completionSchema = { type: "object" };

/** A priced provider that answers each decision in turn and reports what it was told to. */
function provider(answers: Array<{ decision: Record<string, unknown>; costUsd: number }>): { provider: AutomationStudioLlmProvider; readonly asked: number; readonly sentTokens: number[] } {
  let asked = 0;
  const sentTokens: number[] = [];
  return {
    provider: {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: priceUsd,
      runTask: async (request) => {
        const answer = answers[asked]!;
        asked += 1;
        sentTokens.push(request.estimatedInputTokens);
        const usage: AutomationStudioLlmUsageSummary = { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: answer.costUsd };
        return { response: { kind: "evidence_tool_decision", summary: "Next.", decision: answer.decision }, usage };
      }
    },
    get asked() { return asked; },
    get sentTokens() { return sentTokens; }
  };
}

/** The loop as a build runs it: each decision asked through the harness, a failed one thrown. The first look is small; each after it returns `pageBytes`. */
function build(llm: AutomationStudioLlmProvider, pageBytes: number) {
  return runAutomationStudioLlmEvidenceLoop({
    tools: [look], maxIterations: 20, maxToolCalls: 21, completionSchema, propagateDecisionErrors: true,
    budget: { maxCostUsd: 0.25 },
    executeTool: async ({ callId }) => ({ text: "x".repeat(callId.startsWith("initial.") ? 3_000 : pageBytes) }),
    decide: async ({ iteration, tools, evidence, decisionSchema, canComplete }) => {
      const decision = await runAutomationStudioLlmHarness({
        taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
        evidenceLoop: { iteration, tools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema, canComplete },
        provider: llm, tokenLimits, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
      });
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error(`decision failed: ${decision.diagnostics.map((item) => item.code).join(",")}`);
      return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
    }
  });
}

describe("a build's cost ceiling, held before each decision is sent", () => {
  it("does not send a decision whose worst case would cross the ceiling, and ends on the cost budget saying what it would have cost", async () => {
    // The first decision is small (about $0.01 at worst, its reply allowance
    // mostly) and reports $0.01. The look it asks for returns 2.4 MB, so the
    // second carries about 800k tokens: $0.25 at worst on its own. The loop's
    // count, at the average of what was spent, still says twenty decisions
    // are left.
    const llm = provider([
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 2 } }, costUsd: 0.01 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.01 }
    ]);

    const result = await build(llm.provider, 2_400_000);

    // Sent once. Before the purse, the second decision went out too.
    expect(llm.asked).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("llm_evidence_loop.iteration_limit");
    expect(result.exhaustion).toMatchObject({ bound: "budget", budgetBound: "cost", iterations: 1 });
    const refusal = result.exhaustion!.costRefusal!;
    expect(refusal).toMatchObject({ code: "llm_budget.run_cost_limit", spentUsd: 0.01, pendingUsd: 0, ceilingUsd: 0.25, maxOutputTokens: 8_000 });
    // Priced from the request the harness measured, at the uncached rate.
    expect(refusal.estimatedInputTokens).toBeGreaterThan(2_400_000 / 3);
    expect(refusal.projectedCostUsd).toBeCloseTo(priceUsd({ inputTokens: refusal.estimatedInputTokens, outputTokens: 8_000 }), 9);
    expect(refusal.spentUsd + refusal.projectedCostUsd!).toBeGreaterThan(0.25);
    // What the build spent never passes its ceiling, and nothing overspent its hold.
    expect(result.accounting.estimatedCostUsd).toBeCloseTo(0.01, 9);
    expect(result.accounting.budgetBreaches).toBeUndefined();
  });

  it("sends a decision whose worst case fits, however large, and spends exactly what was reported", async () => {
    const llm = provider([
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 2 } }, costUsd: 0.001 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.001 }
    ]);

    const result = await build(llm.provider, 600_000);

    expect(llm.asked).toBe(2);
    expect(result).toMatchObject({ ok: true, accounting: { estimatedCostUsd: 0.002 } });
    expect(llm.sentTokens[1]!).toBeGreaterThan(600_000 / 3);
  });

  it("counts a decision that reported costing more than its worst case as a breach", async () => {
    const llm = provider([{ decision: { kind: "complete", result: {} }, costUsd: 0.2 }]);

    const result = await build(llm.provider, 3_000);

    expect(llm.asked).toBe(1);
    expect(result).toMatchObject({ ok: true, accounting: { estimatedCostUsd: 0.2, budgetBreaches: 1 } });
  });
});
