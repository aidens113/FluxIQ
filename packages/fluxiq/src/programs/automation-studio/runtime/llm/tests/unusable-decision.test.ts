// A decision call that came back unusable is asked again, and a run of them
// ends the loop under the caller's own name.
//
// Flow Bootstrap used to stop at the first bad reply: its loop propagated every
// decision error, so one malformed object from the model ended the whole
// creation. These pin the two halves of the fix -- which failed calls count as
// "unusable" (the same line the execution grant draws), and what the loop does
// with one.

import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmTaskResultSpentWithoutDecision,
  automationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmTaskResult
} from "../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };
const look = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area: callId } });

function failed(codes: Array<{ code: string; status?: number }>, reached = true): AutomationStudioLlmTaskResult {
  return {
    ok: false,
    request: { requestId: "request.1", estimatedInputTokens: 10 },
    ...(reached ? { provider: { provider: "deepseek", model: "deepseek-chat" } } : {}),
    diagnostics: [
      { severity: "warning", code: "instruction.note", message: "Not an error." },
      ...codes.map(({ code, status }) => ({ severity: "error" as const, code, message: "withheld", ...(status !== undefined ? { metadata: { providerStatus: status } } : {}) }))
    ]
  } as unknown as AutomationStudioLlmTaskResult;
}

describe("which failed decision calls are unusable rather than final", () => {
  it.each([
    ["a malformed reply", [{ code: "llm.provider_malformed_response" }]],
    ["a reply that failed Core's checks", [{ code: "llm_output.kind_mismatch" }]],
    ["a timeout", [{ code: "llm.provider_timeout" }]],
    ["a rate limit", [{ code: "llm.provider_rate_limited", status: 429 }]],
    ["a server error", [{ code: "llm.provider_http_error", status: 503 }]]
  ])("asks again after %s", (_label, codes) => {
    const result = failed(codes);
    expect(automationStudioLlmTaskResultSpentWithoutDecision(result)).toBe(true);
    expect(automationStudioLlmUnusableDecisionError(result)).toBeInstanceOf(AutomationStudioLlmUnusableDecisionError);
    expect(automationStudioLlmUnusableDecisionError(result)?.issueCodes).toEqual(codes.map(({ code }) => code));
  });

  it.each([
    ["a rejected credential", [{ code: "llm.provider_auth_failed", status: 401 }]],
    ["a cancellation", [{ code: "llm.provider_aborted" }]],
    ["a refused credential check", [{ code: "llm.provider_secret_unavailable" }]],
    ["a pre-flight refusal", [{ code: "llm.provider_input_budget_exceeded" }]],
    ["an untyped failure, such as a grant that is gone", [{ code: "llm.provider_request_failed" }]],
    ["a usage breach", [{ code: "llm_usage.total_limit_exceeded" }]],
    ["a client error", [{ code: "llm.provider_http_error", status: 400 }]],
    ["an unusable reply beside an authorization failure", [{ code: "llm.provider_malformed_response" }, { code: "llm.provider_auth_failed", status: 401 }]]
  ])("ends on %s", (_label, codes) => {
    const result = failed(codes);
    expect(automationStudioLlmTaskResultSpentWithoutDecision(result)).toBe(false);
    expect(automationStudioLlmUnusableDecisionError(result)).toBeUndefined();
  });

  it("ends when the provider was never reached, whatever the code", () => {
    expect(automationStudioLlmUnusableDecisionError(failed([{ code: "llm.provider_malformed_response" }], false))).toBeUndefined();
  });

  it("carries issue codes only, and drops anything that is not one", () => {
    const error = new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout", "the model said: <secret>"]);
    expect(error.issueCodes).toEqual(["llm.provider_timeout"]);
    expect(error.message).not.toContain("secret");
  });
});

describe("the evidence loop after an unusable decision", () => {
  const unusable = () => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"]);

  it("spends the iteration, records it, and asks again", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(unusable())
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValueOnce(unusable())
      .mockRejectedValueOnce(unusable())
      .mockResolvedValueOnce(complete);
    const stalled = vi.fn(() => new Error("stalled"));

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true,
      unusableDecisions: { maxConsecutive: 3, stalled }
    });

    // Two in a row, then a usable decision: the streak never reached three.
    expect(result).toMatchObject({ ok: true, result: { done: true }, accounting: { iterations: 5, toolCalls: 1 } });
    expect(result.trace.map((step) => step.decision)).toEqual(["unusable", "tool_call", "unusable", "unusable", "complete"]);
    expect(result.trace[0]).toEqual({ iteration: 1, decision: "unusable", resultCode: "llm.provider_malformed_response" });
    expect(decide.mock.calls.map(([call]) => call.iteration)).toEqual([1, 2, 3, 4, 5]);
    expect(stalled).not.toHaveBeenCalled();
  });

  it("ends on the caller's own error once the streak is reached, with the progress so far", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValue(unusable());
    const stalledError = new Error("named outcome");
    const stalled = vi.fn((_progress: unknown) => stalledError);

    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 20,
      unusableDecisions: { maxConsecutive: 3, stalled }
    })).rejects.toBe(stalledError);

    expect(decide).toHaveBeenCalledTimes(4);
    expect(stalled).toHaveBeenCalledTimes(1);
    const progress = stalled.mock.calls[0]![0] as { issueCodes: string[]; trace: Array<{ decision: string }>; accounting: { iterations: number; toolCalls: number } };
    expect(progress.issueCodes).toEqual(["llm.provider_malformed_response"]);
    expect(progress.trace.map((step) => step.decision)).toEqual(["tool_call", "unusable", "unusable", "unusable"]);
    expect(progress.accounting).toMatchObject({ iterations: 4, toolCalls: 1 });
  });

  it("returns invalid_decision on the streak when errors are not propagated", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide: async () => { throw unusable(); }, executeTool: async () => ({}),
      unusableDecisions: { maxConsecutive: 2, stalled: () => new Error("stalled") }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision", accounting: { iterations: 2 } });
  });

  it("is still bounded by the loop's iterations, each unusable decision being one of them", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(unusable())
      .mockResolvedValueOnce(look("call.1"))
      .mockRejectedValueOnce(unusable());
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 3,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", accounting: { iterations: 3 } });
    expect(decide).toHaveBeenCalledTimes(3);
  });

  it("treats every other decision error as before, and the unusable error too when not configured", async () => {
    const final = new Error("grant gone");
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide: async () => { throw final; }, executeTool: async () => ({}), propagateDecisionErrors: true,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    })).rejects.toBe(final);
    const once = unusable();
    const decide = vi.fn().mockRejectedValue(once);
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true })).rejects.toBe(once);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("stops asking once cancelled", async () => {
    const controller = new AbortController();
    const decide = vi.fn(async () => {
      controller.abort();
      throw unusable();
    });
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), propagateDecisionErrors: true, signal: controller.signal,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.cancelled" });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1.5, 9])("refuses a streak of %s it cannot honour", async (maxConsecutive) => {
    const decide = vi.fn();
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({}), maxIterations: 8,
      unusableDecisions: { maxConsecutive, stalled: () => new Error("stalled") }
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
    expect(decide).not.toHaveBeenCalled();
  });
});

