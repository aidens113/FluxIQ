import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
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
