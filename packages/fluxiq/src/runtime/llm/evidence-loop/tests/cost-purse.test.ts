import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmUsageSummary } from "../../harness.ts";
import { runAutomationStudioLlmEvidenceLoop, AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID, type AutomationStudioLlmEvidenceLoopBudget, type AutomationStudioLlmEvidenceTool } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, AutomationStudioLlmBuildPurse, automationStudioLlmCurrentBuildPurse } from "../../build-purse/index.ts";

/** What a decision's reply is held at: its observed-maximum reserve, never a cap (user, 2026-10-03, t254). */
const DECISION_REPLY = AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.decisionReplyTokens;

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
    // The first decision is small (about $0.002 at worst, its 750-token reply
    // reserve mostly, t254) and reports $0.001. The look it asks for returns
    // 2.6 MB, so the second carries about 870k tokens: $0.26 at worst on its
    // own. The loop's count, at the average of what was spent, still says
    // twenty decisions are left.
    const llm = provider([
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 2 } }, costUsd: 0.001 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.001 }
    ]);

    const result = await build(llm.provider, 2_600_000);

    // Sent once. Before the purse, the second decision went out too.
    expect(llm.asked).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("llm_evidence_loop.iteration_limit");
    expect(result.exhaustion).toMatchObject({ bound: "budget", budgetBound: "cost", iterations: 1 });
    const refusal = result.exhaustion!.costRefusal!;
    expect(refusal).toMatchObject({ code: "llm_budget.run_cost_limit", spentUsd: 0.001, pendingUsd: 0, ceilingUsd: 0.25, maxOutputTokens: DECISION_REPLY });
    // Priced from the request the harness measured, at the uncached rate.
    // The purse refused it, so it is no standing of the loop count's.
    expect(refusal).not.toHaveProperty("declinedBy");
    expect(refusal.estimatedInputTokens).toBeGreaterThan(2_600_000 / 3);
    expect(refusal.projectedCostUsd).toBeCloseTo(priceUsd({ inputTokens: refusal.estimatedInputTokens, outputTokens: DECISION_REPLY }), 9);
    expect(refusal.spentUsd + refusal.projectedCostUsd!).toBeGreaterThan(0.25);
    // What the build spent never passes its ceiling, and nothing overspent its hold.
    expect(result.accounting.estimatedCostUsd).toBeCloseTo(0.001, 9);
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

/** A provider that prices every request at `worstCaseUsd` and reports each answer's cost, noting the purse each call was made under. */
function flatProvider(worstCaseUsd: number, answers: Array<{ decision: Record<string, unknown>; costUsd: number }>) {
  let asked = 0;
  const purses: unknown[] = [];
  const llm: AutomationStudioLlmProvider = {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    estimateCostUsd: () => worstCaseUsd,
    runTask: async () => {
      const answer = answers[asked]!;
      asked += 1;
      purses.push(automationStudioLlmCurrentBuildPurse());
      return { response: { kind: "evidence_tool_decision", summary: "Next.", decision: answer.decision }, usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: answer.costUsd } };
    }
  };
  return { llm, purses, get asked() { return asked; } };
}

/** The loop as a build runs it under the build's own purse, noting the budget entry each decision was shown. */
function buildUnder(llm: AutomationStudioLlmProvider, purse: AutomationStudioLlmBuildPurse, budget: AutomationStudioLlmEvidenceLoopBudget) {
  const budgets: Array<Record<string, unknown> | undefined> = [];
  const result = runAutomationStudioLlmEvidenceLoop({
    tools: [look], maxIterations: 20, maxToolCalls: 20, completionSchema, propagateDecisionErrors: true, purse, budget,
    executeTool: async ({ value }) => ({ page: value.page ?? null }),
    decide: async ({ iteration, tools, evidence, decisionSchema, canComplete }) => {
      const last = evidence.at(-1);
      budgets.push(last?.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID ? last.value as Record<string, unknown> : undefined);
      const decision = await runAutomationStudioLlmHarness({
        taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
        evidenceLoop: { iteration, tools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema, canComplete },
        provider: llm, tokenLimits, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
      });
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error(`decision failed: ${decision.diagnostics.map((item) => item.code).join(",")}`);
      return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
    }
  });
  return { result, budgets };
}

