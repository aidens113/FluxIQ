// The whole of cause 2, end to end and with no provider: a run whose every
// node succeeded, whose result Core's own verification refuted twice, reaching
// Stage B and being planned as a repair rather than as `stop`.
//
// Before this, `plan.ts` answered the refutation with
// `steps: [{action: "stop", reason: "No failed attempt reached the diagnosis,
// so there is nothing to plan."}]`, and both runs of campaign `ten-sites-r5`
// made zero repair calls. The chain asserted here is the production one --
// attempt, Stage A, Stage B -- called in the order `annotate.ts` calls it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "../../result-verification/index.ts";
import type { AutomationStudioTrainingModeSettings } from "../../training-modes.ts";
import { buildAutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import { decideAutomationStudioRuntimeLlmInvocation } from "../llm-invocation.ts";
import { planAutomationStudioRuntimeRecovery } from "../plan.ts";
import { automationStudioRefutedResultAttempt } from "../refuted-result/index.ts";

describe("a clean run whose result does not answer the request", () => {
  it("is classified as a failure a change to the Flow's path can repair", () => {
    const diagnosis = diagnose();

    expect(diagnosis).toMatchObject({
      failureClass: "output_not_observed",
      // Not `expectation_wait_retry`. A wait cannot change what a run that
      // already succeeded at every step produced; an inserted action sequence,
      // a reroute or a recovery subflow can.
      candidateKind: "recovery_path_or_reroute",
      resolution: "model_required",
      modelNeeded: true,
      requiredPriorAction: "none"
    });
  });

  it("plans a repair, not a stop", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: diagnose(), result: diagnosisResult(), policy: policy() });

    expect(plan.steps.map((step) => step.action)).toEqual(["explore", "request_patch"]);
    expect(plan.steps.map((step) => step.action)).not.toContain("stop");
    expect(plan.candidateKind).toBe("recovery_path_or_reroute");
    expect(plan.patchRequest.request).toBe(true);
    // The kinds that can insert the step the Flow never had.
    expect(plan.allowedPatchKinds).toEqual(["temporary_reroute", "temporary_recovery_subflow_call", "temporary_action_sequence"]);
    expect(plan.diagnosis.refusals).not.toContain("No failed attempt reached the diagnosis, so nothing was classified.");
  });

  it("still lets the model be asked, rather than being refused by the deterministic gate", () => {
    const attempt = attemptOrThrow();
    const invocation = decideAutomationStudioRuntimeLlmInvocation({
      projectId: "project.1",
      flowId: "flow.1",
      runId: "run.1",
      settings: trainingSettings(),
      policy: policy(),
      failedAttempt: attempt.trace
    });

    expect(invocation.invoke).toBe(true);
    expect(invocation.diagnosis?.candidateKind).toBe("recovery_path_or_reroute");
  });

  // The stage alone would be too wide. A domain reports a step whose effect it
  // could not confirm at `verification` too -- the web domain's
  // `web.validation.output_not_observed` and `web.assert.text` both are -- and
  // those are exactly the failures a wait does repair. Only Core writes the
  // `core.result.` namespace, and only for a judgement on a finished result.
  it.each([
    ["web.validation.output_not_observed", "output_not_observed" as const, "expectation_wait_retry"],
    ["web.assert.text", "expected_state_missing" as const, "expectation_wait_retry"]
  ])("leaves a domain's own %s at verification classified as before", (code, category, candidateKind) => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({
      projectId: "project.1",
      flowId: "flow.1",
      runId: "run.1",
      failedAttempt: {
        ...attemptOrThrow().trace,
        failure: { category, code, retryable: true, stage: "verification", expected: "the page says Done", actual: "the page reads Pending" }
      }
    });

    expect(diagnosis.candidateKind).toBe(candidateKind);
  });

  // The behaviour this replaces, kept as the contrast: without the attempt the
  // refutation is invisible to Stage B and the plan is the one both r5 runs got.
  it("was planned as a stop while the verdict never reached the planner", () => {
    const plan = planAutomationStudioRuntimeRecovery({ result: diagnosisResult(), policy: policy() });

    expect(plan.steps).toEqual([{ action: "stop", reason: "No failed attempt reached the diagnosis, so there is nothing to plan." }]);
  });
});

function attemptOrThrow(): NonNullable<ReturnType<typeof automationStudioRefutedResultAttempt>> {
  const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome: refuted(), now: 5_000 });
  if (!attempt) throw new Error("A refuted result must produce an attempt for this test to mean anything.");
  return attempt;
}

function diagnose() {
  return buildAutomationStudioRuntimeDeterministicDiagnosis({
    projectId: "project.1",
    flowId: "flow.1",
    runId: "run.1",
    failedAttempt: attemptOrThrow().trace
  });
}

/** Only `ok` and `response` are read; the rest of the result is not consulted. */
function diagnosisResult(): AutomationStudioLlmTaskResult {
  return {
    ok: true,
    diagnostics: [],
    response: { kind: "diagnosis", summary: "The Flow never narrowed the list.", diagnosis: { explorationNeeded: true, patchNeeded: true } }
  } as unknown as AutomationStudioLlmTaskResult;
}

function refuted(): AutomationStudioResultVerificationOutcome {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "does_not_answer",
    basis: "model",
    code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request the Flow was built for, although every step of the run succeeded.",
    observation: "24 records stored, across 1 record set.",
    verdicts: ["does_not_answer", "does_not_answer"],
    calls: 2,
    failure: {
      category: "output_not_observed",
      code: "core.result.does_not_answer_request",
      retryable: false,
      stage: "verification",
      expected: "A result that answers the request the Flow was built for.",
      actual: "24 records stored, across 1 record set."
    }
  };
}

function cleanRun(): AutomationStudioFlowRunDetail {
  const attempts: AutomationStudioFlowRunActionAttemptRecord[] = [
    { attemptId: "a.1", nodeId: "node.s1", definitionId: "web.browser.navigate", order: 1, status: "succeeded", startedAt: 1_000, finishedAt: 1_100 },
    { attemptId: "a.2", nodeId: "node.s5", definitionId: "web.dom.extract_list", order: 2, status: "succeeded", startedAt: 1_200, finishedAt: 1_300, metadata: { recordCount: 24 } }
  ];
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1", runId: "run.1", flowId: "flow.1", projectId: "project.1", status: "failed",
      startedAt: 1_000, updatedAt: 5_000, routeDecisionCount: 0, subflowEntryCount: 0,
      actionAttemptCount: attempts.length, interventionCount: 0, adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: attempts,
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

/** Adaptive execution with everything switched on: the gate is not what is under test here. */
function trainingSettings(): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: false
  };
}

function policy(overrides: Partial<AutomationStudioAdaptationPolicy> = {}): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.refuted",
    scope: { kind: "flow", flowId: "flow.1" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}
