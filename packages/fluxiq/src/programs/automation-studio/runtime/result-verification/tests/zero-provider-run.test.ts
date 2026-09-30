// A finished run that asked no model anything states its zero cost, in the
// same save as its verdict, and is handed to the replay recorder. Before t176
// only the recovery wrote `llmGate.costAccounting`, so a clean deterministic
// replay kept no count and could never be certified (lane t179).

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioZeroProviderGate } from "../zero-provider-run.ts";
import { ANSWER, harness, runDetail, session, verify } from "./run-outcome-harness.ts";

const ZERO_GATE = { invoked: false, ok: true, costAccounting: { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, pendingCalls: 0 }, providerCalls: [], providerCallsOmitted: 0 };
const TRACE = { status: "succeeded", attempts: [] } as never;

describe("the gate of a run that asked no model anything", () => {
  it("is a zero accounting in the recovery gate's own shape, with no refusal code", () => {
    const gate = automationStudioZeroProviderGate(runDetail(), []);
    expect(gate).toEqual(ZERO_GATE);
    expect(gate).not.toHaveProperty("code");
  });

  it("is never written for a run that asked: a recovery's gate, an intervention on the run, or this verification's own", () => {
    const withGate = { ...runDetail(), metadata: { llmGate: { invoked: true } } } as AutomationStudioFlowRunDetail;
    const withIntervention = { ...runDetail(), interventions: [{ interventionId: "diagnosis" }] } as unknown as AutomationStudioFlowRunDetail;
    expect(automationStudioZeroProviderGate(withGate, [])).toBeUndefined();
    expect(automationStudioZeroProviderGate(withIntervention, [])).toBeUndefined();
    expect(automationStudioZeroProviderGate(runDetail(), [{ interventionId: "verification" }])).toBeUndefined();
  });
});

describe("a finished run's verification, for a run that asked no model anything", () => {
  it("writes the zero gate in the verdict's own save, and hands the run to the replay recorder once", async () => {
    const context = harness({ withProvider: false });
    const record = vi.fn(async () => undefined);
    context.ports.recordAdaptationReplays = record;
    await verify(context, { session: session({ trace: TRACE, finishedAt: 500 }), subflowId: "subflow" });
    expect(context.saved).toHaveLength(1);
    expect(context.saved[0]?.metadata).toMatchObject({ llmGate: ZERO_GATE, resultVerification: { performed: false } });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", runId: session().runId, checkedAt: 500, trace: TRACE, subflowId: "subflow" }));
  });

  it("writes no gate and records no replay for a run whose result a model judged", async () => {
    const context = harness({ answer: ANSWER.yes });
    const record = vi.fn(async () => undefined);
    context.ports.recordAdaptationReplays = record;
    await verify(context, { session: session({ trace: TRACE }) });
    expect(context.saved.at(-1)?.metadata?.llmGate).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });

  it("never fails the run over a replay store that refused the write", async () => {
    const context = harness({ withProvider: false });
    context.ports.recordAdaptationReplays = async () => { throw new Error("store unavailable"); };
    const next = await verify(context, { session: session({ trace: TRACE }) });
    expect(next.status).toBe("succeeded");
  });
});