describe("the evidence loop after a completed result its caller refuses", () => {
  const refusal = (code: string) => ({ ok: false as const, issueCodes: [code], feedback: { ok: false, code: "completion_refused", issues: [{ code, path: "plan.subflows.0.nodes.1.parameters.selector" }] } });
  const initial = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" }, effect: "observe" as const, initialObservation: { input: {} } }];
  const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };

  it("tells the model why, as evidence, and asks again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 1 }, usage })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 2 }, usage });
    const checkCompletion = vi.fn(async (result: Record<string, unknown>) => result.attempt === 1 ? refusal("bootstrap.invalid_parameter_value") : { ok: true as const });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, checkCompletion,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    });

    expect(result).toMatchObject({ ok: true, result: { attempt: 2 }, accounting: { iterations: 2, inputTokens: 20 } });
    expect(result.trace).toEqual([
      expect.objectContaining({ iteration: 0, decision: "tool_call" }),
      { iteration: 1, decision: "unusable", resultCode: "bootstrap.invalid_parameter_value", usage },
      { iteration: 2, decision: "complete", usage }
    ]);
    // The second decision was asked with the refusal in its evidence.
    expect(decide.mock.calls[1]![0].evidence).toEqual([
      { callId: "initial.inspect", toolId: "inspect", value: { seen: true } },
      { callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.1`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: refusal("bootstrap.invalid_parameter_value").feedback }
    ]);
    expect(checkCompletion).toHaveBeenCalledTimes(2);
  });

  it("ends on the caller's error after refusals in a row, with the last refusal's codes", async () => {
    const decide = vi.fn(async () => ({ kind: "complete", result: { attempt: "again" } }));
    const stalled = vi.fn((_progress: unknown) => new Error("named outcome"));
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10,
      checkCompletion: () => refusal("bootstrap.missing_parameter"),
      unusableDecisions: { maxConsecutive: 3, stalled }
    })).rejects.toThrow("named outcome");
    expect(decide).toHaveBeenCalledTimes(3);
    expect(stalled.mock.calls[0]![0]).toMatchObject({ issueCodes: ["bootstrap.missing_parameter"], accounting: { iterations: 3, evidenceBytes: expect.any(Number) } });
  });

  it("shares the streak with bad replies", async () => {
    const decide = vi.fn()
      .mockRejectedValueOnce(new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]))
      .mockResolvedValueOnce({ kind: "complete", result: {} })
      .mockRejectedValueOnce(new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]));
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide, executeTool: async () => ({}), propagateDecisionErrors: true, maxIterations: 10,
      checkCompletion: () => refusal("bootstrap.invalid_plan"),
      unusableDecisions: { maxConsecutive: 3, stalled: (progress) => new Error(`stalled on ${progress.issueCodes.join(",")}`) }
    })).rejects.toThrow("stalled on llm.provider_timeout");
    expect(decide).toHaveBeenCalledTimes(3);
  });

  it("ends invalid_decision on a refusal when it is not asking again, and on an answer that is not a check", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}),
      checkCompletion: () => refusal("bootstrap.invalid_plan")
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision" });
    for (const answer of [undefined, { ok: "yes" }, { ok: true, extra: 1 }, { ok: false, issueCodes: ["x"] }, { ok: false, issueCodes: "x", feedback: {} }]) {
      await expect(runAutomationStudioLlmEvidenceLoop({
        tools: initial, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}),
        checkCompletion: () => answer as never,
        unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
      })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision" });
    }
  });

  it("treats a check that throws as a decision error", async () => {
    const thrown = new Error("validator broke");
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}), propagateDecisionErrors: true,
      checkCompletion: () => { throw thrown; },
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    })).rejects.toBe(thrown);
  });

  it("hands the check a copy, so what it changes is not what the loop returns", async () => {
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: initial, decide: async () => ({ kind: "complete", result: { plan: "original" } }), executeTool: async () => ({}),
      checkCompletion: (completed) => {
        completed.plan = "tampered";
        return { ok: true };
      }
    });
    expect(result).toMatchObject({ ok: true, result: { plan: "original" } });
  });
});
