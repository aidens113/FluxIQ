// A re-author that fails must be retried or degraded, never silently ended.
// `run-mulxk0ro-36bf090d`'s repair failed inside the build before any provider
// call, recorded `flow_bootstrap.unexpected_error`, and did nothing more.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { flowBootstrapPhaseFailure } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioLlmRequestRefusedError } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  automationStudioResultRepairHistoryEntry
} from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioRefutedResultRepairPort, type AutomationStudioRefutedResultRepairPortDependencies } from "../refuted-result-port.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 10, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
  recordSets: [{ datasetId: "dataset.1", recordCount: 10, refusedCount: 0, truncated: false, columns: ["title", "price"], columnsWithheld: false, rowsChecked: 10, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Oak dining table" }] }],
  flowShape: [{ nodeId: "node.s6", definitionId: "web.output.dom-extract_list" }],
  withheld: false
};

const outcome: AutomationStudioResultVerificationOutcome = {
  schemaVersion: "automation-studio.result-verification.v1",
  performed: true, verdict: "does_not_answer", basis: "model", code: AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  reason: "The result was judged not to answer the request.", observation: "10 records stored, across 1 record set."
};

const detail = {
  summary: { runId: "run.one", status: "failed" },
  metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code: AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE } }
} as unknown as AutomationStudioFlowRunDetail;

const request = {
  detail,
  failedTraceAttempt: {} as never,
  resultSummary: summary,
  current: automationStudioResultRepairHistoryEntry({ attempt: 1, outcome, summary, nodeId: "node.s6" }),
  history: [],
  maxAttempts: 3
};

const caller = { actorUserId: "user.one", actorSessionId: "session.one" };

function deps(overrides: Partial<AutomationStudioRefutedResultRepairPortDependencies>): AutomationStudioRefutedResultRepairPortDependencies & { annotate: ReturnType<typeof vi.fn> } {
  return {
    projectId: "project.one",
    flowId: () => "flow.one",
    caller,
    annotate: vi.fn(async (refuted) => ({ ...refuted.detail, metadata: { ...(refuted.detail.metadata ?? {}), ladder: "annotated" } })),
    generate: async () => ({ adaptationId: "adaptation.one", accounting: {} }) as never,
    approve: async () => undefined,
    apply: async () => undefined,
    now: () => 0,
    ...overrides
  } as AutomationStudioRefutedResultRepairPortDependencies & { annotate: ReturnType<typeof vi.fn> };
}

function marker(result: AutomationStudioFlowRunDetail | undefined): Record<string, any> {
  return (result?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] ?? {}) as Record<string, any>;
}

describe("the caller a re-author builds for", () => {
  // The build pays with the run's own caller's key and carries the consequences
  // the caller permitted; nothing else is asked of it. After it applies, the run
  // just replays.
  it("builds for the run's caller, applies, and leaves the run ready to replay", async () => {
    const generate = vi.fn(async () => ({ adaptationId: "adaptation.one", accounting: {} }));
    const apply = vi.fn(async () => undefined);
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, apply, permittedConsequences: ["create_new"] }))(request);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((generate.mock.calls[0] as unknown[])[0]).toEqual({ projectId: "project.one", flowId: "flow.one", mode: "extend", evidenceGuided: true, caller, permittedConsequences: ["create_new"] });
    expect(apply).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.one", actorId: "runtime.result_repair" });
    expect(marker(result)).toMatchObject({ routed: true, applied: true });
    expect(marker(result).replayReady).toBeUndefined();
    expect(marker(result).degraded).toBeUndefined();
  });
});

describe("a re-author whose build fails", () => {
  it("names the guard that refused the request and degrades to the patch ladder instead of ending", async () => {
    const generate = vi.fn(async () => { throw new AutomationStudioLlmRequestRefusedError("llm.request.evidence_denied_key", "refused"); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);
    expect(marker(result)).toMatchObject({
      routed: true,
      code: "flow_bootstrap.request_refused_evidence_denied_key",
      stage: "pre_provider_validation",
      providerInvocation: "not_attempted",
      degraded: { to: "patch_ladder", afterCode: "flow_bootstrap.request_refused_evidence_denied_key" }
    });
    // A guard refusal would refuse again, so it is not retried.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).toHaveBeenCalledTimes(1);
    expect(result?.metadata?.ladder).toBe("annotated");
  });

  it("names a run with no caller as a provider that could not resolve", async () => {
    const result = await automationStudioRefutedResultRepairPort(deps({ caller: undefined }))(request);
    expect(marker(result)).toMatchObject({ code: "flow_bootstrap.provider_resolution_failed", stage: "provider_resolution", degraded: { to: "patch_ladder" } });
  });

  it("builds again once after a failure that may pass, and applies what the second build made", async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw flowBootstrapPhaseFailure("provider_request", undefined, "flow_bootstrap.provider_timeout");
      return { adaptationId: "adaptation.two", accounting: {} };
    });
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(marker(result)).toMatchObject({ routed: true, adaptationId: "adaptation.two", applied: true });
    expect(marker(result).degraded).toBeUndefined();
    expect(marker(result).attempts).toHaveLength(2);
    expect(marker(result).attempts[0]).toMatchObject({ code: "flow_bootstrap.provider_timeout", retryable: true });
  });

  it("still says what it tried when the patch ladder throws as well", async () => {
    const port = deps({
      generate: (async () => { throw new AutomationStudioLlmRequestRefusedError("llm.request.routing_denied_key", "refused"); }) as never,
      annotate: vi.fn(async () => { throw new Error("ladder down"); }) as never
    });
    const result = await automationStudioRefutedResultRepairPort(port)(request);
    expect(marker(result)).toMatchObject({ code: "flow_bootstrap.request_refused_routing_denied_key", degraded: { to: "patch_ladder", failed: true } });
  });
});
