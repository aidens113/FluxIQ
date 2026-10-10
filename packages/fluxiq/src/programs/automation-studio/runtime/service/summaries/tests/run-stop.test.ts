import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioRunStop, flowRunSummaryWithInterventionSummaries, runDetailPreservingStored, runtimeSessionToFlowRunDetail } from "../index.ts";

// t412: a run stopped because a lasting act's outcome is unknown carries
// `run.outcome_uncertain` on its trace (t408). Its run detail says so as the
// run's own stop, beside the failed attempt's own failure, and its summary's
// status words say the outcome is uncertain rather than failed.

const timeout = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution" } as const;
const uncertain = { category: "ambiguous_or_unknown", code: "run.outcome_uncertain", retryable: false, stage: "confirmation", effect: "ambiguous" } as const;

function confirmAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.confirm.attempt.1", nodeId: "node.confirm", definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure: timeout } as AutomationStudioNodeAttemptTrace;
}

function stoppedSession(failure: NonNullable<AutomationStudioRuntimeSession["trace"]>["failure"]): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.uncertain",
    projectId: "project.uncertain",
    targetKind: "flow",
    targetId: "flow.uncertain",
    flowId: "flow.uncertain",
    status: "failed",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "failed", startedAt: 5, finishedAt: 20, attempts: [confirmAttempt()], values: {}, effects: [], currentNodeId: "node.confirm", message: "Outcome uncertain: node.confirm may already have acted.", ...(failure ? { failure } : {}) }
  };
}

describe("automationStudioRunStop", () => {
  it("answers the closed uncertain code exactly, and nothing else", () => {
    expect(automationStudioRunStop("run.outcome_uncertain")).toMatchObject({ code: "run.outcome_uncertain", statusWords: "Outcome uncertain" });
    expect(automationStudioRunStop("web.action.timeout")).toBeUndefined();
    expect(automationStudioRunStop("other.outcome_uncertain")).toBeUndefined();
    expect(automationStudioRunStop(undefined)).toBeUndefined();
  });
});

describe("run detail of a run stopped as Outcome uncertain", () => {
  it("carries the run's stop code beside the attempt's own failure, which stays as it was", () => {
    const detail = runtimeSessionToFlowRunDetail(stoppedSession(uncertain), "project.uncertain");

    expect(detail.metadata).toMatchObject({ stopCode: "run.outcome_uncertain" });
    expect(String(detail.metadata?.terminalFailureReason)).toMatch(/^Outcome uncertain: the last step may already have gone through/u);
    expect(detail.actionAttempts?.[0]).toMatchObject({ status: "failed", failure: { category: "timeout", code: "web.action.timeout" } });
    expect(detail.summary.status).toBe("failed");
  });

  it("says Outcome uncertain in the summary's status words, with the code", () => {
    const summary = flowRunSummaryWithInterventionSummaries(runtimeSessionToFlowRunDetail(stoppedSession(uncertain), "project.uncertain"));

    expect(summary.metadata).toMatchObject({ stopCode: "run.outcome_uncertain", statusWords: "Outcome uncertain" });
  });

  it("gives a run that failed for any other reason no stop code and no status words", () => {
    const detail = runtimeSessionToFlowRunDetail(stoppedSession(timeout), "project.uncertain");
    const summary = flowRunSummaryWithInterventionSummaries(detail);

    expect(detail.metadata).not.toHaveProperty("stopCode");
    expect(summary.metadata).not.toHaveProperty("stopCode");
    expect(summary.metadata).not.toHaveProperty("statusWords");
    expect(String(detail.metadata?.terminalFailureReason)).not.toMatch(/the last step may already have gone through/u);
  });

  it("drops the stop from detail and summary once a later projection of the session no longer says it", () => {
    const stored = runtimeSessionToFlowRunDetail(stoppedSession(uncertain), "project.uncertain");
    const storedWithSummary = { ...stored, summary: flowRunSummaryWithInterventionSummaries(stored) };
    const merged = runDetailPreservingStored(storedWithSummary, runtimeSessionToFlowRunDetail(stoppedSession(timeout), "project.uncertain"));
    const summary = flowRunSummaryWithInterventionSummaries(merged);

    expect(merged.metadata).not.toHaveProperty("stopCode");
    expect(summary.metadata).not.toHaveProperty("stopCode");
    expect(summary.metadata).not.toHaveProperty("statusWords");
  });

  it("keeps the stop through a save of a detail that carries it", () => {
    const stored = runtimeSessionToFlowRunDetail(stoppedSession(uncertain), "project.uncertain");
    const merged = runDetailPreservingStored(stored, runtimeSessionToFlowRunDetail(stoppedSession(uncertain), "project.uncertain"));

    expect(flowRunSummaryWithInterventionSummaries(merged).metadata).toMatchObject({ stopCode: "run.outcome_uncertain", statusWords: "Outcome uncertain" });
  });
});
