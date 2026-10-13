// What the build that re-finds a failed step is told (t500, F3).
//
// Live run `run-mv6i28zl-a53d36db` (lane B, round 16): a step that sets a
// choice failed `target_not_found` because the site already held that choice,
// so the control it presses was not offered. The run's diagnosis said the
// result was still achievable and recoverable; its only fix was refused
// `target_unanchored`. The brief then told the re-author only "re-find the
// step", and three rounds hunted for a control that could not exist, twice
// pressing another record's control and reversing the choice the site held.
// The brief now carries what the diagnosis and Core's own check concluded,
// allows "already done", and forbids changing a lasting choice the build did
// not make.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY } from "../../../route-state/signatures/index.ts";
import { automationStudioStepFailureReauthorBrief } from "../step-failure-brief.ts";

const effect: JsonObject = { v: "effect.test", added: ["a1", "a2"] };

function flowWith(nodeMetadata?: JsonObject): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId: "flow.one", ownerKind: "task", ownerId: "task.one", name: "Choose", createdAt: 1, updatedAt: 1, edges: [],
    nodes: [
      { id: "s8", definitionId: "web.action.click", label: "Open the chooser" },
      { id: "s9", definitionId: "web.action.click", label: "Choose the option", parameterValues: { target: { name: "Use this one", role: "button" } }, ...(nodeMetadata ? { metadata: nodeMetadata } : {}) }
    ]
  };
}

function failedDetail(input: { gate?: JsonObject; stateRouting?: JsonObject; extra?: JsonObject } = {}): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: "run.one", flowId: "flow.one", projectId: "project.one", status: "failed", updatedAt: 3, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 2, interventionCount: 1, adaptationCount: 0 },
    routeDecisions: [], subflows: [], interventions: [], adaptationIds: [], changeProposalIds: [],
    actionAttempts: [
      { attemptId: "attempt.1", nodeId: "s8", definitionId: "web.action.click", order: 1, status: "succeeded", startedAt: 1 },
      {
        attemptId: "attempt.2", nodeId: "s9", definitionId: "web.action.click", order: 2, status: "failed", startedAt: 2,
        failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" },
        ...(input.stateRouting ? { stateRouting: input.stateRouting } : {})
      }
    ],
    metadata: {
      llmGate: { invoked: true, providerConfigured: true, ok: true, diagnostics: [], ...(input.gate ?? {}) },
      ...(input.extra ?? {})
    }
  } as AutomationStudioFlowRunDetail;
}

/** The round-16 shape: the diagnosis said achievable and recoverable, Core's check found the page not showing the whole recorded change, and the one fix was refused unanchored. */
const ROUND_16 = {
  gate: {
    structuredDiagnosis: { schemaVersion: "automation-studio.structured-diagnosis.v1", failureClass: "target_not_found", candidateKind: "action_target_override", source: "model", stillAchievable: "yes", deterministicRecoveryPossible: "yes", explorationNeeded: false, patchNeeded: true, confidence: 0.72, modelFields: ["stillAchievable", "deterministicRecoveryPossible", "patchNeeded"], refusals: [], describedFieldCount: 3 }
  },
  stateRouting: { outcome: "no_match", code: "web.target.not_found" },
  extra: { runtimePatchAttempts: [{ kind: "temporary_target_override", executed: false, preflightOk: false, targetOverrideRefusal: { status: "refused", reason: "target_unanchored" } }] }
};

function brief(detail: AutomationStudioFlowRunDetail, flow: AutomationStudioFlowDocument = flowWith({ [AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY]: { effect } })): string {
  return automationStudioStepFailureReauthorBrief({ projectId: "project.one", flowId: "flow.one", nodeId: "s9", detail, flow, ladder: { targetRefusals: ["target_unanchored"] }, now: 0 }).body;
}

describe("the failed-step brief, for a step whose result the site may already hold (run-mv6i28zl, B round 16)", () => {
  it("says what the run's diagnosis concluded, as its verdicts", () => {
    const body = brief(failedDetail(ROUND_16));
    expect(body).toContain("The run's diagnosis of this failure concluded: the step's intended result is still achievable (yes); it can be recovered without rebuilding the step (yes); the Flow needs a change (yes).");
  });

  it("says what Core's own check of the page found, and that the change it recorded may hold incidental parts", () => {
    const body = brief(failedDetail(ROUND_16));
    expect(body).toContain("When the step could not run, Core compared the page with what this step changed when the Flow was built, and did not find all of that change on the page.");
    expect(body).toContain("Part of what changed then may have been incidental");
  });

  it("allows 'already done': keep the step, make it run only when its result is not shown, and go on", () => {
    const body = brief(failedDetail(ROUND_16));
    expect(body).toContain("First look at whether the page already shows the result this step was meant to bring about");
    expect(body).toContain("do not look for another control to do it again. Keep the step, make it run only when its result is not already shown");
    expect(body).toContain("then go on with the later steps");
  });

  it("forbids changing a lasting choice the site already holds that this build did not make", () => {
    const body = brief(failedDetail(ROUND_16));
    expect(body).toContain("Never change a lasting choice the site already holds that this build did not make");
    expect(body).toContain("do not choose a different option where one is already chosen, and do not act on another record in place of the step's own");
  });

  it("still carries the ladder's ending and the re-find instruction", () => {
    const body = brief(failedDetail(ROUND_16));
    expect(body).toContain("target_unanchored");
    expect(body).toContain("Otherwise, re-find step s9 on the site as it is now");
  });

  it("says nothing of a diagnosis or a page check the run did not record", () => {
    const body = brief(failedDetail(), flowWith());
    expect(body).not.toContain("The run's diagnosis of this failure concluded");
    expect(body).not.toContain("Core compared the page");
    // The outcomes are offered whatever was recorded.
    expect(body).toContain("First look at whether the page already shows the result");
  });

  it("says the page check could not be made when the page could not be observed", () => {
    const body = brief(failedDetail({ stateRouting: { outcome: "unobserved" } }));
    expect(body).toContain("When the step could not run, Core could not observe the page to compare it with what this step changed when the Flow was built.");
  });

  it("uses no word of the site it was found on", () => {
    const body = brief(failedDetail(ROUND_16)).toLowerCase();
    for (const word of ["store", "pickup", "millbrook", "cart"]) expect(body).not.toContain(word);
  });
});
