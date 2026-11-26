import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { automationStudioLlmEvidenceNearestToolId } from "../index.ts";

// A tool id the model made up is one paid call that produced nothing, like any
// other unusable decision: it is refused with the ids that exist and asked
// again, and only a model that keeps doing it ends the loop, through the guard.

const inspect: AutomationStudioLlmEvidenceTool = { toolId: "page.inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } };
const press: AutomationStudioLlmEvidenceTool = { toolId: "page.press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" };
const tools = [inspect, press];
const stalled = () => new Error("stalled");
const feedbackOf = (decide: ReturnType<typeof vi.fn>, call: number) =>
  (decide.mock.calls[call]![0].evidence as { toolId: string; value: Record<string, unknown> }[]).find((entry) => entry.toolId === "core.decision_check")!.value;

describe("a tool call naming a tool that was not offered", () => {
  it("is refused with the offered ids and the nearest, and the corrected call runs", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "page.pres", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "page.press", input: { target: "target.1" } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async () => ({ ok: true }));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, minToolCalls: 1, decide, executeTool, unusableDecisions: { stalled } });

    expect(result).toMatchObject({ ok: true, result: { done: true } });
    const feedback = feedbackOf(decide, 1);
    expect(feedback).toMatchObject({ ok: false, code: "llm_evidence_loop.decision_unusable", issueCodes: ["llm_evidence_loop.unknown_tool_refused"] });
    expect(feedback.instruction).toContain('offered for this decision are: "page.press", "core.loop_decision", "core.run_flow".'); // The look was already answered, so the press is offered, the loop decision every loop is offered (t1056), and core.run_flow from the first decision (page-diff D11).
    expect(feedback.instruction).toContain('nearest to the one you gave is "page.press"');
    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ toolId: "page.press" }));
    expect(executeTool).not.toHaveBeenCalledWith(expect.objectContaining({ toolId: "page.pres" }));
    expect(result.trace.some((row) => row.decision === "unusable" && row.resultCode === "llm_evidence_loop.unknown_tool_refused")).toBe(true);
  });

  // Asked again each time, never ended on the first, and never on a count (t1049, t1056): the model's own correction
  // ends it, or its purse.
  it("asks again when the model keeps naming ids that do not exist, however often, until it corrects itself", async () => {
    let asked = 0;
    const decide = vi.fn(async () => (asked += 1) <= 20 ? { kind: "tool_call", callId: "call.x", toolId: "nonexistent", input: {} } : { kind: "complete", result: { done: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({}), unusableDecisions: { stalled }, propagateDecisionErrors: false });

    expect(result).toMatchObject({ ok: true });
    expect(decide.mock.calls.length).toBe(21);
    expect(result.trace.filter((row) => row.resultCode === "llm_evidence_loop.unknown_tool_refused")).toHaveLength(20);
  });

  it("leaves a legitimate known id alone", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "page.press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, minToolCalls: 1, decide, executeTool: async () => ({}), unusableDecisions: { stalled } });
    expect(result).toMatchObject({ ok: true });
    expect(result.trace.some((row) => row.decision === "unusable")).toBe(false);
  });

  it("still ends closed as unknown_tool where the loop cannot ask again", async () => {
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "nonexistent", input: {} }), executeTool: async () => ({}) });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.unknown_tool" });
  });
});

describe("the nearest offered tool id", () => {
  it("picks a near spelling or a shared last segment, and nothing when none is close", () => {
    const offered = ["page.inspect", "page.press", "core.run_node"];
    expect(automationStudioLlmEvidenceNearestToolId("page.pres", offered)).toBe("page.press");
    expect(automationStudioLlmEvidenceNearestToolId("run_node", offered)).toBe("core.run_node");
    expect(automationStudioLlmEvidenceNearestToolId("zzzzzzzzzzzzzzzz", offered)).toBeUndefined();
  });
});
