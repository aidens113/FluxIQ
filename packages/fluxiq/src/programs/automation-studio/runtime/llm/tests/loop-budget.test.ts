import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS, automationStudioLlmEvidenceBudgetEntry, automationStudioLlmEvidenceLoopRemaining, automationStudioLlmEvidenceLoopWrapUp } from "../loop-budget.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../harness.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const look = (number: number, totalTokens: number) => ({ kind: "tool_call", callId: `call.${number}`, toolId: "inspect", input: { page: number }, usage: { totalTokens, estimatedCostUsd: 0.005 } });
type Shown = { toolId: string; value: Record<string, unknown> };
const budgetOf = (evidence: readonly Shown[]) => evidence.at(-1)?.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID ? evidence.at(-1)!.value : undefined;

// A build used to stop at a call count while still progressing, never told it
// was running out (`run-mubs2sme-75efe4a4`). What bounds it now is what it has
// actually spent against the run's own budget.
describe("what an evidence loop has left", () => {
  it("is the fewest decisions any bound allows, from what was actually spent", () => {
    const remaining = automationStudioLlmEvidenceLoopRemaining(
      { maxTotalTokens: 600_000, maxTokensPerDecision: 56_000, maxCostUsd: 2, maxDurationMs: 540_000 },
      { decisions: 10, reportedDecisions: 10, totalTokens: 120_000, estimatedCostUsd: 0.055, elapsedMs: 70_000 },
      54
    );

    // Tokens: 600,000 less the 120,000 spent and one decision held back leaves
    // 468,000; the next call needs its 56,000 worst case, the rest go at 12,000.
    // Cost holds nothing back: $2 less the $0.055 spent (t234).
    expect(remaining).toEqual({ decisionsLeft: 35, limitedBy: "tokens", tokensLeft: 468_000, costLeftUsd: expect.closeTo(1.945, 3), secondsLeft: 470 });
  });

  it("assumes the worst case before anything is reported, and counts an unreported decision at the average", () => {
    expect(automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 600_000, maxTokensPerDecision: 56_000 }, { decisions: 0, reportedDecisions: 0, totalTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 }, 64).decisionsLeft).toBe(9);
    const reported = automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 100_000 }, { decisions: 2, reportedDecisions: 2, totalTokens: 20_000, estimatedCostUsd: 0, elapsedMs: 0 }, 64);
    const oneUnreported = automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 100_000 }, { decisions: 3, reportedDecisions: 2, totalTokens: 20_000, estimatedCostUsd: 0, elapsedMs: 0 }, 64);
    expect(reported.tokensLeft! - oneUnreported.tokensLeft!).toBe(10_000);
  });

  it("counts decisions left at the last request's worst case when that is more than the average", () => {
    // `run-mup2u8o3-6697c4be` after its eighth decision: $0.1539 spent at an
    // average of $0.0192, the last request (479,196 tokens) $0.1534 at worst.
    // $0.0961 left, nothing held back (t234): the next at the average, then three more.
    const spent = { decisions: 8, reportedDecisions: 8, totalTokens: 1_600_000, estimatedCostUsd: 0.1539, elapsedMs: 0 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.25 }, spent, 56)).toMatchObject({ decisionsLeft: 4, limitedBy: "cost" });
    // A worst case past what is left counts one, never none: the purse decides.
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.25 }, { ...spent, nextDecisionCostUsd: 0.1534 }, 56)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost" });
    // Cheaper than the average, it changes nothing.
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.25 }, { ...spent, nextDecisionCostUsd: 0.001 }, 56).decisionsLeft).toBe(4);
  });

  // `run-muq3uozx-3153564b` withdrew its tools with $0.09 left: every decision
  // was counted at the worst case (~$0.025) when calls really cost ~$0.0023.
  // Only the next decision is reserved at its worst case; the rest go at the average.
  it("reserves the worst case once and counts the decisions after it at the average", () => {
    // One decision reported at $0.0023, nothing held back: $0.0523 left.
    const spent = { decisions: 1, reportedDecisions: 1, totalTokens: 20_000, estimatedCostUsd: 0.0023, elapsedMs: 0, nextDecisionCostUsd: 0.025 };
    const remaining = automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.0546 }, spent, 64);
    expect(remaining.costLeftUsd).toBeCloseTo(0.0523, 4);
    expect(remaining.limitedBy).toBe("cost");
    expect(remaining.decisionsLeft).toBeGreaterThanOrEqual(10);
  });

  it("leaves one decision for money enough for exactly one worst case, and still one for less: the purse decides", () => {
    // $0.25 spent in one decision, nothing held back: $0.5 left.
    const spent = { decisions: 1, reportedDecisions: 1, totalTokens: 20_000, estimatedCostUsd: 0.25, elapsedMs: 0 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.75 }, { ...spent, nextDecisionCostUsd: 0.5 }, 64)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost" });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.75 }, { ...spent, nextDecisionCostUsd: 0.25 }, 64)).toMatchObject({ decisionsLeft: 2, limitedBy: "cost" });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.75 }, { ...spent, nextDecisionCostUsd: 0.5000001 }, 64)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost" });
    // Before anything is reported, the worst case is the only price known.
    const fresh = { decisions: 0, reportedDecisions: 0, totalTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.5 }, { ...fresh, nextDecisionCostUsd: 0.125 }, 64).decisionsLeft).toBe(4);
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.5 }, { ...fresh, nextDecisionCostUsd: 0.75 }, 64).decisionsLeft).toBe(1);
  });

  // `run-muqbzu32-8691a65e` stopped with $0.0738 of $0.10 spent: the count held
  // back an average decision and said none were left, and the purse, which
  // would have paid for the next at its $0.0245 worst case, never saw it.
  it("counts the next decision while the purse can pay for it at worst, with nothing held back (t234)", () => {
    const spent = { decisions: 10, reportedDecisions: 10, totalTokens: 200_000, estimatedCostUsd: 0.0738, elapsedMs: 0, nextDecisionCostUsd: 0.0245 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.1 }, spent, 16)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost", costLeftUsd: expect.closeTo(0.0262, 3) });
    // Read from the purse in use: what earlier builds carried and what is in flight count, and its ceiling is the one.
    const purse = { ceilingUsd: 0.1, spentUsd: 0.0738, pendingUsd: 0 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.25 }, { ...spent, estimatedCostUsd: 0.02, purse }, 16)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost", costLeftUsd: expect.closeTo(0.0262, 3) });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 10_000_000 }, { ...spent, purse: { ...purse, pendingUsd: 0.01 } }, 16)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost", costLeftUsd: expect.closeTo(0.0162, 3) });
  });

  it("is nothing once a bound is spent, save cost, and never more than the iteration backstop", () => {
    const spent = { decisions: 4, reportedDecisions: 4, totalTokens: 40_000, estimatedCostUsd: 0.4, elapsedMs: 40_000 };
    // Cost never counts to none, however little is left: the purse refuses a decision it cannot pay for (t234).
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.45 }, spent, 60)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost", costLeftUsd: expect.closeTo(0.05, 3) });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.3 }, spent, 60)).toMatchObject({ decisionsLeft: 1, limitedBy: "cost", costLeftUsd: 0 });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxDurationMs: 40_000 }, spent, 60)).toMatchObject({ decisionsLeft: 0, limitedBy: "duration" });
    expect(automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 10_000_000 }, spent, 3)).toMatchObject({ decisionsLeft: 3, limitedBy: "iterations" });
  });
});

