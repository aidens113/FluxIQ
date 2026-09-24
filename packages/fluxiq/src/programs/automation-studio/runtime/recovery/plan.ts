// Stage B of the loop's failure entry point: what to do about it, decided
// before anything is changed.
//
// There was no plan stage. Diagnosis was followed immediately by an attempt to
// patch, so "what shall we do" and "do it" were the same act, and the only
// thing standing between a failed run and a model-authored change to the Flow
// was whether a provider happened to be configured. A stage that states the
// intended change, and what is allowed to carry it out, is what makes the next
// stage answerable to something.
//
// This plan is **deterministic**. It reads the structured diagnosis and the
// adaptation policy and nothing else, and it costs no provider call. Decision
// L5's ordering is the reason: planning is exactly the kind of work a model
// should not be asked to do while a cheaper answer exists, and the cheaper
// answer here is a candidate kind the classifier already produced and a set of
// policy flags a person already set. An optional model refinement of this plan
// belongs inside the same budget and is not built here.
//
// Two rules give the plan its teeth.
//
// **A patch is requested only when the diagnosis asks for one.** That is L5's
// second clause. Three conditions have to hold: the diagnosis call actually
// succeeded and returned a diagnosis (Phase D's rule, reused rather than
// restated), the diagnosis says a patch or exploration is needed, and the
// policy permits at least one patch kind that could serve this failure. Each
// refusal carries its own sentence *and its own code* (`diagnosis-chain.ts`),
// so a run that requested nothing says which clause stopped it to a reader
// that keeps no sentences. One code for all of them is what left live run
// `run-muesyox4-930bef98` (2026-09-23) unable to say why a validated diagnosis
// of a `target_not_found` produced no patch attempt at all.
//
// **A plan never allows a patch kind the policy forbids.** The allowed kinds
// are narrowed twice: by the candidate kind, which says what shape of repair
// this failure could take, and by the policy flags `preflightAutomationStudioRuntimePatch`
// enforces later. Narrowing here as well as there is deliberate. The preflight
// is the enforcement; this is the plan being honest about what it is asking
// for, and a plan that asks for something the preflight will refuse is a plan
// that has told the model to do work that cannot land.

import type { AutomationStudioAdaptationPolicy } from "../../model/index.ts";
import type { AutomationStudioLlmTaskResult, AutomationStudioRuntimePatch } from "../llm/index.ts";
import type { AutomationStudioAdaptiveCandidateKind } from "../adaptive-orchestrator.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "./deterministic-diagnosis.ts";
import {
  AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES,
  decideAutomationStudioRuntimePatchRequest,
  type AutomationStudioRuntimePatchRequestDecision
} from "./diagnosis-chain.ts";
import {
  buildAutomationStudioRuntimeStructuredDiagnosis,
  type AutomationStudioRuntimeStructuredDiagnosis
} from "./structured-diagnosis.ts";

export type AutomationStudioRuntimePatchKind = AutomationStudioRuntimePatch["kind"];

/** One thing the plan intends, in the order the plan intends it. */
export type AutomationStudioRuntimeRecoveryPlanStep = {
  action: "apply_known_recovery" | "apply_known_adaptation" | "request_manual_intervention" | "explore" | "request_patch" | "stop";
  reason: string;
};

export type AutomationStudioRuntimeRecoveryPlan = {
  schemaVersion: "automation-studio.recovery-plan.v1";
  /** Which of Core's fixed loop stages this plan is. Always the second. */
  loopStage: "plan";
  /** No provider is called to produce this plan; L5 says a cheaper answer exists. */
  source: "deterministic";
  candidateKind: AutomationStudioAdaptiveCandidateKind;
  diagnosis: AutomationStudioRuntimeStructuredDiagnosis;
  steps: AutomationStudioRuntimeRecoveryPlanStep[];
  /** The patch kinds this plan may ask for: never one the policy forbids. */
  allowedPatchKinds: AutomationStudioRuntimePatchKind[];
  /** Patch kinds the failure could have used and the policy refused, with why. */
  policyRefusals: string[];
  explorationRequested: boolean;
  patchRequest: AutomationStudioRuntimePatchRequestDecision;
};

export type AutomationStudioRuntimeRecoveryPlanInput = {
  /** Stage A's answer. Absent when there was no failed attempt to classify. */
  deterministic?: AutomationStudioRuntimeDeterministicDiagnosis;
  /** The diagnosis call's result, when one was made. */
  result?: AutomationStudioLlmTaskResult;
  policy: AutomationStudioAdaptationPolicy;
};

