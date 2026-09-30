// How the loop answers the model now that every answer is recorded: the
// decision history beside the window, superseded Core notes leaving it, an
// answered repeat saying what it repeats (and checked against the page when it
// can be), the second answer from one result redirected at once, and a
// completion resent over the same draft marked as such.
import { describe, expect, it, vi } from "vitest";
// The loop first: `runtime/loop-limits/` imports back into the llm directory.
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS } from "../../../loop-limits/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const ofTool = (evidence: Shown, toolId: string) => evidence.filter((entry) => entry.toolId === toolId);
const historyRows = (evidence: Shown): unknown[][] => (evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as { rows: unknown[][] }).rows;

const inspect = { toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe" as const };
const act = { toolId: "act", description: "Change the page.", inputSchema: { type: "object" }, effect: "mutate" as const };
const look = (callId: string, page = 1) => ({ kind: "tool_call", callId, toolId: "inspect", input: { page } });

describe("a completion refused twice over the same draft", () => {
  const initial = [{ ...inspect, initialObservation: { input: {} } }];
  const refusal = { ok: false as const, issueCodes: ["bootstrap.missing_parameter"], feedback: { ok: false, code: "completion_refused", issues: [{ code: "bootstrap.missing_parameter" }] } };

  it("shows only the newest refusal, marks it as sent again, and keeps both in the history", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "complete", result: { same: true } })
      .mockResolvedValueOnce({ kind: "complete", result: { same: true } })
      .mockResolvedValueOnce({ kind: "complete", result: { other: true } });
    const checkCompletion = vi.fn(async (result: JsonObject) => result.other ? { ok: true as const } : refusal);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, checkCompletion,
      unusableDecisions: { maxConsecutive: 5, stalled: () => new Error("stalled") }
    });

    expect(result).toMatchObject({ ok: true, result: { other: true } });
    // The check was still asked the second time.
    expect(checkCompletion).toHaveBeenCalledTimes(3);
    const first = ofTool(shownAt(decide, 1), "core.completion_check");
    expect(first.map((entry) => entry.callId)).toEqual(["core.completion_check.1"]);
    expect(first[0]!.value).toEqual(refusal.feedback);
    const second = ofTool(shownAt(decide, 2), "core.completion_check");
    expect(second.map((entry) => entry.callId)).toEqual(["core.completion_check.2"]);
    expect(second[0]!.value).toEqual({ ...refusal.feedback, sameAsIteration: 1, timesSent: 2 });
    const rows = historyRows(shownAt(decide, 2)).filter((row) => row[1] === "completion");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows)).toContain("bootstrap.missing_parameter");
    expect(rows.flatMap((row) => Array.isArray(row[0]) ? row[0] : [row[0]])).toEqual([1, 2]);
  });

  it("leaves a key the check wrote as it wrote it", async () => {
    const own = { ...refusal, feedback: { ...refusal.feedback, timesSent: 99 } };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "complete", result: { same: true } })
      .mockResolvedValueOnce({ kind: "complete", result: { same: true } })
      .mockResolvedValueOnce({ kind: "complete", result: { other: true } });
    await runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true,
      checkCompletion: async (result: JsonObject) => result.other ? { ok: true as const } : own,
      unusableDecisions: { maxConsecutive: 5, stalled: () => new Error("stalled") }
    });

    expect(ofTool(shownAt(decide, 2), "core.completion_check")[0]!.value).toMatchObject({ sameAsIteration: 1, timesSent: 99 });
  });
});

