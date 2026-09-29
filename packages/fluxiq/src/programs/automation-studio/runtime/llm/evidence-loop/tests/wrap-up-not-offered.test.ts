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
    expect(answered?.value).toMatchObject({ ok: false, code: "llm_evidence_loop.not_offered", toolId: "inspect", instruction: expect.stringContaining("offer no tools") });
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
