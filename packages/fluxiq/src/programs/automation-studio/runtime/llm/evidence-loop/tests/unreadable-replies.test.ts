// A reply that arrived and could not be read is asked again, with a note of
// what could not be read, and only an unbroken run of them ends the loop --
// as `llm_evidence_loop.unreadable_replies`, with how many tries and which
// kinds. And a reply that was read but is no decision the iteration offered is
// asked again too, rather than ending the loop as a bare `invalid_decision`
// (t211).
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW,
  AutomationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop
} from "../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };
const look = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area: callId } });
const usage = { inputTokens: 900, outputTokens: 560, totalTokens: 1460, estimatedCostUsd: 0.002 };
const malformed = (replyCase = "content_mismatched") => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: replyCase as "content_mismatched", finishReason: "stop", contentChars: 2100, usage });
const stalledError = new Error("stalled");

type Shown = { evidence: ReadonlyArray<{ toolId: string; value: unknown }> };
const feedbackOf = (call: [Shown] | undefined) => call?.[0].evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID)?.value as Record<string, unknown> | undefined;

describe("an unreadable reply", () => {
  it("prefers explicit paid usage over legacy reply usage without charging or tracing it twice", async () => {
    const explicit = { inputTokens: 100, outputTokens: 10, totalTokens: 110, estimatedCostUsd: 0.001 };
    const error = new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: "content_mismatched", finishReason: "stop", contentChars: 2100, usage }, undefined, explicit);
    const decide = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({}), unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") } });
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
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10,
      unusableDecisions: { maxConsecutive: 3, stalled }
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
      maxUnreadableInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW,
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
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10,
      unusableDecisions: { maxConsecutive: 2, stalled }
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
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 20,
      unusableDecisions: { stalled: () => stalledError }
    });

    expect(result).toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledTimes(12);
  });
});

describe("unreadable replies that keep coming", () => {
  it("end the loop after the run's limit, as exactly that, with how many tries and which kinds", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValueOnce(malformed("content_unclosed"))
      .mockRejectedValue(malformed());
    const stalled = vi.fn(() => stalledError);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 30,
      unusableDecisions: { stalled }
    });

    const limit = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW;
    expect(decide).toHaveBeenCalledTimes(1 + limit);
    expect(stalled).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.unreadable_replies",
      unreadable: { inARow: limit, total: limit, cases: ["content_mismatched", "content_unclosed"], said: expect.stringContaining("brackets did not match") },
      accounting: { iterations: 1 + limit, toolCalls: 1, outputTokens: 560 * limit }
    });
    // The draft and the trace travel with the ending, as with any other.
    expect(result.trace.filter((row) => row.decision === "unusable")).toHaveLength(limit);
  });

  it("take the limit a caller sets, held to the loop's own iterations", async () => {
    const decide = vi.fn().mockRejectedValue(malformed());
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 8,
      unusableDecisions: { maxUnreadableInARow: 2, stalled: () => stalledError }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.unreadable_replies", unreadable: { inARow: 2 } });
    expect(decide).toHaveBeenCalledTimes(2);
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), maxIterations: 8,
      unusableDecisions: { maxUnreadableInARow: 9, stalled: () => stalledError }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
  });

  it("are not counted as unreadable when nothing arrived: a timeout is the provider not answering", async () => {
    // Its own path since live run `run-muq05kas-058193f0` (`./provider-unavailable.test.ts`).
    const decide = vi.fn().mockRejectedValue(new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]));
    const stalled = vi.fn(() => stalledError);
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 20,
      unusableDecisions: { maxConsecutive: 8, stalled }
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
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10,
      unusableDecisions: { maxConsecutive: 3, stalled: () => stalledError }
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
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10, minToolCalls: 1,
      unusableDecisions: { maxConsecutive: 3, stalled: () => stalledError }
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

  it("ends on the caller's stall when the same wrong shape keeps coming", async () => {
    const decide = vi.fn().mockResolvedValue({ kind: "finish" });
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 10,
      unusableDecisions: { maxConsecutive: 3, stalled: () => stalledError }
    })).rejects.toBe(stalledError);
    expect(decide).toHaveBeenCalledTimes(3);
  });
});
