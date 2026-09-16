import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { runtimeSessionToFlowRunDetail } from "../index.ts";

describe("runtimeSessionToFlowRunDetail attempt recordCount", () => {
  it("reads recordCount from the $dataset marker a saved trace holds in place of the captured rows", () => {
    const detail = runtimeSessionToFlowRunDetail(session([
      attempt("extract.attempt.1", { records: { $dataset: { datasetId: "listings", recordCount: 3, schemaDigest: "sha256:listing-schema" } }, result: { items: { $dataset: { datasetId: "listings", recordCount: 3 } } } }),
      attempt("empty.attempt.1", { records: { $dataset: { datasetId: "listings", recordCount: 0 } } })
    ]), "project.conversions");

    expect(detail.actionAttempts?.map((item) => item.metadata?.recordCount)).toEqual([3, 0]);
    expect(detail.actionAttempts?.[0]?.metadata).toEqual({ recordCount: 3 });
  });

  it("writes no recordCount when an attempt has no $dataset marker, or its count is not a finite number", () => {
    const detail = runtimeSessionToFlowRunDetail(session([
      attempt("click.attempt.1", { result: { clicked: true } }),
      attempt("no-outputs.attempt.1", undefined),
      // A count only under `result` is not the records output's marker.
      attempt("result-only.attempt.1", { result: { $dataset: { datasetId: "listings", recordCount: 4 } } }),
      // Rows themselves, as an executed trace would hold them, carry no marker.
      attempt("rows.attempt.1", { records: [{ title: "First" }] }),
      attempt("text-count.attempt.1", { records: { $dataset: { datasetId: "listings", recordCount: "3" } } }),
      attempt("null-marker.attempt.1", { records: { $dataset: null } }),
      attempt("no-count.attempt.1", { records: { $dataset: { datasetId: "listings" } } })
    ]), "project.conversions");

    expect(detail.actionAttempts).toHaveLength(7);
    for (const record of detail.actionAttempts ?? []) expect(record.metadata).not.toHaveProperty("recordCount");
  });
});

// Fix 5: the only production call site passed no adaptations at all, so
// `knownAdaptationMatches` was always empty no matter what any adaptation
// recorded. The list has to reach the classifier for matching to exist.
describe("runtimeSessionToFlowRunDetail known adaptation matching", () => {
  it("matches a failed attempt against the adaptations it is given", () => {
    const detail = runtimeSessionToFlowRunDetail(session([failedAttempt()]), "project.conversions", [adaptationFor("node.action")]);
    const adaptiveFailure = detail.actionAttempts?.[0]?.metadata?.adaptiveFailure as { knownAdaptationIds?: string[] } | undefined;

    expect(adaptiveFailure?.knownAdaptationIds).toEqual(["adaptation.known"]);
  });

  it("matches nothing when no adaptation is given, and nothing when none applies to the failed node", () => {
    const withoutAdaptations = runtimeSessionToFlowRunDetail(session([failedAttempt()]), "project.conversions");
    const otherNode = runtimeSessionToFlowRunDetail(session([failedAttempt()]), "project.conversions", [adaptationFor("node.elsewhere")]);

    for (const detail of [withoutAdaptations, otherNode]) {
      const adaptiveFailure = detail.actionAttempts?.[0]?.metadata?.adaptiveFailure as { knownAdaptationIds?: string[] } | undefined;
      expect(adaptiveFailure?.knownAdaptationIds).toEqual([]);
    }
  });
});

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
}

function adaptationFor(nodeId: string): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.known",
    flowId: "flow.conversions",
    projectId: "project.conversions",
    trigger: "A known repair for this action.",
    failedAction: { nodeId, definitionId: "builtin.policy.action" },
    patch: [{ kind: "edit_expectation", targetId: nodeId, summary: "Wait longer." }],
    validationResults: [{ runId: "run.earlier", status: "succeeded", checkedAt: 5 }],
    status: "applied",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 2
  };
}

function attempt(attemptId: string, outputs: Record<string, JsonValue> | undefined): AutomationStudioNodeAttemptTrace {
  // `outputs` is left out entirely for the undefined case: a session read back from storage may lack it.
  const record = { attemptId, nodeId: attemptId.split(".attempt.")[0]!, definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status: "succeeded", inputs: {}, effects: [] } as unknown as AutomationStudioNodeAttemptTrace;
  return outputs === undefined ? record : { ...record, outputs };
}

function session(attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.conversions",
    projectId: "project.conversions",
    targetKind: "flow",
    targetId: "flow.conversions",
    flowId: "flow.conversions",
    status: "succeeded",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "succeeded", startedAt: 5, finishedAt: 20, attempts, values: {}, effects: [] }
  };
}