// t234: one purse per Flow creation, handed to the loop, is the only cost
// authority. The loop makes none of its own, reads what is left from it, and
// ends on cost only when it refuses a decision.
describe("an evidence loop given the build's purse", () => {
  it("ends when the purse refuses a decision, with the refusal's figures and the spend earlier builds carried", async () => {
    // Earlier builds of the same Flow creation spent $0.05 of its $0.10.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.05 });
    const llm = flatProvider(0.03, [
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } }, costUsd: 0.03 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.01 }
    ]);

    // No cost bound in the loop's own budget: the purse is the ceiling.
    const { result, budgets } = buildUnder(llm.llm, purse, { maxTotalTokens: 1_000_000 });
    const ended = await result;

    // $0.08 spent, $0.03 at worst: refused, never sent.
    expect(llm.asked).toBe(1);
    expect(budgets[1]).toMatchObject({ decisionsLeft: 1, costLeftUsd: expect.closeTo(0.02, 3) });
    expect(ended).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", exhaustion: { bound: "budget", budgetBound: "cost", iterations: 1 } });
    if (ended.ok) return;
    expect(ended.exhaustion!.costRefusal).toEqual({
      code: "llm_budget.run_cost_limit", projectedCostUsd: 0.03, estimatedInputTokens: expect.any(Number), maxOutputTokens: DECISION_REPLY,
      spentUsd: expect.closeTo(0.08, 9), pendingUsd: 0, ceilingUsd: 0.1, carriedUsd: 0.05
    });
    expect(ended.accounting.estimatedCostUsd).toBeCloseTo(0.03, 9);
  });

  it("holds every decision against the purse it was given, so what earlier calls spent on it is what is left", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // An earlier call of the same build -- the instruction reading -- held at $0.02, reported $0.03: a breach before the loop.
    const earlier = purse.hold({ projectedCostUsd: 0.02, estimatedInputTokens: 1_000, maxOutputTokens: 100 });
    if (!earlier.ok) throw new Error("not held");
    earlier.hold.settle({ estimatedCostUsd: 0.03 });
    const llm = flatProvider(0.004, [
      // Reports more than its $0.004 worst case: a breach during the loop.
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } }, costUsd: 0.005 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.001 }
    ]);

    const { result, budgets } = buildUnder(llm.llm, purse, { maxCostUsd: 0.1 });
    const ended = await result;

    expect(ended).toMatchObject({ ok: true, accounting: { estimatedCostUsd: 0.006, budgetBreaches: 1 } });
    // Every decision was held against the purse given, and no other.
    expect(llm.purses).toEqual([purse, purse]);
    // $0.10 less the earlier $0.03 and the first decision's $0.005, nothing held back.
    expect(budgets[1]).toMatchObject({ costLeftUsd: expect.closeTo(0.065, 3) });
    expect(purse.spentUsd()).toBeCloseTo(0.036, 9);
    expect(purse.breaches).toBe(2);
  });
});

// t254: no reply is capped, so a reply longer than its reserve can cost more
// than its hold. The loop's accounting says so, in calls and in dollars.
describe("a decision that cost more than it was held at (t254)", () => {
  it("is counted as a breach with its overshoot in the loop's accounting, never hidden", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // The first decision reports $0.01: far past its hold, its reply having run long. The second completes.
    const llm = provider([
      { decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } }, costUsd: 0.01 },
      { decision: { kind: "complete", result: {} }, costUsd: 0.0001 }
    ]);
    const { result } = buildUnder(llm.provider, purse, { maxTotalTokens: 1_000_000 });
    const ended = await result;

    expect(purse.breaches).toBe(1);
    expect(purse.overshootUsd).toBeGreaterThan(0.005);
    expect(ended.accounting.budgetBreaches).toBe(1);
    expect(ended.accounting.budgetOvershootUsd).toBeCloseTo(purse.overshootUsd, 12);
    expect(ended.accounting.estimatedCostUsd).toBeCloseTo(0.0101, 9);
  });
});
