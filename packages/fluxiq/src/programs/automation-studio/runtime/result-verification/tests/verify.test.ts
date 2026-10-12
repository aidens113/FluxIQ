// A check whose call did not come back for a temporary reason is asked again
// (t473, live run `run-mv5q4j5c-49bfb5e2`: a judge cut off at 19,985 ms was
// never asked again). No model is called: the provider is scripted per call.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../../llm/build-purse/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { automationStudioResultVerificationDeadlineMs, AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS } from "../deadline.ts";
import { RUN_MUW60J7C_REQUEST, runMuw60j7cRunSummary } from "../request-rows/tests/run-muw60j7c.ts";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK, verifyAutomationStudioRunResult } from "../verify.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", expected: "Only earbuds.", observed: "Two accessories are kept.", changed: "Leave out the accessories." };

/** What one scripted call does: answer with a diagnosis, or fail as `fault` says. */
type Call = { answer: Record<string, unknown> } | { fault: "timeout" | "unavailable" | "untyped" };

/** A provider that plays `calls` in order, recording what each was sent. */
function scripted(calls: readonly Call[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const call = calls[seen.length];
        seen.push(request);
        if (!call) throw new Error("no call scripted");
        if ("answer" in call) return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
        if (call.fault === "timeout") throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
        if (call.fault === "unavailable") throw new AutomationStudioLlmProviderError("llm.provider_http_error", "Provider unavailable.", true, 503);
        throw new Error("something unexplained");
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider, ...extra });

afterEach(() => { vi.useRealTimers(); });

describe("a verification check that did not come back", () => {
  it("is asked again after a timeout, with the same evidence, and the answer it then gives stands", async () => {
    const { provider, seen } = scripted([{ fault: "timeout" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(3);
    expect(seen[1]?.context.resultSummary).toEqual(seen[0]?.context.resultSummary);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", calls: 2 });
    // Every ask is a call on record: the timed-out one, its re-ask, and the second check.
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [1, 2], [2, undefined]]);
    expect(new Set(report.interventions.map((intervention) => intervention.interventionId)).size).toBe(3);
  });

  it("is asked again after a temporary provider fault its own retries could not get past", async () => {
    vi.useFakeTimers();
    // Three attempts inside the first call (the provider retry policy's), then the re-ask answers.
    const { provider, seen } = scripted([{ fault: "unavailable" }, { fault: "unavailable" }, { fault: "unavailable" }, { answer: NO }, { answer: NO }]);
    const pending = verify(provider);
    await vi.advanceTimersByTimeAsync(10_000);
    const report = await pending;
    expect(seen).toHaveLength(5);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer" });
    expect(report.interventions).toHaveLength(3);
  });

  it("asks the second check again too, so a no it then repeats refutes rather than staying unsure", async () => {
    const { provider, seen } = scripted([{ answer: NO }, { fault: "timeout" }, { answer: NO }]);
    const report = await verify(provider, { confirmAnswer: true });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [2, undefined], [2, 2]]);
  });

  it("is asked at most twice: a check that timed out twice gives no answer, and is never a refutation", async () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK).toBe(2);
    const { provider, seen } = scripted([{ fault: "timeout" }, { fault: "timeout" }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    expect(report.outcome.reason).toContain("ran out of time");
    expect(report.interventions).toHaveLength(2);
  });

  it("is not asked again after a fault that is not temporary, or once the run is cancelled", async () => {
    const untyped = scripted([{ fault: "untyped" }, { answer: NO }]);
    expect((await verify(untyped.provider)).outcome).toMatchObject({ basis: "model_unavailable" });
    expect(untyped.seen).toHaveLength(1);

    const controller = new AbortController();
    const cancelled: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        cancelled.push(request);
        controller.abort();
        throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
      }
    };
    await verify(provider, { signal: controller.signal });
    expect(cancelled).toHaveLength(1);
  });

  it("charges each ask to the Flow's purse", async () => {
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, carriedUsd: 0, onSettled: (usd) => charged.push(usd) });
    const { provider } = scripted([{ fault: "timeout" }, { answer: NO }, { answer: NO }]);
    await automationStudioLlmFlowPurseScope(flow, async () => await verify(provider));
    // Three calls settle: the timed-out one at its hold (its cost is not known), and the two that answered at what they reported.
    expect(charged).toHaveLength(3);
    expect(flow.spentCalls()).toBe(3);
  });
});

describe("the deadline a verification runs under", () => {
  it("fits every ask at the per-call timeout, and is the default without one", () => {
    expect(automationStudioResultVerificationDeadlineMs(undefined)).toBe(AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS);
    expect(automationStudioResultVerificationDeadlineMs(20_000)).toBe(AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS);
    // A build's 45 s calls: two checks, each asked twice, and the reads around them.
    expect(automationStudioResultVerificationDeadlineMs(45_000)).toBe(4 * 45_000 + 30_000);
  });
});
