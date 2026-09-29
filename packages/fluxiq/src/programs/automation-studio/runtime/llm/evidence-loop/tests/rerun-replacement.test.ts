// A rerun replaces the step it names only once the rerun has worked.
//
// It used to withdraw the step first and run second, so a rerun that failed
// left the draft with neither: the step that had worked was gone and the one
// that replaced it had not happened. Where that step was the navigation to the
// start location, the Flow could no longer reach its first page, and the build
// was refused `bootstrap.cannot_reach_start_location` for it.

import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const go = { toolId: "go", description: "Go somewhere.", inputSchema: { type: "object" }, effect: "mutate" as const };
const completed = { kind: "complete", result: { flow: "ready" } };
const stalled = () => new Error("stalled");
const ran = (effectApplied: boolean) => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: effectApplied }, effectApplied,
  draft: { actionId: "web.browser.navigate", proposes: effectApplied }
});
const decisions = () => vi.fn()
  .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "go", input: { url: "https://shop.test/" } })
  .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { url: "https://shop.test/audio" } }] })
  .mockResolvedValueOnce(completed);

describe("a rerun and the step it replaces", () => {
  it("keeps the original when the rerun's action did not take effect", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(false));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.steps.map((step) => [step.id, step.disposition, step.effectApplied])).toEqual([["d1", "kept", true], ["d2", "kept", false]]);
  });

  it("keeps the original when the rerun threw", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockRejectedValueOnce(new Error("page gone"));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "kept"], ["d2", "kept"]]);
    expect(result.steps[1]).toMatchObject({ effectApplied: false });
  });

  it("withdraws the original once the rerun worked, and the rerun stands in its place", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(true));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "dropped"], ["d2", "kept"]]);
    expect(result.steps[1]?.input).toMatchObject({ url: "https://shop.test/audio" });
  });
});
