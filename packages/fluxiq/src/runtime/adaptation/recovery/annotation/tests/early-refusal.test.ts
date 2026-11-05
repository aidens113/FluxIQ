import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../../../framework/automation-service/service.ts";
import { automationStudioRecoveryEarlyRefusal } from "../early-refusal.ts";

const detail = { summary: { runId: "run.1" }, actionAttempts: [], metadata: {} } as unknown as AutomationStudioFlowRunDetail;
const context = { behavior: { invokeLlm: true }, budgetDecision: { ok: true } } as unknown as AutomationStudioRuntimeAdaptationContext;

const inner = (failure: { category: string; code: string }) => ({ attemptId: "a.2", nodeId: "inner", definitionId: "example.press", status: "failed", failure });
type Failed = NonNullable<Parameters<typeof automationStudioRecoveryEarlyRefusal>[0]["failedTraceAttempt"]>;
const callAttempt = (subflowId: string, innerAttempt: ReturnType<typeof inner>): Failed => ({ nodeId: "call", definitionId: "builtin.control.call-subflow", status: "failed", subflowTarget: { subflowId }, childTrace: { attempts: [innerAttempt] } });
const refusal = (failedTraceAttempt: Failed) => automationStudioRecoveryEarlyRefusal({ detail, context, inRun: false, refutedResult: false, failedTraceAttempt, explicitRunBudget: true });

describe("the recovery after a failed run, for a call to a saved part", () => {
  it.each([
    ["a permission gate", { category: "external_side_effect_denied", code: "example.press.denied" }],
    ["a gone item", { category: "unexpected_state", code: "executor.target.gone" }]
  ])("asks no model when the part stopped at %s", (_what, failure) => {
    const refused = refusal(callAttempt("part:p1:v2", inner(failure)));
    expect(refused?.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.gate.stopped_safely" });
  });

  it("goes on to the model for a real broken step inside the part", () => {
    expect(refusal(callAttempt("part:p1:v2", inner({ category: "unexpected_state", code: "example.press.refused" })))).toBeUndefined();
  });

  it("reads a Flow's own Subflow as it always has", () => {
    expect(refusal(callAttempt("subflow.own", inner({ category: "external_side_effect_denied", code: "example.press.denied" })))).toBeUndefined();
  });
});
