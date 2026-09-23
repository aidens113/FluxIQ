import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";

// A tool call that fails is an observation, not the end: Flow creation on the
// realistic professional-network site died on the first press a promotion covered, because
// the loop ended on the throw and never said which call it was.

const inspect: AutomationStudioLlmEvidenceTool = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } };
const press: AutomationStudioLlmEvidenceTool = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" };
const tools = [inspect, press];
const PRIVATE = "div#ember789 covers the target: Download the app";
const stalled = () => new Error("stalled");

describe("a tool call that fails, in a loop that observes failures", () => {
  it("is recorded under its call id with a closed code, shown to the model, and the loop goes on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: { target: "target.2" } })
      .mockResolvedValueOnce({ kind: "complete", result: { plan: "close the prompt first" } });
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "press") throw new Error(PRIVATE);
      return { page: "home" };
    });

    // The guard is named rather than inherited: its default is now a far
    // backstop, because three in a row ended builds that were working.
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, minToolCalls: 1, decide, executeTool, maxStepsWithoutProgress: 3, unusableDecisions: { stalled } });

    expect(result).toMatchObject({ ok: true, result: { plan: "close the prompt first" }, accounting: { iterations: 2, toolCalls: 2 } });
    expect(result.trace[1]).toEqual({ iteration: 1, decision: "tool_call", callId: "call.press.1", toolId: "press", resultCode: "llm_evidence_loop.tool_failed", evidenceBytes: expect.any(Number) });
    const shown = decide.mock.calls[1]?.[0].evidence;
    // The draft sits after the window, so the failed call's own result is the
    // entry before it. The failure is in the draft too: an action that was
    // attempted and did not happen is part of the record of what was done.
    expect(shown.at(-2)).toEqual({ callId: "call.press.1", toolId: "press", value: {
      ok: false, code: "llm_evidence_loop.tool_failed", toolId: "press", stepsWithoutProgress: 1, maxStepsWithoutProgress: 3, instruction: expect.any(String)
    } });
    expect(shown.at(-1)).toMatchObject({ callId: "core.flow_draft", toolId: "core.flow_draft", value: {
      code: "llm_evidence_loop.draft",
      // Position 2: the initial observation is step 1 of the draft, and a
      // position never shifts, so an amendment always names the same step.
      steps: [{ step: 2, actionId: "press", input: { target: "target.2" }, resultCode: "llm_evidence_loop.tool_failed", changed: "no", disposition: "kept", inResult: false }]
    } });
    expect(JSON.stringify({ result, shown })).not.toContain("ember789");
  });

  it("names a result that is not one as tool_result_invalid", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "private result text!" }
        : { page: "home" }
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.trace[1]).toMatchObject({ callId: "call.press.1", resultCode: "llm_evidence_loop.tool_result_invalid" });
  });

  it("counts a failed action as a change, so the page may be looked at again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: { target: "target.2" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.inspect.2", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    let looks = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => {
        if (toolId === "press") throw new Error(PRIVATE);
        looks += 1;
        return { look: looks };
      }
    });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["press"]);
    expect(decide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(looks).toBe(2);
  });

  it("lets a request that failed be asked again rather than answering it with the failure", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.detect.1", toolId: "detect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.detect.2", toolId: "detect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    let attempts = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "detect", description: "Find the list.", inputSchema: { type: "object" }, effect: "observe" }],
      decide, unusableDecisions: { stalled },
      executeTool: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("timed out");
        return { list: true };
      }
    });
    expect(attempts).toBe(2);
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
    expect(result.trace.map((step) => step.resultCode)).toEqual(["llm_evidence_loop.tool_failed", undefined, undefined]);
  });

  it("ends as tool_failed once failures run to the no-progress guard, the last one in the trace", async () => {
    let call = 0;
    const decide = vi.fn(async () => ({ kind: "tool_call", callId: `call.press.${++call}`, toolId: "press", input: { attempt: call } }));
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "press") throw new Error(PRIVATE);
      return { page: "home" };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxStepsWithoutProgress: 3, unusableDecisions: { stalled } });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { iterations: 3, toolCalls: 4 } });
    expect(result.trace.slice(1).map((step) => [step.callId, step.resultCode])).toEqual([
      ["call.press.1", "llm_evidence_loop.tool_failed"],
      ["call.press.2", "llm_evidence_loop.tool_failed"],
      ["call.press.3", "llm_evidence_loop.tool_failed"]
    ]);
  });

  it("records a failed initial observation, keeps it offered, and does not count it as evidence", async () => {
    let looks = 0;
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.inspect.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, minToolCalls: 1, decide, unusableDecisions: { stalled },
      executeTool: async () => {
        looks += 1;
        if (looks === 1) throw new Error("page is loading");
        return { look: looks };
      }
    });
    expect(result.trace[0]).toMatchObject({ iteration: 0, callId: "initial.inspect", toolId: "inspect", resultCode: "llm_evidence_loop.tool_failed" });
    expect(decide.mock.calls[0]?.[0]).toMatchObject({ canComplete: false });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(decide.mock.calls[1]?.[0]).toMatchObject({ canComplete: true });
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
  });

  it("still ends on cancellation", async () => {
    const controller = new AbortController();
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, signal: controller.signal, unusableDecisions: { stalled },
      decide: async () => ({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} }),
      executeTool: async ({ toolId }) => {
        if (toolId === "inspect") return { page: "home" };
        controller.abort();
        throw new Error("aborted");
      }
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.cancelled" });
  });
});

describe("a tool call that fails, in a loop that ends on failures", () => {
  it("ends at once and records nothing when unusable decisions are not asked again", async () => {
    const decide = vi.fn().mockResolvedValue({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async ({ toolId }) => { if (toolId === "press") throw new Error(PRIVATE); return {}; } });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { toolCalls: 1 } });
    expect(result.trace).toHaveLength(1);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("follows an explicit choice either way", async () => {
    const throwing = async ({ toolId }: { toolId: string }) => { if (toolId === "press") throw new Error(PRIVATE); return {}; };
    const pressThenComplete = () => vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, toolFailures: "observe", decide: pressThenComplete(), executeTool: throwing }))
      .resolves.toMatchObject({ ok: true });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, toolFailures: "end", unusableDecisions: { stalled }, decide: pressThenComplete(), executeTool: throwing }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed" });
  });
});
