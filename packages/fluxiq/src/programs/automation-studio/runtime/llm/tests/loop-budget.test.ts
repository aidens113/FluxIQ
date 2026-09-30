import { describe, expect, it, vi } from "vitest";
import { automationStudioLlmEvidenceLoopRemaining } from "../loop-budget.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";

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
    expect(remaining).toEqual({ decisionsLeft: 35, limitedBy: "tokens", tokensLeft: 468_000, costLeftUsd: expect.closeTo(1.9395, 3), secondsLeft: 470 });
  });

  it("assumes the worst case before anything is reported, and counts an unreported decision at the average", () => {
    expect(automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 600_000, maxTokensPerDecision: 56_000 }, { decisions: 0, reportedDecisions: 0, totalTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 }, 64).decisionsLeft).toBe(9);
    const reported = automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 100_000 }, { decisions: 2, reportedDecisions: 2, totalTokens: 20_000, estimatedCostUsd: 0, elapsedMs: 0 }, 64);
    const oneUnreported = automationStudioLlmEvidenceLoopRemaining({ maxTotalTokens: 100_000 }, { decisions: 3, reportedDecisions: 2, totalTokens: 20_000, estimatedCostUsd: 0, elapsedMs: 0 }, 64);
    expect(reported.tokensLeft! - oneUnreported.tokensLeft!).toBe(10_000);
  });

  it("is nothing once a bound is spent, and never more than the iteration backstop", () => {
    const spent = { decisions: 4, reportedDecisions: 4, totalTokens: 40_000, estimatedCostUsd: 0.4, elapsedMs: 40_000 };
    expect(automationStudioLlmEvidenceLoopRemaining({ maxCostUsd: 0.45 }, spent, 60)).toMatchObject({ decisionsLeft: 0, limitedBy: "cost" });
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
    expect(budgetOf(shown[2]!)).toEqual({ code: "llm_evidence_loop.budget", decisionsLeft: 16, tokensLeft: 170_000, costLeftUsd: expect.closeTo(0.985, 3), instruction: expect.stringContaining("Plan to complete") });
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
