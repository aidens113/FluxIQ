// The wrap-up offers no tools, and a tool call made anyway is answered, never
// run.
//
// The check used to be against the tools the loop could run this iteration,
// not the ones it had offered, so a model that ignored the wrap-up's schema
// still had its call executed -- and spent a decision the wrap-up exists to
// keep for finishing (found by t173-B, `t173-b-core-tests.md`).
import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
type Shown = { toolId: string; value: Record<string, unknown> };

describe("a tool call in the wrap-up", () => {
  it("is not run, is answered with why, and the build can still finish", async () => {
    const executeTool = vi.fn(async ({ value }: { value: Record<string, unknown> }) => ({ page: String(value.page) }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } })
      // Three decisions left: the wrap-up, which offers no tools. Asked anyway.
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: { plan: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool, maxIterations: 4, maxToolCalls: 4, completionSchema: { type: "object" },
      budget: { maxTotalTokens: 10_000_000 }
    });

    expect(result).toMatchObject({ ok: true, result: { plan: true } });
    expect(decide.mock.calls[1]![0].tools).toEqual([]);
    // Only the call it was offered ran.
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.accounting.toolCalls).toBe(1);
    const answered = (decide.mock.calls[2]![0].evidence as Shown[]).find((entry) => entry.toolId === "core.request_check");
    expect(answered?.value).toMatchObject({ ok: false, code: "llm_evidence_loop.not_offered", toolId: "inspect", instruction: expect.stringContaining("only the tools offered now can run") });
    expect(result.trace.find((row) => row.iteration === 2)).toMatchObject({ decision: "tool_call", resultCode: "llm_evidence_loop.not_offered" });
  });

  it("does not stop a rerun the model was offered as an amendment", async () => {
    // A rerun is an amendment, which the wrap-up does offer; it goes through
    // the tool path and must still run. Pinned so the refusal above cannot
    // quietly take it too.
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, draft: { actionId: "inspect", proposes: true } }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { page: 3 } }] })
      .mockResolvedValueOnce({ kind: "complete", result: { plan: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool, maxIterations: 4, maxToolCalls: 4, completionSchema: { type: "object" },
      budget: { maxTotalTokens: 10_000_000 }
    });

    expect(result).toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(2);
  });
});

const finishingTools = ["core.submit_candidate", "core.test_candidate"].map((toolId) => ({
  toolId, description: "Finish the candidate.", inputSchema: { type: "object" }
}));

describe("a candidate tool offered in the final counted slot", () => {
  for (const bound of ["duration", "iterations", "tokens", "cost"] as const) {
    for (const toolId of ["core.submit_candidate", "core.test_candidate"]) {
      it(`executes the offered ${toolId} when ${bound} leaves one slot`, async () => {
        let now = 0;
        const executeTool = vi.fn(async (_call: { toolId: string; value: Record<string, unknown> }) => ({ accepted: true }));
        const decide = vi.fn(async ({ iteration }: { iteration: number }) => {
          now += iteration === 1 ? 4_000 : 100;
          if (iteration > 2) return { kind: "complete", result: {} };
          return { kind: "tool_call", callId: `call.${iteration}`, toolId: iteration === 1 ? "core.submit_candidate" : toolId,
            input: { revision: iteration }, usage: { totalTokens: 100, estimatedCostUsd: iteration === 1 ? 0.06 : 0.01 } };
        });
        const result = await runAutomationStudioLlmEvidenceLoop({
          tools: finishingTools, decide, executeTool, draft: false, discoveryOnly: true, completionSchema: { type: "object" },
          maxIterations: bound === "iterations" ? 2 : 20, maxToolCalls: 20,
          budget: { now: () => now, ...(bound === "duration" ? { maxDurationMs: 10_000 } : {}),
            ...(bound === "tokens" ? { maxTotalTokens: 300, maxTokensPerDecision: 100 } : {}),
            ...(bound === "cost" ? { maxCostUsd: 0.1 } : {}) }
        });
        const last = decide.mock.calls[1]![0] as unknown as { tools: Array<{ toolId: string }>; evidence: Array<{ toolId: string; value: unknown }> };
        expect(last.tools.map((tool) => tool.toolId)).toContain(toolId);
        expect(last.evidence.at(-1)?.value).toMatchObject({ decisionsLeft: 1 });
        expect(executeTool).toHaveBeenCalledTimes(2);
        expect(executeTool.mock.calls[1]![0]).toMatchObject({ toolId, value: { revision: 2 } });
        expect(result.trace.some((row) => row.iteration === 2 && row.resultCode === "llm_evidence_loop.not_offered")).toBe(false);
        if (bound === "iterations") expect(result).toMatchObject({ ok: false, exhaustion: { bound: "iterations", iterations: 2 } });
      });
    }
  }

  it("does not start an offered tool when its decision returns after the actual deadline", async () => {
    let now = 0;
    const executeTool = vi.fn(async (_call: { toolId: string; value: Record<string, unknown> }) => ({ accepted: true }));
    const decide = vi.fn(async ({ iteration }: { iteration: number }) => {
      now += iteration === 1 ? 4_000 : 6_000;
      return { kind: "tool_call", callId: `call.${iteration}`, toolId: iteration === 1 ? "core.submit_candidate" : "core.test_candidate", input: { revision: iteration }, usage: { totalTokens: 100, estimatedCostUsd: iteration === 1 ? 0.06 : 0.01 } };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: finishingTools, decide, executeTool, draft: false, discoveryOnly: true,
      completionSchema: { type: "object" }, maxIterations: 20, maxToolCalls: 20, budget: { maxDurationMs: 10_000, maxCostUsd: 0.1, now: () => now } });
    const last = decide.mock.calls[1]![0] as unknown as { evidence: Array<{ value: unknown }> };
    expect(last.evidence.at(-1)?.value).toMatchObject({ decisionsLeft: 1, secondsLeft: 6, costLeftUsd: 0.04 });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", exhaustion: { bound: "budget", budgetBound: "duration" } });
    expect(result.trace.some((row) => row.resultCode === "llm_evidence_loop.not_offered")).toBe(false);
    expect(result.trace.at(-1)).toMatchObject({ iteration: 2, decision: "tool_call", toolId: "core.test_candidate", resultCode: "llm_evidence_loop.duration_limit" });
    expect(result.accounting.iterations).toBe(2);
  });
});
