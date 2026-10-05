// A finished run that asked no model anything states its zero cost, in the
// same save as its verdict, and is handed to the replay recorder. Before t176
// only the recovery wrote `llmGate.costAccounting`, so a clean deterministic
// replay kept no count and could never be certified (lane t179).

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioZeroProviderGate } from "../zero-provider-run.ts";
import { ANSWER, harness, provider, runDetail, session, verify } from "./run-outcome-harness.ts";

const ZERO_GATE = { invoked: false, ok: true, costAccounting: { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, pendingCalls: 0 }, providerCalls: [], providerCallsOmitted: 0 };
const TRACE = { status: "succeeded", attempts: [] } as never;

describe("the gate of a run that asked no model anything", () => {
  it("is a zero accounting in the recovery gate's own shape, with no refusal code", () => {
    const gate = automationStudioZeroProviderGate(runDetail(), [], true);
    expect(gate).toEqual(ZERO_GATE);
    expect(gate).not.toHaveProperty("code");
  });

  it("is never written for a run that asked: a recovery's gate, an intervention on the run, or this verification's own", () => {
    const withGate = { ...runDetail(), metadata: { llmGate: { invoked: true } } } as AutomationStudioFlowRunDetail;
    const withIntervention = { ...runDetail(), interventions: [{ interventionId: "diagnosis" }] } as unknown as AutomationStudioFlowRunDetail;
    expect(automationStudioZeroProviderGate(withGate, [], true)).toBeUndefined();
    expect(automationStudioZeroProviderGate(withIntervention, [], true)).toBeUndefined();
    expect(automationStudioZeroProviderGate(runDetail(), [{ interventionId: "verification" }], true)).toBeUndefined();
  });

  it("keeps absent or unfinished current verification evidence unknown", () => {
    expect(automationStudioZeroProviderGate(runDetail(), [])).toBeUndefined();
    expect(automationStudioZeroProviderGate(runDetail(), [], false)).toBeUndefined();
  });
});

describe("a finished run's verification, for a run that asked no model anything", () => {
  it("never certifies zero or records a replay when a dispatched provider question remains pending at the verification deadline", async () => {
    vi.useFakeTimers();
    const context = harness();
    const configured = provider(ANSWER.yes, context.requests);
    let release!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => { release = resolve; });
    const dispatch = vi.fn<typeof configured.runTask>(async (request) => { context.requests.push(request); return await pending; });
    configured.runTask = dispatch;
    context.ports.resolveProvider = async () => ({ provider: configured });
    const record = vi.fn(async () => undefined);
    context.ports.recordAdaptationReplays = record;
    try {
      const running = verify(context, { verificationDeadlineMs: 20, session: session({ trace: TRACE }) });
      await vi.advanceTimersByTimeAsync(0);
      expect(dispatch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(21);
      const next = await running;
      expect(next.status).toBe("succeeded");
      const detail = context.saved.at(-1);
      expect(detail?.metadata?.resultVerification).toMatchObject({ performed: false, code: "core.result.verification_did_not_finish" });
      expect.soft(detail?.metadata?.llmGate).not.toEqual(ZERO_GATE);
      expect.soft(record).not.toHaveBeenCalled();
    } finally {
      const writes = context.saved.length;
      const request = context.requests[0];
      if (request) release(await provider(ANSWER.yes, []).runTask(request));
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
      expect(context.saved).toHaveLength(writes);
    }
  });

  it("does not invent a dispatched call when harness preflight refuses the question unsent", async () => {
    const context = harness();
    const configured = provider(ANSWER.yes, context.requests);
    const dispatch = vi.fn(configured.runTask);
    configured.runTask = dispatch;
    configured.measureInput = () => ({ estimatedInputTokens: Number.MAX_SAFE_INTEGER, estimatedInputBytes: Number.MAX_SAFE_INTEGER });
    context.ports.resolveProvider = async () => ({ provider: configured });
    await verify(context);
    expect(dispatch).not.toHaveBeenCalled();
    expect(context.requests).toHaveLength(0);
    const detail = context.saved.at(-1);
    expect(detail?.metadata?.llmGate).toBeUndefined();
    expect(detail?.interventions).toHaveLength(1);
    expect(detail?.interventions[0]?.provider).toBeUndefined();
    expect(detail?.interventions[0]?.tokenUsage).toBeUndefined();
    expect(detail?.interventions[0]?.validation?.issues?.some((issue) => issue.includes("llm_budget.input_limit_exceeded"))).toBe(true);
  });

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
