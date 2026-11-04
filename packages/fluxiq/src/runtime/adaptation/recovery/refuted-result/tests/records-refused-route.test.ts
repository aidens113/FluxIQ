// A read whose every row its own record schema refused fails at the step, so no
// result check sees it (`engine/automation/records/capture.ts`), and it has to be
// held to its route here: `refusing-codes.test.ts` scans `core.result.*` only.
//
// The failure's category says the output did not show, which the ladder reads as a
// wait. A wait reads the same rows and the schema refuses them again, and the capture
// says so: `retryable: false`, because "what has to change is the Flow".

import { describe, expect, it } from "vitest";
import { captureAutomationStudioRecordBatch } from "../../../../../engine/automation/records/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioStepFailureReauthorBrief, automationStudioStepFailureReauthorDecision, automationStudioStepFailureTarget, AUTOMATION_STUDIO_RECORDS_REFUSED_CODE } from "../step/index.ts";

const failureOf = (code: string, category = "output_not_observed") => ({ category, code, retryable: false, stage: "dispatch", expected: "records the Flow's own record schema can store.", actual: "2 records were refused and none stored (records.required_missing)." });

function failedRead(failure: object, metadata: object = {}): AutomationStudioFlowRunDetail {
  return {
    summary: { runId: "run.one", status: "failed" },
    routeDecisions: [], subflows: [], interventions: [], adaptationIds: [], changeProposalIds: [],
    actionAttempts: [
      { attemptId: "a.1", nodeId: "open", definitionId: "web.action.navigate", order: 1, status: "succeeded", startedAt: 1 },
      { attemptId: "a.2", nodeId: "read", definitionId: "web.output.read_list", order: 2, status: "failed", startedAt: 2, failure }
    ],
    metadata: { llmGate: { invoked: true, providerConfigured: true, ok: false, diagnostics: [] }, ...metadata }
  } as unknown as AutomationStudioFlowRunDetail;
}

const route = { projectId: "project.one", flowId: "flow.one" };
const decide = (detail: AutomationStudioFlowRunDetail) => automationStudioStepFailureReauthorDecision({ detail, ...route });

describe("the route of a read whose every row was refused", () => {
  it("names the code its real writer writes", () => {
    const captured = captureAutomationStudioRecordBatch({
      effect: { type: "policy.output.dispatch", payload: { recordOutput: { datasetId: "rows", label: "Rows", recordsPath: "extracted", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] } } } },
      dispatched: { status: "success", outputs: { result: { extracted: [{ title: "no name" }] } } },
      nodeId: "read",
      attemptId: "a.2"
    });
    expect(captured.result.failure?.code).toBe(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE);
  });

  it("is re-authored, and the run's record says which failure the build answered", () => {
    expect(decide(failedRead(failureOf(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE)))).toMatchObject({ route: true, record: { trigger: "failed_step", failureCode: AUTOMATION_STUDIO_RECORDS_REFUSED_CODE, failureCategory: "output_not_observed" } });
  });

  it("is seen as the route's by the verification's reading of the trace, before it reads the record", () => {
    expect(automationStudioStepFailureTarget([{ status: "failed", failure: failureOf(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE) }])?.reauthorable).toBe(true);
  });

  it("leaves every other output that did not show to the ladder's wait: a different moment may show it", () => {
    for (const code of ["record_output.records_missing", "web.validation.output_not_observed"]) {
      expect(decide(failedRead(failureOf(code)))).toEqual({ route: false, refusal: "not_target_level" });
      expect(automationStudioStepFailureTarget([{ status: "failed", failure: failureOf(code) }])?.reauthorable).toBe(false);
    }
  });

  it("is held by the same limits as any failed step's route", () => {
    const failure = failureOf(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE);
    expect(decide(failedRead(failure, { llmGate: { invoked: false } }))).toEqual({ route: false, refusal: "ladder_not_run" });
    expect(decide(failedRead(failure, { llmGate: { invoked: true, bound: "cost" } }))).toEqual({ route: false, refusal: "cost_bound" });
    expect(decide(failedRead(failure, { permissionRequest: { requestId: "r.1" } }))).toEqual({ route: false, refusal: "permission_required" });
    expect(decide(failedRead(failure, { resultReauthor: { attempts: [{ brief: { trigger: "failed_step" } }] } }))).toEqual({ route: false, refusal: "already_reauthored" });
    expect(automationStudioStepFailureReauthorDecision({ detail: failedRead(failure) })).toEqual({ route: false, refusal: "flow_unavailable" });
  });

  it("is not stopped by a patch whose trial read the same rows and was contradicted, and is by one that held", () => {
    const failure = failureOf(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE);
    const tried = (verification: object) => failedRead(failure, { runtimePatchAttempts: [{ kind: "temporary_wait_retry", adaptationId: "adaptation.one", verification }] });
    expect(decide(tried({ status: "contradicted", reason: "changed_node_failed" }))).toMatchObject({ route: true });
    expect(decide(tried({ status: "verified", basis: "records" }))).toEqual({ route: false, refusal: "ladder_patch_executed" });
    expect(decide(failedRead(failure, { adaptiveRetry: { attempted: true } }))).toEqual({ route: false, refusal: "ladder_patch_executed" });
    // Any other failed step keeps the rule it had.
    expect(decide(failedRead({ ...failureOf("web.target.not_found", "target_not_found"), stage: "target_resolution" }, { runtimePatchAttempts: [{ kind: "temporary_target_override", adaptationId: "adaptation.one", verification: { status: "contradicted", reason: "x" } }] }))).toEqual({ route: false, refusal: "ladder_patch_executed" });
  });
});

describe("what the build is told about it", () => {
  const brief = (code: string, category?: string, stage = "dispatch") => automationStudioStepFailureReauthorBrief({ ...route, nodeId: "read", detail: failedRead({ ...failureOf(code, category), stage }), deniedEvidenceKeys: ["selector"], ladder: {}, now: 1 }).body;

  it("says the rows did not fit, what the step's fields owe, and never to drop what was asked to make them pass", () => {
    const body = brief(AUTOMATION_STUDIO_RECORDS_REFUSED_CODE);
    expect(body).toContain("every row it read was refused by the record schema it declares");
    expect(body).toContain("records.required_missing");
    expect(body).toContain("Never drop or loosen a field the request needs");
    expect(body).toContain("say so in your completion summary");
    expect(body).not.toContain("could not find what it acts on");
  });

  it("tells a step that could not find its control what it always did", () => {
    const body = brief("web.target.not_found", "target_not_found", "target_resolution");
    expect(body).toContain("could not find what it acts on");
    expect(body).not.toContain("record schema it declares");
  });
});
