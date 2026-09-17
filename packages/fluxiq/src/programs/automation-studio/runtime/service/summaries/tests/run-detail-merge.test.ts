import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowIntervention, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { runDetailPreservingStored } from "../run-detail-merge.ts";

function intervention(interventionId: string, extra: Partial<AutomationStudioFlowIntervention> = {}): AutomationStudioFlowIntervention {
  return { interventionId, kind: "diagnosis", reason: "failed", ...extra } as unknown as AutomationStudioFlowIntervention;
}

function action(attemptId: string, status: AutomationStudioFlowRunActionAttemptRecord["status"]): AutomationStudioFlowRunActionAttemptRecord {
  return { attemptId, nodeId: attemptId.split(".")[0]!, definitionId: "builtin.math.divide", order: 1, status, startedAt: 1 } as AutomationStudioFlowRunActionAttemptRecord;
}

function detail(input: Omit<Partial<AutomationStudioFlowRunDetail>, "summary"> & { runId?: string; summary?: Partial<AutomationStudioFlowRunDetail["summary"]> }): AutomationStudioFlowRunDetail {
  const { runId = "run.merge", summary, ...rest } = input;
  return {
    schemaVersion: "0.1",
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: [],
    ...rest,
    summary: {
      schemaVersion: "0.1",
      runId,
      flowId: "flow.merge",
      projectId: "project.merge",
      status: "failed",
      updatedAt: 10,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 0,
      interventionCount: 0,
      adaptationCount: 0,
      ...summary
    }
  };
}

// The bare session projection, as `runtimeSessionToFlowRunDetail` builds it.
function projection(metadata: JsonObject = {}): AutomationStudioFlowRunDetail {
  return detail({
    inputs: { denominator: "[withheld]" },
    actionAttempts: [action("divide.attempt.1", "failed")],
    recoveryAttempts: [],
    interventions: [intervention("divide.attempt.1.recovery.diagnosis")],
    summary: { metadata: { compatibilitySource: "runtime-session", targetKind: "flow", targetId: "flow.merge", effectCount: 0, recoveryAttemptCount: 0 } },
    metadata: { compatibilitySource: "runtime-session", targetKind: "flow", targetId: "flow.merge", recoveryAttemptCount: 0, comparisonCount: 1, ...metadata }
  });
}

function annotated(): AutomationStudioFlowRunDetail {
  const base = projection({ terminalFailureReason: "action_failed", message: "Division by zero." });
  return {
    ...base,
    interventions: [...base.interventions, intervention("intervention.diagnosis", { provider: "mock", tokenUsage: { totalTokens: 12 } }), intervention("intervention.patch", { provider: "mock", tokenUsage: { totalTokens: 30 } })],
    adaptationIds: ["adaptation.one"],
    changeProposalIds: ["proposal.one"],
    evidence: [{ evidenceId: "evidence.one" }] as unknown as NonNullable<AutomationStudioFlowRunDetail["evidence"]>,
    summary: { ...base.summary, flowVersion: "3", tokenUsage: { totalTokens: 42, estimatedCostUsd: 0.005 }, metadata: { ...base.summary.metadata, triggerKind: "grant", lastEventSequence: 9, errorCount: 1 } },
    metadata: {
      ...base.metadata,
      llmGate: { invoked: true, costAccounting: { calls: 2 }, providerCalls: [{ taskKind: "runtime_diagnosis" }] },
      runtimeAdaptationContext: { mode: "continuous_adaptive" },
      trainingMode: "continuous_adaptive",
      runtimePatchAttempts: [{ kind: "temporary_target_override" }],
      recoveryTrace: { stages: ["gather"] },
      adaptiveMetrics: { llmCallCount: 2 },
      eventStream: { lastSequence: 9, eventCount: 9 },
      collectionsPaged: true
    }
  };
}