describe("a request answered from memory", () => {
  it("says what it repeats, how often, and the newest action before it", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act", toolId: "act", input: {} })
      .mockResolvedValueOnce(look("call.2"))
      .mockResolvedValueOnce(look("call.3"))
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => toolId === "act"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true }
      : { page: 1 });

    await runAutomationStudioLlmEvidenceLoop({ tools: [inspect, act], decide, executeTool, maxStepsWithoutProgress: 6 });

    expect(executeTool).toHaveBeenCalledTimes(2);
    const note = ofTool(shownAt(decide, 3), "core.request_check")[0]!.value;
    expect(note).toMatchObject({
      code: "llm_evidence_loop.already_answered", answeredByCallId: "call.2",
      timesAsked: 2, askedAt: [2, 3], answeredAt: 2, lastActionBefore: { callId: "call.act", iteration: 1 }
    });
    expect(note).not.toHaveProperty("pageUnchanged");
    expect(note.instruction).toContain("no action has run since");
    expect(note.instruction).toContain("2nd time");
    // The history row names the call to read instead, and the first time it was asked.
    expect(historyRows(shownAt(decide, 3)).at(-1)).toEqual([3, "answered", "inspect", null, "call.2", "llm_evidence_loop.already_answered", null, null, 2]);
  });

  it("is redirected at once the second time it is answered from the same result, below the usual count", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      .mockResolvedValueOnce(look("call.2"))
      .mockResolvedValueOnce(look("call.3"))
      .mockResolvedValueOnce({ kind: "complete", result: {} });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [inspect], decide, executeTool: async () => ({ page: 1 }), maxIterations: 12, maxToolCalls: 12, maxStepsWithoutProgress: 10 });
    expect(result).toMatchObject({ ok: true });

    // The first answer: no redirect yet.
    expect(ofTool(shownAt(decide, 2), "core.no_progress")).toEqual([]);
    const redirect = ofTool(shownAt(decide, 3), "core.no_progress");
    expect(redirect.map((entry) => entry.callId)).toEqual(["core.no_progress.3"]);
    expect(redirect[0]!.value.stepsWithoutProgress as number).toBeLessThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS);
    // The earlier answered note has left; the newest one says this is the third ask.
    const notes = ofTool(shownAt(decide, 3), "core.request_check");
    expect(notes.map((entry) => entry.callId)).toEqual(["core.request_check.3"]);
    expect(notes[0]!.value).toMatchObject({ timesAsked: 3, askedAt: [1, 2, 3] });
    expect(notes[0]!.value.instruction).toContain("3rd time");
    expect(JSON.stringify(shownAt(decide, 3).find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value)).toContain("llm_evidence_loop.no_progress");
  });
});

describe("a look answered from memory, when the page can be digested", () => {
  it("is answered saying the page is unchanged when a fresh digest matches", async () => {
    const decide = vi.fn().mockResolvedValueOnce(look("call.1")).mockResolvedValueOnce(look("call.2")).mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async (_call: { callId: string }) => ({ page: 1 }));
    const captureStateDigest = vi.fn(async (_input: { callId: string }) => "state.a");

    await runAutomationStudioLlmEvidenceLoop({ tools: [inspect], decide, executeTool, captureStateDigest });

    expect(executeTool).toHaveBeenCalledTimes(1);
    // Before and after call.1, then the check at iteration 2 under a call id of the loop's own.
    expect(captureStateDigest.mock.calls.map(([input]) => input.callId)).toEqual(["call.1", "call.1", "core.answer_check.2"]);
    const note = ofTool(shownAt(decide, 2), "core.request_check")[0]!.value;
    expect(note).toMatchObject({ pageUnchanged: true });
    expect(note.instruction).toContain("unchanged");
  });

  it("is run instead when the page moved by itself, and only once for one request", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1")).mockResolvedValueOnce(look("call.2")).mockResolvedValueOnce(look("call.3"))
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async (_call: { callId: string }) => ({ page: 1 }));
    // A page that never settles: every digest differs from the last.
    let digests = 0;
    const captureStateDigest = vi.fn(async () => `state.${digests += 1}`);

    await runAutomationStudioLlmEvidenceLoop({ tools: [inspect], decide, executeTool, captureStateDigest, maxStepsWithoutProgress: 6 });

    // call.1 ran; call.2 was run because the page had moved; call.3 was answered, unverified.
    expect(executeTool.mock.calls.map(([input]) => input.callId)).toEqual(["call.1", "call.2"]);
    const note = ofTool(shownAt(decide, 3), "core.request_check")[0]!.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.already_answered", answeredByCallId: "call.2" });
    expect(note).not.toHaveProperty("pageUnchanged");
  });

  it("is answered as before when the digest throws", async () => {
    const decide = vi.fn().mockResolvedValueOnce(look("call.1")).mockResolvedValueOnce(look("call.2")).mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async () => ({ page: 1 }));
    const captureStateDigest = vi.fn(async ({ callId }: { callId: string }) => {
      if (callId.startsWith("core.answer_check")) throw new Error("page unreadable");
      return "state.a";
    });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [inspect], decide, executeTool, captureStateDigest });

    expect(result).toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(ofTool(shownAt(decide, 2), "core.request_check")[0]!.value).not.toHaveProperty("pageUnchanged");
  });
});

describe("an amendment that withdraws a step that worked", () => {
  it("is recorded with the position it withdrew", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act", toolId: "act", input: { choose: "store" } })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true }));

    await runAutomationStudioLlmEvidenceLoop({ tools: [inspect, act], decide, executeTool, dryRun: false });

    const amendment = historyRows(shownAt(decide, 2)).find((row) => row[1] === "amendment")!;
    expect(amendment.slice(0, 2)).toEqual([2, "amendment"]);
    expect(JSON.stringify(amendment)).toContain('"withdrewChanged":[1]');
  });
});
