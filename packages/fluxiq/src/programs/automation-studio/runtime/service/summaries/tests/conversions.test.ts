import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { AUTOMATION_STUDIO_LADDER_MODEL_RUNG_SELECTED_CODE, flowRunSummaryWithInterventionSummaries, runtimeSessionToFlowRunDetail } from "../index.ts";

describe("runtimeSessionToFlowRunDetail attempt recordCount", () => {
  it("reads recordCount from the $dataset marker a saved trace holds in place of the captured rows", () => {
    const detail = runtimeSessionToFlowRunDetail(session([
      attempt("extract.attempt.1", { records: { $dataset: { datasetId: "listings", recordCount: 3, schemaDigest: "sha256:listing-schema" } }, result: { items: { $dataset: { datasetId: "listings", recordCount: 3 } } } }),
      attempt("empty.attempt.1", { records: { $dataset: { datasetId: "listings", recordCount: 0 } } })
    ]), "project.conversions");

    expect(detail.actionAttempts?.map((item) => item.metadata?.recordCount)).toEqual([3, 0]);
    // The output shape beside it: which ports produced something, and a list's
    // length. Names and counts, so the record still carries no page value.
    expect(detail.actionAttempts?.[0]?.metadata?.outputShape).toEqual({ records: true, result: true });
    expect(detail.actionAttempts?.[0]?.metadata).toMatchObject({ recordCount: 3 });
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

// A failed attempt a person cleared is the only failed attempt that does not end
// its node, and this record is the only place a reader of the run can see it.
describe("runtimeSessionToFlowRunDetail attempt ask", () => {
  it("carries the person-needed ask as closed words: kind, status, route and the mark, never the question or answer", () => {
    const cleared = { ...failedAttempt(), route: "success", ask: { askId: "node.action.attempt.1", kind: "choice", parks: true, status: "answered", route: "success", settledAtMs: 14, personNeeded: true } } as AutomationStudioNodeAttemptTrace;
    const detail = runtimeSessionToFlowRunDetail(session([cleared]), "project.conversions");

    expect(detail.actionAttempts?.[0]?.metadata?.ask).toEqual({ kind: "choice", status: "answered", route: "success", personNeeded: true });
  });

  it("writes no ask for an attempt that asked nothing, and no mark for an ask that was not the person-needed one", () => {
    const plain = runtimeSessionToFlowRunDetail(session([failedAttempt()]), "project.conversions");
    expect(plain.actionAttempts?.[0]?.metadata).not.toHaveProperty("ask");

    const permission = { ...failedAttempt(), ask: { askId: "a", kind: "permission", parks: true, status: "pending" } } as AutomationStudioNodeAttemptTrace;
    expect(runtimeSessionToFlowRunDetail(session([permission]), "project.conversions").actionAttempts?.[0]?.metadata?.ask).toEqual({ kind: "permission", status: "pending" });
  });
});

// A sometimes-present step observed absent is skipped, not failed
// (`executor/step-skip/absent-step.ts`). The run detail is all a reader of the
// run -- the Lab, the web UI -- has, so without the mark a skip reads as a press.
describe("runtimeSessionToFlowRunDetail skipped step", () => {
  it("carries a skipped attempt's reason and observing code", () => {
    const skipped = { ...attempt("popup.attempt.1", {}), route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } } as AutomationStudioNodeAttemptTrace;
    const record = runtimeSessionToFlowRunDetail(session([skipped]), "project.conversions").actionAttempts?.[0];

    expect(record).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    expect(record).not.toHaveProperty("failure");
  });

  it("writes no skipped mark for an attempt that ran", () => {
    const ran = runtimeSessionToFlowRunDetail(session([attempt("click.attempt.1", {}), failedAttempt()]), "project.conversions");
    for (const record of ran.actionAttempts ?? []) expect(record).not.toHaveProperty("skipped");
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

// The intervention the ladder's last rung leaves behind, and the one issue
// Core wrote as a bare sentence. Every reader that keeps codes and discards
// messages reduced it to nothing, so the Lab's evaluation of live run
// `run-muesyox4-930bef98` (2026-09-23) recorded `validationOk: false` with an
// empty `validationCodes`: "something rejected the diagnosis and would not say
// what", when nothing had rejected anything. The mutation this is written
// against is putting the sentence back without its code.
describe("runtimeSessionToFlowRunDetail ladder diagnosis intervention", () => {
  it("states a code for the ladder selecting its model rung, in the shape a reader extracts", () => {
    const detail = runtimeSessionToFlowRunDetail(session([ladderAttempt()]), "project.conversions");
    const issues = detail.interventions?.[0]?.validation?.issues ?? [];

    expect(detail.interventions).toHaveLength(1);
    expect(detail.interventions?.[0]?.kind).toBe("diagnosis");
    // Informational: nothing was called and nothing failed (t193 wK, K7). An
    // `ok: false` here read as a failed diagnosis call in every step-failure run.
    expect(detail.interventions?.[0]?.validation?.ok).toBe(true);
    expect(AUTOMATION_STUDIO_LADDER_MODEL_RUNG_SELECTED_CODE).toBe("recovery.ladder_model_rung_selected");
    expect(issues).toHaveLength(1);
    // A reader takes the leading token up to the first colon; a sentence yields none.
    expect(/^([a-z][a-z0-9_.-]{1,127})(?::|$)/u.exec(issues[0] ?? "")?.[1]).toBe(AUTOMATION_STUDIO_LADDER_MODEL_RUNG_SELECTED_CODE);
    // It is the rung being recorded, not a claim about the deployment: in the
    // run above a provider was configured and answered moments later.
    expect(issues[0]).not.toMatch(/not configured/u);
  });
});

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
}

/** A failed attempt whose recovery ladder ran out of deterministic rungs and selected LLM diagnosis. */
function ladderAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    ...failedAttempt(),
    recoveryDecision: {
      lookup: { nodeId: "node.action", failureClass: "target_not_found" },
      candidates: [{ kind: "llm_diagnosis", priority: 90, label: "Request LLM diagnosis", reason: "No lower-priority deterministic recovery fully resolved the failed transition." }],
      selected: { kind: "llm_diagnosis", priority: 90, label: "Request LLM diagnosis", reason: "No lower-priority deterministic recovery fully resolved the failed transition." }
    }
  } as unknown as AutomationStudioNodeAttemptTrace;
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

// Every run's detail goes through this projection, routed or direct, succeeded
// or failed, so it is where the version set the session stamped has to become
// something a reader of the run can see.
describe("runtimeSessionToFlowRunDetail flow versions", () => {
  it("carries the graph versions the session recorded onto the run detail", () => {
    const versioned = { ...session([]), metadata: { flowVersions: [{ graphFlowId: "flow.conversions", revision: 4 }, { graphFlowId: "flow.conversions.sub.graph", revision: 2, subflowId: "sub.1" }] } };
    expect(runtimeSessionToFlowRunDetail(versioned, "project.conversions").metadata?.flowVersions)
      .toEqual([{ graphFlowId: "flow.conversions", revision: 4 }, { graphFlowId: "flow.conversions.sub.graph", revision: 2, subflowId: "sub.1" }]);
  });

  it("keeps a graph with no revision chain absent rather than at zero", () => {
    const versioned = { ...session([]), metadata: { flowVersions: [{ graphFlowId: "flow.conversions", revision: null }] } };
    expect(runtimeSessionToFlowRunDetail(versioned, "project.conversions").metadata?.flowVersions).toEqual([{ graphFlowId: "flow.conversions", revision: null }]);
  });

  it("writes no key for a run that recorded no version", () => {
    expect(runtimeSessionToFlowRunDetail(session([]), "project.conversions").metadata).not.toHaveProperty("flowVersions");
  });
});

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

// The run summary list-flow-runs answers from carries the same durable-change
// reading the run endpoint answers with, computed when the summary is saved.
describe("flowRunSummaryWithInterventionSummaries durableBehaviorChanged", () => {
  it("is true only when one of the run's adaptations was applied automatically", () => {
    const detail = runtimeSessionToFlowRunDetail(session([]), "project.conversions");
    expect(flowRunSummaryWithInterventionSummaries(detail).durableBehaviorChanged).toBe(false);
    const applied = { ...detail, adaptationIds: ["adaptation.one"], metadata: { ...(detail.metadata ?? {}), runtimePatchAttempts: [{ adaptationId: "adaptation.one", approvalDecision: { autoApply: true } }] } };
    expect(flowRunSummaryWithInterventionSummaries(applied).durableBehaviorChanged).toBe(true);
    const pending = { ...applied, metadata: { ...(detail.metadata ?? {}), runtimePatchAttempts: [{ adaptationId: "adaptation.one", approvalDecision: { autoApply: false } }] } };
    expect(flowRunSummaryWithInterventionSummaries(pending).durableBehaviorChanged).toBe(false);
  });
});