describe("an evidence loop given a budget", () => {
  it("shows the model what is left, in closed numbers, as the newest entry of every decision after the first", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1, 10_000)).mockResolvedValueOnce(look(2, 10_000))
      .mockResolvedValueOnce({ kind: "complete", result: {}, usage: { totalTokens: 10_000 } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 20, maxToolCalls: 20,
      budget: { maxTotalTokens: 200_000, maxTokensPerDecision: 20_000, maxCostUsd: 1 },
      executeTool: async ({ value }) => ({ page: value.page ?? null, text: "x".repeat(900) })
    });

    expect(result).toMatchObject({ ok: true, accounting: { iterations: 3, totalTokens: 30_000 } });
    const shown = decide.mock.calls.map((call) => call[0].evidence as Shown[]);
    // Nothing is spent before the first decision, so it carries no budget entry.
    expect(shown.map((evidence) => budgetOf(evidence)?.decisionsLeft)).toEqual([undefined, 17, 16]);
    // Cost is the purse's: $1 less the $0.01 spent, nothing held back (t234).
    expect(budgetOf(shown[2]!)).toEqual({ code: "llm_evidence_loop.budget", decisionsLeft: 16, tokensLeft: 170_000, costLeftUsd: expect.closeTo(0.99, 3), instruction: expect.stringContaining("Plan to complete") });
    // Every result is shown whole, in call order, before the budget entry.
    expect(shown[2]!.filter((entry) => entry.toolId === "inspect").map((entry) => entry.value.page)).toEqual([1, 2]);
  });

  it("offers its last decision only completion, and the build ends with a result", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1, 30_000))
      .mockResolvedValueOnce({ kind: "complete", result: { plan: true }, usage: { totalTokens: 30_000 } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 20, maxToolCalls: 20, completionSchema: { type: "object" },
      budget: { maxTotalTokens: 100_000, maxTokensPerDecision: 20_000 },
      executeTool: async () => ({ facts: ["ready"] })
    });

    expect(result).toMatchObject({ ok: true, result: { plan: true } });
    const last = decide.mock.calls[1]![0];
    expect(last.tools).toEqual([]);
    expect((last.decisionSchema as { oneOf: Array<{ properties: { kind: { const: string } } }> }).oneOf.map((variant) => variant.properties.kind.const)).toEqual(["complete"]);
    expect(budgetOf(last.evidence)).toMatchObject({ decisionsLeft: 1, instruction: expect.stringContaining("last decision") });
  });

  it("ends iteration_limit, never at a budget refusal, once nothing is left", async () => {
    const decide = vi.fn().mockResolvedValue(look(1, 30_000));
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 20, maxToolCalls: 20, budget: { maxTotalTokens: 10_000, maxTokensPerDecision: 20_000 }, executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit" });
    expect(decide).not.toHaveBeenCalled();

    // A last decision that asks for a tool anyway is not run.
    const executeTool = vi.fn().mockResolvedValue({});
    const final = vi.fn().mockResolvedValueOnce(look(1, 30_000)).mockResolvedValueOnce(look(2, 30_000));
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: final, maxIterations: 20, maxToolCalls: 20, budget: { maxTotalTokens: 100_000, maxTokensPerDecision: 20_000 }, executeTool }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", accounting: { toolCalls: 1 } });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  // A live build's last, complete-only decision wrote a plan that was refused,
  // and the budget was then spent (`run-mubt57qz-9227b125`). That refusal used
  // to *become* the ending -- `stalled`, and so Flow Bootstrap's
  // `evidence_unusable_decision` at `retryable: false`. What ran out was the
  // budget, which a retry can be given more of, so the ending says that and the
  // refusal travels beside it as context.
  it("ends as the spent budget when it is spent straight after a refusal, and carries that refusal", async () => {
    const stalled = vi.fn(() => new Error("stalled"));
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1, 30_000))
      .mockResolvedValueOnce({ kind: "complete", result: {}, usage: { totalTokens: 30_000 } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 20, maxToolCalls: 20, unusableDecisions: { stalled },
      checkCompletion: () => ({ ok: false, issueCodes: ["plan.handle_ambiguous"], feedback: { issue: "plan.handle_ambiguous" } }),
      budget: { maxTotalTokens: 100_000, maxTokensPerDecision: 20_000 },
      executeTool: async () => ({ facts: ["ready"] })
    });

    expect(result).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.iteration_limit",
      exhaustion: { bound: "budget", completionAttempts: 1, lastIssueCodes: ["plan.handle_ambiguous"] }
    });
    expect(decide).toHaveBeenCalledTimes(2);
    expect(stalled).not.toHaveBeenCalled();
  });

  it("ends as the spent allowance on the literal final iteration, saying how far the draft got", async () => {
    const stalled = vi.fn(() => new Error("stopped on final refusal"));
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1, 10_000))
      .mockResolvedValueOnce({ kind: "complete", result: {}, usage: { totalTokens: 10_000 } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 2, maxToolCalls: 2, propagateDecisionErrors: true,
      unusableDecisions: { stalled },
      checkCompletion: () => ({ ok: false, issueCodes: ["plan.cannot_answer"], feedback: { issue: "plan.cannot_answer" } }),
      // Keep tokens far from binding: maxIterations is the bound reached.
      budget: { maxTotalTokens: 1_000_000, maxTokensPerDecision: 20_000 },
      executeTool: async () => ({ facts: ["ready"] })
    });

    expect(result).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.iteration_limit",
      exhaustion: { maxIterations: 2, iterations: 2, draftSteps: 1, completionAttempts: 1, lastIssueCodes: ["plan.cannot_answer"] }
    });
    expect(decide).toHaveBeenCalledTimes(2);
    expect(decide.mock.calls[1]![0].tools).toEqual([]);
    expect(stalled).not.toHaveBeenCalled();
  });

  // t234: the count only tells the model what is left; the purse is the only
  // cost ending. Before, a last decision the cost count allowed that went on a
  // tool call ended the loop, and so did a count of none the purse never saw.
  it("carries on past a cost-bound last decision spent on a tool call: the purse decides", async () => {
    const executeTool = vi.fn(async () => ({ facts: ["ready"] }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ ...look(1, 1_000), usage: { totalTokens: 1_000, estimatedCostUsd: 0.06 } })
      // $0.04 left at a $0.06 average: the count says one, offers only completion, and is answered with a call.
      .mockResolvedValueOnce({ ...look(2, 1_000), usage: { totalTokens: 1_000, estimatedCostUsd: 0.01 } })
      .mockResolvedValueOnce({ kind: "complete", result: { plan: true }, usage: { totalTokens: 1_000, estimatedCostUsd: 0.01 } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 20, maxToolCalls: 20, completionSchema: { type: "object" }, budget: { maxCostUsd: 0.1 }, executeTool });

    expect(result).toMatchObject({ ok: true, result: { plan: true }, accounting: { iterations: 3 } });
    expect(decide).toHaveBeenCalledTimes(3);
    const second = decide.mock.calls[1]![0];
    expect(second.tools).toEqual([]);
    expect(budgetOf(second.evidence)).toMatchObject({ decisionsLeft: 1, costLeftUsd: expect.closeTo(0.04, 3), instruction: expect.stringContaining("last decision") });
    // The call it was not offered is answered, never run.
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("sends the decision the purse can pay for at $0.0738 of $0.10, and ends only when the purse refuses one", async () => {
    // Every request at most $0.0245, as `run-muqbzu32-8691a65e`'s last; each reports $0.0123.
    let offered = 0;
    let asked = 0;
    const llm: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: () => 0.0245,
      runTask: async () => {
        asked += 1;
        const decision = offered ? { kind: "tool_call", callId: `call.${asked}`, toolId: "inspect", input: { page: asked } } : { kind: "complete", result: {} };
        return { response: { kind: "evidence_tool_decision", summary: "Next.", decision }, usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.0123 } };
      }
    };
    const shown: Shown[][] = [];
    const completionSchema = { type: "object" };
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 20, maxToolCalls: 20, completionSchema, budget: { maxCostUsd: 0.1 },
      unusableDecisions: { stalled: () => new Error("stalled") },
      // Each completion is refused, so the build spends on into its last cents.
      checkCompletion: () => ({ ok: false, issueCodes: ["plan.cannot_answer"], feedback: { issue: "plan.cannot_answer" } }),
      executeTool: async ({ value }) => ({ page: value.page ?? null }),
      decide: async ({ iteration, tools: offeredTools, evidence, decisionSchema, canComplete }) => {
        offered = offeredTools.length;
        shown.push(evidence.map((item) => ({ toolId: item.toolId, value: item.value as Record<string, unknown> })));
        const decision = await runAutomationStudioLlmHarness({
          taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
          evidenceLoop: { iteration, tools: offeredTools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema, canComplete },
          provider: llm, tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
        });
        if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error("decision failed");
        return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
      }
    });

    // The seventh decision, with $0.0738 spent and $0.0262 left, is sent: the
    // count used to hold back another $0.0123 and stop here with none left.
    expect(asked).toBe(7);
    expect(budgetOf(shown[6]!)).toMatchObject({ decisionsLeft: 1, costLeftUsd: expect.closeTo(0.0262, 3) });
    // The eighth, $0.0245 at worst on $0.0861 spent, is the purse's to refuse, and its figures are the ending's.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", exhaustion: { bound: "budget", budgetBound: "cost", iterations: 7 } });
    if (result.ok) return;
    expect(result.exhaustion!.costRefusal).toMatchObject({ code: "llm_budget.run_cost_limit", projectedCostUsd: 0.0245, spentUsd: expect.closeTo(0.0861, 6), pendingUsd: 0, ceilingUsd: 0.1 });
    expect(result.accounting.budgetBreaches).toBeUndefined();
  });

  it("counts down to its deadline on its own clock", async () => {
    let now = 0;
    const decide = vi.fn(async ({ tools: offered }: { tools: unknown[]; evidence: readonly unknown[] }) => {
      now += 4_000;
      return offered.length ? look(1 + decide.mock.calls.length, 1_000) : { kind: "complete", result: {} };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 20, maxToolCalls: 20, budget: { maxDurationMs: 10_000, now: () => now }, executeTool: async ({ value }) => ({ page: value.page ?? null }) });

    expect(result).toMatchObject({ ok: true, accounting: { iterations: 2 } });
    expect(budgetOf(decide.mock.calls[1]![0].evidence as Shown[])).toMatchObject({ decisionsLeft: 1, secondsLeft: 6 });
  });

  it("refuses a budget it cannot count down from", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, budget: { maxTotalTokens: Number.NaN }, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
  });
});