/**
 * The patch kinds that could serve each shape of repair.
 *
 * `diagnosis_only` and `instruction_suggestion` map to nothing on purpose: a
 * failure whose answer is a report or an instruction is not a failure a runtime
 * patch addresses, and offering one anyway is how "always patch" survived.
 */
const AUTOMATION_STUDIO_PATCH_KINDS_FOR_CANDIDATE: Readonly<Record<AutomationStudioAdaptiveCandidateKind, readonly AutomationStudioRuntimePatchKind[]>> = Object.freeze({
  expectation_wait_retry: ["temporary_wait_retry"],
  action_target_override: ["temporary_target_override", "temporary_wait_retry"],
  recovery_path_or_reroute: ["temporary_reroute", "temporary_recovery_subflow_call", "temporary_action_sequence"],
  router_rule_edit: ["temporary_reroute"],
  subflow_edit_or_create: ["temporary_recovery_subflow_call"],
  instruction_suggestion: [],
  diagnosis_only: []
});

/** Stage B: the whole plan, from the diagnosis and the policy, with no provider call. */
export function planAutomationStudioRuntimeRecovery(input: AutomationStudioRuntimeRecoveryPlanInput): AutomationStudioRuntimeRecoveryPlan {
  const chain = decideAutomationStudioRuntimePatchRequest(input.result);
  if (!input.deterministic) return unclassifiedPlan(chain);
  const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({ deterministic: input.deterministic, ...(input.result ? { result: input.result } : {}) });
  const { allowed, refusals } = patchKindsForPlan(diagnosis.candidateKind, input.policy);
  const patchRequest = decidePatchRequest({ chain, diagnosis, allowed, resolution: input.deterministic.resolution });
  // An exploration is not only the patch's errand. "Let me look at the page
  // first, and then say there is nothing to repair" has to be reachable, and
  // cancelling the look because the verdict is already "no" would make the
  // refusal one the model could not check before giving
  // (`reports/w2-model-context-audit.md`).
  const explorationRequested = diagnosis.explorationNeeded;
  return {
    schemaVersion: "automation-studio.recovery-plan.v1",
    loopStage: "plan",
    source: "deterministic",
    candidateKind: diagnosis.candidateKind,
    diagnosis,
    steps: planSteps({ deterministic: input.deterministic, explorationRequested, patchRequest }),
    allowedPatchKinds: allowed,
    policyRefusals: refusals,
    explorationRequested,
    patchRequest
  };
}

/**
 * The patch kinds this plan may ask for, and the ones the policy took away.
 *
 * The policy conditions mirror `preflightAutomationStudioRuntimePatch`. They
 * are stated again rather than imported because the preflight answers a
 * different question -- may *this* patch, already authored, execute -- and
 * takes a whole patch to answer it. What the plan needs is the set, before any
 * patch exists. A test pins that the two agree.
 */
function patchKindsForPlan(candidateKind: AutomationStudioAdaptiveCandidateKind, policy: AutomationStudioAdaptationPolicy): { allowed: AutomationStudioRuntimePatchKind[]; refusals: string[] } {
  const candidates = AUTOMATION_STUDIO_PATCH_KINDS_FOR_CANDIDATE[candidateKind];
  if (!policy.allowRuntimeRecovery) {
    return { allowed: [], refusals: candidates.length ? ["Runtime recovery is disabled by adaptation policy."] : [] };
  }
  const refusals: string[] = [];
  const allowed = candidates.filter((kind) => {
    const refusal = automationStudioRuntimePatchKindPolicyRefusal(kind, policy);
    if (refusal) refusals.push(refusal);
    return refusal === undefined;
  });
  return { allowed: [...allowed], refusals };
}

/**
 * The preflight's sentence for a patch kind this policy forbids, or undefined
 * when it permits the kind. The patch stage reads it too, to say whether a kind
 * the plan left out was left out by the policy or by the failure.
 */
export function automationStudioRuntimePatchKindPolicyRefusal(kind: AutomationStudioRuntimePatchKind, policy: AutomationStudioAdaptationPolicy): string | undefined {
  if (!policy.allowRuntimeRecovery) return "Runtime recovery is disabled by adaptation policy.";
  if (kind === "temporary_recovery_subflow_call" && !policy.allowCreateRecoveryPaths) return "Recovery subflow calls are disabled by adaptation policy.";
  if (kind === "temporary_target_override" && !policy.allowModifyActionTargets) return "Action target overrides are disabled by adaptation policy.";
  if (kind === "temporary_reroute" && !policy.allowModifyRouter) return "Temporary reroutes are disabled by adaptation policy.";
  return undefined;
}