describe("runDetailPreservingStored", () => {
  it("returns the incoming detail unchanged when nothing is stored, or the stored detail is another run's", () => {
    const incoming = projection();
    expect(runDetailPreservingStored(null, incoming)).toBe(incoming);
    expect(runDetailPreservingStored(detail({ runId: "run.other", metadata: { llmGate: { invoked: true } } }), incoming)).toBe(incoming);
  });

  it("keeps everything the recovery annotation added when the bare session projection is saved over it", () => {
    const merged = runDetailPreservingStored(annotated(), projection());

    expect(merged.metadata).toMatchObject({
      llmGate: { invoked: true, costAccounting: { calls: 2 }, providerCalls: [{ taskKind: "runtime_diagnosis" }] },
      runtimeAdaptationContext: { mode: "continuous_adaptive" },
      trainingMode: "continuous_adaptive",
      runtimePatchAttempts: [{ kind: "temporary_target_override" }],
      recoveryTrace: { stages: ["gather"] },
      compatibilitySource: "runtime-session"
    });
    expect(merged.interventions.map((item) => item.interventionId)).toEqual(["divide.attempt.1.recovery.diagnosis", "intervention.diagnosis", "intervention.patch"]);
    expect(merged.adaptationIds).toEqual(["adaptation.one"]);
    expect(merged.changeProposalIds).toEqual(["proposal.one"]);
    expect(merged.evidence).toEqual([{ evidenceId: "evidence.one" }]);
    expect(merged.summary).toMatchObject({ flowVersion: "3", tokenUsage: { totalTokens: 42, estimatedCostUsd: 0.005 } });
    expect(merged.summary.metadata).toMatchObject({ triggerKind: "grant", compatibilitySource: "runtime-session" });
  });

  it("drops a projection-owned key the incoming projection no longer sets, and never persists what a store recomputes or a read decorates", () => {
    const merged = runDetailPreservingStored(annotated(), projection({ message: "Adaptive retry succeeded." }));

    expect(merged.metadata).not.toHaveProperty("terminalFailureReason");
    expect(merged.metadata).toMatchObject({ message: "Adaptive retry succeeded." });
    expect(merged.metadata).not.toHaveProperty("adaptiveMetrics");
    expect(merged.metadata).not.toHaveProperty("eventStream");
    expect(merged.metadata).not.toHaveProperty("collectionsPaged");
    expect(merged.summary.metadata).not.toHaveProperty("lastEventSequence");
    expect(merged.summary.metadata).not.toHaveProperty("errorCount");
  });

  it("lets the incoming detail win for every key it carries, including one it clears", () => {
    const incoming = projection({ llmGate: { invoked: false, reason: "retried" }, trainingMode: undefined as unknown as string });
    const retried: AutomationStudioFlowRunDetail = {
      ...incoming,
      actionAttempts: [action("divide.attempt.1", "failed"), action("divide.attempt.2", "succeeded")],
      summary: { ...incoming.summary, status: "succeeded", tokenUsage: { totalTokens: 50 } },
      adaptationIds: ["adaptation.two"]
    };

    const merged = runDetailPreservingStored(annotated(), retried);

    expect(merged.metadata?.llmGate).toEqual({ invoked: false, reason: "retried" });
    expect(merged.metadata).toHaveProperty("trainingMode", undefined);
    expect(merged.metadata).toMatchObject({ runtimeAdaptationContext: { mode: "continuous_adaptive" } });
    expect(merged.summary).toMatchObject({ status: "succeeded", tokenUsage: { totalTokens: 50 } });
    expect(merged.actionAttempts?.map((item) => [item.attemptId, item.status])).toEqual([["divide.attempt.1", "failed"], ["divide.attempt.2", "succeeded"]]);
    expect(merged.adaptationIds).toEqual(["adaptation.one", "adaptation.two"]);
  });

  it("replaces a stored record with the incoming version of the same id and keeps the stored order", () => {
    const stored = detail({ actionAttempts: [action("a.attempt.1", "running"), action("b.attempt.1", "succeeded")] });
    const incoming = detail({ actionAttempts: [action("b.attempt.1", "succeeded"), action("a.attempt.1", "failed"), action("c.attempt.1", "running")] });

    const merged = runDetailPreservingStored(stored, incoming);

    expect(merged.actionAttempts?.map((item) => [item.attemptId, item.status])).toEqual([["a.attempt.1", "failed"], ["b.attempt.1", "succeeded"], ["c.attempt.1", "running"]]);
    expect(runDetailPreservingStored(detail({}), detail({}))).not.toHaveProperty("actionAttempts");
  });
});