// t254: a build with a judge keeps its judging pair back from every decision,
// and the count tells the model only what exploration may still spend, so it
// wraps up while the decision that finishes and the judging after it are paid.
describe("the cost count beside a judging reserve (t254)", () => {
  it("takes what is kept back for judging out of what is left, and wraps up sooner for it", () => {
    const spent = { decisions: 30, reportedDecisions: 30, totalTokens: 600_000, estimatedCostUsd: 0.0889, elapsedMs: 0, nextDecisionCostUsd: 0.0069 };
    const without = automationStudioLlmEvidenceLoopRemaining({}, { ...spent, purse: { ceilingUsd: 0.1, spentUsd: 0.0889, pendingUsd: 0 } }, 64);
    const kept = automationStudioLlmEvidenceLoopRemaining({}, { ...spent, purse: { ceilingUsd: 0.1, spentUsd: 0.0889, pendingUsd: 0, keptBackUsd: 0.0068 } }, 64);
    expect(without.costLeftUsd).toBeCloseTo(0.0111, 3);
    expect(kept.costLeftUsd).toBeCloseTo(0.0043, 3);
    expect(without.decisionsLeft).toBeGreaterThan(1);
    // $0.0043 is less than the next decision's $0.0069: only completion is offered, never a new look the judging could not follow.
    expect(kept.decisionsLeft).toBe(1);
  });
});