function decidePatchRequest(input: {
  chain: AutomationStudioRuntimePatchRequestDecision;
  diagnosis: AutomationStudioRuntimeStructuredDiagnosis;
  allowed: readonly AutomationStudioRuntimePatchKind[];
  resolution: AutomationStudioRuntimeDeterministicDiagnosis["resolution"];
}): AutomationStudioRuntimePatchRequestDecision {
  if (input.resolution !== "model_required") {
    return { request: false, reason: `The deterministic diagnosis resolved this failure as ${input.resolution.replace(/_/g, " ")}, so no patch was requested.`, code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.resolved_without_model, rung: "diagnosis" };
  }
  if (!input.chain.request) return input.chain;
  // The model's way of saying the page refuses this on purpose: the record is
  // gone, locked or guarded. A patch asked for after that can only be a
  // substitute, and a `patchNeeded` the model left out defaults to the
  // classifier's yes, so this verdict stops the request on its own.
  if (input.diagnosis.stillAchievable === "no") {
    return { request: false, reason: "The diagnosis says the step's intended result can no longer be achieved, so no patch was requested.", code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.goal_unachievable, rung: "plan" };
  }
  if (!input.diagnosis.patchNeeded && !input.diagnosis.explorationNeeded) {
    return { request: false, reason: "The diagnosis asked for neither a patch nor exploration, so no patch was requested.", code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.diagnosis_asked_for_none, rung: "plan" };
  }
  if (!input.allowed.length) {
    return { request: false, reason: `The adaptation policy permits no runtime patch kind for a ${input.diagnosis.candidateKind.replace(/_/g, " ")} failure, so no patch was requested.`, code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.policy_allows_no_kind, rung: "plan" };
  }
  return { request: true, reason: `The diagnosis calls for a runtime patch and the policy permits ${input.allowed.join(", ")}.` };
}

function planSteps(input: {
  deterministic: AutomationStudioRuntimeDeterministicDiagnosis;
  explorationRequested: boolean;
  patchRequest: AutomationStudioRuntimePatchRequestDecision;
}): AutomationStudioRuntimeRecoveryPlanStep[] {
  const resolution = input.deterministic.resolution;
  if (resolution === "deterministic_recovery") {
    return [{ action: "apply_known_recovery", reason: input.deterministic.reason }];
  }
  if (resolution === "known_adaptation") {
    return [{ action: "apply_known_adaptation", reason: `${input.deterministic.reason} Matched: ${input.deterministic.knownAdaptationIds.join(", ") || "no identified adaptation"}.` }];
  }
  if (resolution === "manual_intervention") {
    return [{ action: "request_manual_intervention", reason: input.deterministic.reason }];
  }
  const steps: AutomationStudioRuntimeRecoveryPlanStep[] = [];
  if (input.explorationRequested) steps.push({ action: "explore", reason: "The diagnosis asked for evidence to be gathered before anything is changed." });
  if (input.patchRequest.request) steps.push({ action: "request_patch", reason: input.patchRequest.reason });
  if (!steps.length) steps.push({ action: "stop", reason: input.patchRequest.reason });
  return steps;
}

/** No failed attempt was classified, so there is nothing to plan from. */
function unclassifiedPlan(chain: AutomationStudioRuntimePatchRequestDecision): AutomationStudioRuntimeRecoveryPlan {
  return {
    schemaVersion: "automation-studio.recovery-plan.v1",
    loopStage: "plan",
    source: "deterministic",
    candidateKind: "diagnosis_only",
    diagnosis: {
      schemaVersion: "automation-studio.structured-diagnosis.v1",
      failureClass: "ambiguous_or_unknown",
      candidateKind: "diagnosis_only",
      source: "deterministic",
      stillAchievable: "unknown",
      deterministicRecoveryPossible: "unknown",
      explorationNeeded: false,
      patchNeeded: false,
      modelFields: [],
      refusals: ["No failed attempt reached the diagnosis, so nothing was classified."]
    },
    steps: [{ action: "stop", reason: "No failed attempt reached the diagnosis, so there is nothing to plan." }],
    allowedPatchKinds: [],
    policyRefusals: [],
    explorationRequested: false,
    patchRequest: chain
  };
}
