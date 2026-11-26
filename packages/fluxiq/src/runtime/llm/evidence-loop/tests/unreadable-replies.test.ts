// A reply that arrived and could not be read is asked again, with a note of
// what could not be read, and no run of them ends the loop (t1056). And a reply that was read but is no decision the iteration offered is
// asked again too, rather than ending the loop as a bare `invalid_decision`
// (t211).
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop
} from "../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };
const look = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area: callId } });
const usage = { inputTokens: 900, outputTokens: 560, totalTokens: 1460, estimatedCostUsd: 0.002 };
const malformed = (replyCase = "content_mismatched") => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: replyCase as "content_mismatched", finishReason: "stop", contentChars: 2100, usage });
const stalledError = new Error("stalled");
/** The count of unreadable replies in a row that once ended a loop (t1056 removed it). */
const OLD_UNREADABLE_IN_A_ROW = 6;

type Shown = { evidence: ReadonlyArray<{ toolId: string; value: unknown }> };
const feedbackOf = (call: [Shown] | undefined) => call?.[0].evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID)?.value as Record<string, unknown> | undefined;

describe("an unreadable reply", () => {
  it("prefers explicit paid usage over legacy reply usage without charging or tracing it twice", async () => {
    const explicit = { inputTokens: 100, outputTokens: 10, totalTokens: 110, estimatedCostUsd: 0.001 };
    const error = new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: "content_mismatched", finishReason: "stop", contentChars: 2100, usage }, undefined, explicit);
    const decide = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({}), unusableDecisions: { stalled: () => new Error("stalled") } });
    expect(result.ok).toBe(true);
    expect(result.accounting).toMatchObject({ inputTokens: 100, outputTokens: 10, totalTokens: 110, estimatedCostUsd: 0.001 });
    expect(result.trace[0]).toMatchObject({ decision: "unusable", resultReason: "content_mismatched", usage: explicit });
  });

  it("is asked again with the same context and a note of what could not be read, and the build carries on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValueOnce(malformed())
      .mockResolvedValueOnce(complete);
    const stalled = vi.fn(() => stalledError);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, 
      unusableDecisions: { stalled }
    });

    expect(result).toMatchObject({ ok: true, result: { done: true } });
    expect(stalled).not.toHaveBeenCalled();
    // The retry is the same question: the same evidence, plus the note.
    const [, second, third] = decide.mock.calls as Array<[Shown]>;
    const before = second![0].evidence.map((entry) => entry.toolId).filter((toolId) => toolId !== AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID && toolId !== "core.evidence_history");
    const after = third![0].evidence.map((entry) => entry.toolId).filter((toolId) => toolId !== AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID && toolId !== "core.evidence_history");
    expect(after).toEqual(before);
    expect(feedbackOf(third)).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.reply_unreadable",
      issueCodes: ["llm.provider_malformed_response"],
      unreadable: { case: "content_mismatched", said: expect.stringContaining("brackets did not match") },
      unreadableInARow: 1,
      
      instruction: expect.stringContaining("Your previous reply could not be read: its brackets did not match")
    });
    // Paid for and counted: the decision, its tokens and its cost.
    expect(result.accounting).toMatchObject({ iterations: 3, outputTokens: 560, estimatedCostUsd: 0.002 });
    expect(result.trace[1]).toMatchObject({ iteration: 2, decision: "unusable", resultCode: "llm.provider_malformed_response", resultReason: "content_mismatched", usage });
  });

  it("never moves the no-progress guard: a run longer than it does not stall the loop", async () => {
    const decide = vi.fn().mockResolvedValueOnce(look("call.1"));
    for (let index = 0; index < 4; index += 1) decide.mockRejectedValueOnce(malformed());
    decide.mockResolvedValueOnce(complete);
    const stalled = vi.fn(() => stalledError);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, 
      unusableDecisions: { stalled }
    });

    expect(result).toMatchObject({ ok: true });
    expect(stalled).not.toHaveBeenCalled();
    // And no stall redirection was put in front of the model for it.
    expect((decide.mock.calls as Array<[Shown]>).some(([call]) => call.evidence.some((entry) => entry.toolId === "core.no_progress"))).toBe(false);
  });

  it("starts its count again after any reply that was read", async () => {
    const decide = vi.fn();
    for (let index = 0; index < 5; index += 1) decide.mockRejectedValueOnce(malformed());
    decide.mockResolvedValueOnce(look("call.1"));
    for (let index = 0; index < 5; index += 1) decide.mockRejectedValueOnce(malformed("content_unclosed"));
    decide.mockResolvedValueOnce(complete);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, 
      unusableDecisions: { stalled: () => stalledError }
    });

    expect(result).toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledTimes(12);
  });
});

