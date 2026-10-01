// A model provider that stops answering ends the loop after three unanswered
// calls in a row, as `llm_evidence_loop.provider_unavailable`; one unanswered
// call followed by an answer is a moment, and the loop carries on. Nothing is
// said to the model about either: it made no decision to correct.
//
// Live run `run-muq05kas-058193f0` (2026-10-01, a DeepSeek outage): eight
// decisions in a row waited out their 45-second deadline, each answered to the
// model as its own unusable decision, then the round stalled and the build
// began a second one.
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW,
  AutomationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop
} from "../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };
const look = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area: callId } });
const unanswered = (code = "llm.provider_timeout") => new AutomationStudioLlmUnusableDecisionError([code]);
const malformed = () => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: "content_mismatched", finishReason: "stop", contentChars: 2100 });

type Shown = { evidence: ReadonlyArray<{ toolId: string; value: unknown }> };
const toldTheModel = (calls: Array<[Shown]>) => calls.some(([request]) => request.evidence.some((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID));

async function run(decide: ReturnType<typeof vi.fn>) {
  const stalled = vi.fn(() => new Error("stalled"));
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 12,
    unusableDecisions: { maxConsecutive: 8, stalled }
  });
  return { result, stalled };
}

describe("a model provider that does not answer", () => {
  it("ends the loop after three unanswered calls in a row, as exactly that, and tells the model nothing", async () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW).toBe(3);
    const decide = vi.fn().mockResolvedValueOnce(look("call.1")).mockRejectedValue(unanswered());
    const { result, stalled } = await run(decide);

    expect(decide).toHaveBeenCalledTimes(4);
    expect(stalled).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.provider_unavailable",
      providerUnavailable: { inARow: 3, codes: ["llm.provider_timeout"], said: "it did not answer before the time allowed for each request ran out" }
    });
    expect(toldTheModel(decide.mock.calls as Array<[Shown]>)).toBe(false);
    expect(result.trace.filter((row) => row.decision === "unusable").map((row) => row.resultCode)).toEqual(["llm.provider_timeout", "llm.provider_timeout", "llm.provider_timeout"]);
  });

  it("counts an unreachable network, a server error and a rate limit the same way", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(unanswered("llm.provider_network_error"))
      .mockRejectedValueOnce(unanswered("llm.provider_http_error"))
      .mockRejectedValueOnce(unanswered("llm.provider_network_error"));
    const { result } = await run(decide);
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.provider_unavailable", providerUnavailable: { inARow: 3, codes: ["llm.provider_network_error", "llm.provider_http_error"], said: "it could not be reached" } });
  });

  it("carries on after an unanswered call that an answer follows", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(unanswered())
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValueOnce(unanswered())
      .mockRejectedValueOnce(unanswered())
      .mockResolvedValueOnce(look("call.2"))
      .mockRejectedValueOnce(unanswered())
      .mockResolvedValueOnce(complete);
    const { result } = await run(decide);
    expect(result).toMatchObject({ ok: true, result: { done: true } });
    expect(decide).toHaveBeenCalledTimes(7);
  });

  it("is broken by a reply that arrived, even one that could not be read", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(unanswered())
      .mockRejectedValueOnce(unanswered())
      .mockRejectedValueOnce(malformed())
      .mockRejectedValueOnce(unanswered())
      .mockRejectedValueOnce(unanswered())
      .mockResolvedValueOnce(look("call.1"))
      .mockResolvedValueOnce(complete);
    const { result } = await run(decide);
    expect(result).toMatchObject({ ok: true, result: { done: true } });
  });
});