// t383, lane C (`run-mv0pa79q-ef91811b`): at three decisions left the wrap-up offered no tools, so a candidate that
// had not submitted lost `core.submit_candidate` and spent its last four decisions on completions refused
// `candidate.latest_submission_required`. A candidate's wrap-up starts earlier and keeps submitting and testing.
describe("a candidate's wrap-up (t383)", () => {
  const candidateTools = [
    { toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } },
    { toolId: "core.submit_candidate", description: "Submit the whole Flow.", inputSchema: { type: "object" } },
    { toolId: "core.test_candidate", description: "Test a submitted revision.", inputSchema: { type: "object" } }
  ];
  const left = (decisionsLeft: number) => ({ decisionsLeft, limitedBy: "cost" as const });
  const offeredIds = (decisionsLeft: number, candidate: boolean) =>
    automationStudioLlmEvidenceLoopWrapUp({ remaining: left(decisionsLeft), canComplete: true, candidate, tools: candidateTools }).offered.map((tool) => tool.toolId);

  it("starts at five decisions left and keeps the submission and the trial until the last decision", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS).toBe(5);
    expect(offeredIds(6, true)).toEqual(["inspect", "core.submit_candidate", "core.test_candidate"]);
    for (const decisionsLeft of [5, 4, 3, 2]) expect(offeredIds(decisionsLeft, true)).toEqual(["core.submit_candidate", "core.test_candidate"]);
    expect(offeredIds(1, true)).toEqual([]);
    const wrapUp = automationStudioLlmEvidenceLoopWrapUp({ remaining: left(3), canComplete: true, candidate: true, tools: candidateTools });
    expect(wrapUp).toMatchObject({ wrappingUp: true });
    expect([wrapUp.withholds("inspect"), wrapUp.withholds("core.submit_candidate"), wrapUp.withholds("core.test_candidate")]).toEqual([true, false, false]);
  });

  it("leaves a draft loop's wrap-up as it was: from three decisions left, no tools at all", () => {
    expect(offeredIds(5, false)).toEqual(["inspect", "core.submit_candidate", "core.test_candidate"]);
    expect(offeredIds(4, false)).toHaveLength(3);
    for (const decisionsLeft of [3, 2, 1]) expect(offeredIds(decisionsLeft, false)).toEqual([]);
    expect(automationStudioLlmEvidenceLoopWrapUp({ remaining: left(3), canComplete: false, candidate: false, tools: candidateTools }).offered).toHaveLength(3);
    expect(automationStudioLlmEvidenceLoopWrapUp({ remaining: undefined, canComplete: true, candidate: true, tools: candidateTools })).toMatchObject({ wrappingUp: false });
  });

  it("tells a candidate to submit, test and complete, and a draft loop what it was told before", () => {
    const instruction = (decisionsLeft: number, candidate: boolean) => String(automationStudioLlmEvidenceBudgetEntry(2, left(decisionsLeft), undefined, candidate).value.instruction);
    expect(instruction(8, true)).toMatch(/submit the whole candidate, test that revision, and complete once its trial answers yes\. From 5 decisions left/u);
    expect(instruction(4, true)).toMatch(/submit the whole candidate now with core\.submit_candidate; test that exact revision with core\.test_candidate/u);
    expect(instruction(1, true)).toMatch(/only complete is offered: complete with the revision and digest of your latest submission/u);
    expect(instruction(4, false)).toMatch(/^What this exploration has left/u);
    expect(instruction(3, false)).toMatch(/^Only a few decisions are left, so new tools are no longer offered: complete now from the draft you have/u);
    expect(instruction(1, false)).toMatch(/^This is your last decision, so only complete is offered: write the result now/u);
  });

  it("runs a submission asked for in the wrap-up, and answers an exploring call without running it", async () => {
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => ({ ran: toolId }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } })
      // Five decisions left: the wrap-up. The submission is offered and runs.
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "core.submit_candidate", input: { flow: "a whole Flow" } })
      // An exploring tool is withheld: answered, never run.
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.3", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: { revision: 1, digest: "d" } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: candidateTools, decide, executeTool, draft: false, discoveryOnly: true, maxIterations: 6, maxToolCalls: 6,
      completionSchema: { type: "object" }, budget: { maxTotalTokens: 10_000_000 }
    });

    expect(result).toMatchObject({ ok: true, result: { revision: 1, digest: "d" } });
    const offered = (call: number) => (decide.mock.calls[call]![0].tools as Array<{ toolId: string }>).map((tool) => tool.toolId);
    expect(offered(0)).toEqual(["inspect", "core.submit_candidate", "core.test_candidate"]);
    expect(offered(1)).toEqual(["core.submit_candidate", "core.test_candidate"]);
    expect(budgetOf(decide.mock.calls[1]![0].evidence as Shown[])).toMatchObject({ decisionsLeft: 5, instruction: expect.stringContaining("core.submit_candidate") });
    expect(executeTool.mock.calls.map(([call]) => call.toolId)).toEqual(["inspect", "core.submit_candidate"]);
    expect(result.trace.find((row) => row.iteration === 3)).toMatchObject({ decision: "tool_call", resultCode: "llm_evidence_loop.not_offered" });
  });
});