describe("unreadable replies that keep coming", () => {
  // No count of them ends a loop (t1056): the old six in a row, `llm_evidence_loop.unreadable_replies`, is gone. Each is
  // asked again on the same model and paid for; the same unreadable reply again is a repeat loop detection steers.
  it("are each asked again far past the old six in a row, steered, until a readable reply", async () => {
    const many = OLD_UNREADABLE_IN_A_ROW * 4;
    let asked = 0;
    const decide = vi.fn(async () => {
      asked += 1;
      if (asked === 1) return look("call.1");
      if (asked <= 1 + many) throw malformed();
      return complete;
    });
    const stalled = vi.fn(() => stalledError);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true,
      unusableDecisions: { stalled }
    });

    expect(result).toMatchObject({ ok: true, result: { done: true } });
    expect(stalled).not.toHaveBeenCalled();
    expect(result.trace.filter((row) => row.decision === "unusable")).toHaveLength(many);
    // Paid for, every one.
    expect(result.accounting).toMatchObject({ iterations: many + 2, outputTokens: 560 * many });
    // The same reply again is caught as a repeat and the model asked to decide; no note counts down to a stop.
    const shown = (decide.mock.calls as unknown as Array<[Shown]>).flatMap(([call]) => call.evidence);
    expect(shown.some((entry) => entry.toolId === "core.loop_check")).toBe(true);
    for (const entry of shown.filter((item) => item.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID)) {
      expect(entry.value).not.toHaveProperty("maxUnreadableInARow");
      expect(String((entry.value as { instruction?: unknown }).instruction)).not.toContain("stop this build");
    }
  });

  it("take no limit from a caller: a figure an old caller passes neither refuses the loop nor bounds it", async () => {
    let asked = 0;
    const decide = vi.fn(async () => (asked += 1) <= 10 ? Promise.reject(malformed()) : complete);
    const input = { tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 8, unusableDecisions: { maxUnreadableInARow: 2, stalled: () => stalledError } };
    await expect(runAutomationStudioLlmEvidenceLoop(input as unknown as Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0])).resolves.toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledTimes(11);
  });

  it("are not counted as unreadable when nothing arrived: a timeout is the provider not answering", async () => {
    // Its own path since live run `run-muq05kas-058193f0` (`./provider-unavailable.test.ts`).
    const decide = vi.fn().mockRejectedValue(new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]));
    const stalled = vi.fn(() => stalledError);
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, 
      unusableDecisions: { stalled }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.provider_unavailable" });
    expect(decide).toHaveBeenCalledTimes(3);
    expect(stalled).not.toHaveBeenCalled();
  });
});

describe("a reply that was read and is no decision this iteration offered", () => {
  it("is asked again with the reason and the accepted shapes when its shape is not a decision", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      // A tool call carrying a key the grammar does not list.
      .mockResolvedValueOnce({ ...look("call.2"), reason: "the next page", usage })
      .mockResolvedValueOnce(complete);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, 
      unusableDecisions: { stalled: () => stalledError }
    });

    expect(result).toMatchObject({ ok: true, accounting: { outputTokens: 560 } });
    expect(feedbackOf((decide.mock.calls as Array<[Shown]>)[2])).toMatchObject({
      code: "llm_evidence_loop.decision_unusable",
      issueCodes: ["llm_evidence_loop.decision_shape_invalid"],
      instruction: expect.stringContaining("not one of the accepted shapes")
    });
  });

  it("is asked again when it finishes before finishing was offered", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(complete)
      .mockResolvedValueOnce(look("call.1"))
      .mockResolvedValueOnce(complete);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, minToolCalls: 1,
      unusableDecisions: { stalled: () => stalledError }
    });

    expect(result).toMatchObject({ ok: true, result: { done: true } });
    expect(result.trace[0]).toMatchObject({ decision: "unusable", resultCode: "llm_evidence_loop.complete_not_offered" });
    expect(feedbackOf((decide.mock.calls as Array<[Shown]>)[1])).toMatchObject({
      issueCodes: ["llm_evidence_loop.complete_not_offered"],
      instruction: expect.stringContaining("Finishing was not offered")
    });
  });

  it("still ends invalid_decision where the loop does not ask again", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide: async () => ({ kind: "finish" }), executeTool: async () => ({})
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision" });
  });

  // The same wrong shape again is a step without progress, which ends nothing (t1049); the unusable streak's
  // backstop is what stalls it.
  // No backstop on a streak (t1056): the same wrong shape is asked again each time, until a decision the loop can use.
  it("asks again when the same wrong shape keeps coming, however long, and never stalls", async () => {
    let asked = 0;
    const decide = vi.fn(async () => (asked += 1) <= 20 ? { kind: "finish" } : complete);
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, 
      unusableDecisions: { stalled: () => stalledError }
    })).resolves.toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledTimes(21);
  });
});
