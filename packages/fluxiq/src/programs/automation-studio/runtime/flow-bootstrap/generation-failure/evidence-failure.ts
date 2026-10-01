// The failures of a build that reached its exploration: the loop's own endings,
// a completed plan the checks refused, decisions that never became usable, and
// the one ending that is a question for a person rather than a fault.
//
// Each carries the loop's progress at the moment it stopped, because that is
// what says how much of the build's cost bought what.
import type {
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopExhaustion,
  AutomationStudioLlmEvidenceLoopFailureCode,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace
} from "../../llm/index.ts";
import type { AutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
import { automationStudioFlowBootstrapEvidenceSteps } from "../evidence-loop-steps.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES, type AutomationStudioFlowBootstrapBuildEnding } from "./build-ending.ts";
import type { AutomationStudioFlowBootstrapPhaseFailureCode } from "./codes.ts";
import { flowBootstrapDiagnosticIssueCodes, type AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "./error.ts";
import { automationStudioFlowBootstrapFailureState } from "./failure-state.ts";

type EvidenceAccounting = NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>;
type IncompleteDraftPointer = NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["incompleteDraft"]>;

const EVIDENCE_LOOP_FAILURE_CODES: Record<AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioFlowBootstrapPhaseFailureCode> = {
  "llm_evidence_loop.invalid_configuration": "flow_bootstrap.evidence_invalid_configuration",
  "llm_evidence_loop.invalid_decision": "flow_bootstrap.evidence_invalid_decision",
  "llm_evidence_loop.unknown_tool": "flow_bootstrap.evidence_unknown_tool",
  "llm_evidence_loop.duplicate_call": "flow_bootstrap.evidence_duplicate_call",
  "llm_evidence_loop.duplicate_tool_request": "flow_bootstrap.evidence_duplicate_tool_request",
  "llm_evidence_loop.repeat_without_progress": "flow_bootstrap.evidence_repeat_without_progress",
  "llm_evidence_loop.tool_failed": "flow_bootstrap.evidence_tool_failed",
  "llm_evidence_loop.evidence_limit": "flow_bootstrap.evidence_limit",
  "llm_evidence_loop.iteration_limit": "flow_bootstrap.evidence_iteration_limit",
  "llm_evidence_loop.cancelled": "flow_bootstrap.evidence_cancelled",
  // A build ends this way through its phases, with a message (`../unfinished-build/replies-unreadable.ts`);
  // a caller that publishes the loop's ending itself has only the code, and it names what happened.
  "llm_evidence_loop.unreadable_replies": "flow_bootstrap.provider_response_malformed",
  // The same for a provider that stopped answering (`../unfinished-build/provider-unavailable.ts`).
  "llm_evidence_loop.provider_unavailable": "flow_bootstrap.provider_timeout"
};

/**
 * The loop's own endings, each published under its own code.
 *
 * **An ending that ran out of turns is published as that, and as retryable.**
 * It arrives here as `llm_evidence_loop.iteration_limit` carrying the loop's
 * exhaustion record, and both travel: the record says which allowance ran out
 * and how far the draft had got, and the last refusal's codes -- context for the
 * ending, never its cause -- travel as `issueCodes`. That refusal used to *be*
 * the ending (`runtime/llm/evidence-loop/exhaustion.ts` says what that cost).
 *
 * `retryable` is read from the one table this and the parser share, so a
 * producer cannot write a state a reader will refuse.
 */
export function flowBootstrapEvidenceLoopFailure(
  result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>,
  /** What the loop spent before it ended, when the caller can say. */
  accounting?: EvidenceAccounting,
  /** The incomplete draft the build kept, when it kept one (`../incomplete-draft/`). */
  incompleteDraft?: IncompleteDraftPointer
): AutomationStudioFlowBootstrapGenerationError {
  const code = EVIDENCE_LOOP_FAILURE_CODES[result.code];
  const issueCodes = flowBootstrapDiagnosticIssueCodes(result.exhaustion?.lastIssueCodes ?? []);
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage: "provider_output_validation",
    retryable: automationStudioFlowBootstrapFailureState(code, "provider_output_validation", undefined).retryable,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: { ...evidenceLoopDiagnostic(result, result.exhaustion), ...(incompleteDraft ? { incompleteDraft } : {}) },
    ...(issueCodes.length ? { issueCodes } : {})
  });
}

/**
 * The exploration stopped because its decisions kept coming back unusable:
 * malformed replies, timeouts, or completed plans that kept being refused.
 *
 * Built from the loop's progress at the moment it stopped, which is all a
 * stopped loop has: it never produced a result. The last refusal's issue codes
 * say why.
 */
export function flowBootstrapEvidenceUnusableDecisionFailure(
  progress: EvidenceLoopProgress & { issueCodes: readonly string[] },
  accounting?: EvidenceAccounting
): AutomationStudioFlowBootstrapGenerationError {
  const issueCodes = flowBootstrapDiagnosticIssueCodes(progress.issueCodes);
  return new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.evidence_unusable_decision",
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: evidenceLoopDiagnostic(progress),
    ...(issueCodes.length ? { issueCodes } : {})
  });
}

export function flowBootstrapEvidenceCompletionFailure(
  result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>,
  accounting: EvidenceAccounting,
  code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode,
    | "flow_bootstrap.evidence_completion_wrapper_invalid"
    | "flow_bootstrap.evidence_completion_plan_invalid"
    | "flow_bootstrap.evidence_completion_profile_limit_exceeded"
    | "flow_bootstrap.evidence_completion_parameters_unresolved"
    | "flow_bootstrap.evidence_completion_cannot_answer"
    | "flow_bootstrap.evidence_completion_cannot_reach_start">,
  /** The codes that refused the plan. Anything that is not a code is dropped. */
  issues: ReadonlyArray<{ code: string }> = []
): AutomationStudioFlowBootstrapGenerationError {
  const issueCodes = flowBootstrapDiagnosticIssueCodes(issues.map((issue) => issue.code));
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    accounting,
    evidenceLoop: evidenceLoopDiagnostic(result),
    ...(issueCodes.length ? { issueCodes } : {})
  });
}

/**
 * The build stopped to ask a person: an action it needed would have had a
 * lasting consequence it was not permitted.
 *
 * Built from the loop's progress at the moment the request was raised, which
 * ended it; the request is Core's own, already bounded by the gate that raised
 * it. Not retryable as it stands -- the same permitted consequences would ask
 * the same question -- but a build that is also permitted
 * `permissionRequest.missing` can go on.
 */
export function flowBootstrapPermissionRequiredFailure(
  request: AutomationStudioActionPermissionRequest,
  progress: EvidenceLoopProgress,
  accounting?: EvidenceAccounting
): AutomationStudioFlowBootstrapGenerationError {
  return new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.permission_required",
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: evidenceLoopDiagnostic(progress),
    permissionRequest: request
  });
}

/**
 * The build stopped because only a person could get past what it met, and the
 * person did not.
 *
 * Built like the permission ending, from the loop's progress when the build
 * was stopped. Not retryable as it stands: the same site would put the same
 * check in front of the next build, and FluxIQ never answers one itself. The
 * one issue code says why the person did not get it past, from the closed list
 * `../person-needed.ts` writes.
 */
export function flowBootstrapUserInterventionRequiredFailure(
  reason: string,
  progress: EvidenceLoopProgress,
  accounting?: EvidenceAccounting
): AutomationStudioFlowBootstrapGenerationError {
  const issueCodes = flowBootstrapDiagnosticIssueCodes([reason]);
  return new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.user_intervention_required",
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: evidenceLoopDiagnostic(progress),
    ...(issueCodes.length ? { issueCodes } : {})
  });
}

/**
 * A build that could not finish, after its Flow was tested, judged and
 * repaired (`../unfinished-build/`): not doable, or a budget ran out first.
 *
 * Built from the last live round's loop, which is the one that stopped, with
 * the ending that says to the person why and what was tried. `issueCodes` are
 * the last refusals the model was shown, for a reader that counts; the message
 * never names one.
 */
export function flowBootstrapBuildEndingFailure(
  ending: AutomationStudioFlowBootstrapBuildEnding,
  progress: EvidenceLoopProgress & { exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion | undefined },
  accounting?: EvidenceAccounting,
  incompleteDraft?: IncompleteDraftPointer,
  lastIssueCodes: readonly string[] = []
): AutomationStudioFlowBootstrapGenerationError {
  const code = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES[ending.kind];
  const issueCodes = flowBootstrapDiagnosticIssueCodes(lastIssueCodes);
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage: "provider_output_validation",
    retryable: automationStudioFlowBootstrapFailureState(code, "provider_output_validation", undefined).retryable,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: { ...evidenceLoopDiagnostic(progress, progress.exhaustion), ...(incompleteDraft ? { incompleteDraft } : {}) },
    ...(issueCodes.length ? { issueCodes } : {}),
    ending
  });
}

/** What a loop has recorded so far: a finished result's, or a stopped loop's. */
type EvidenceLoopProgress = {
  /** The loop's rows, each carrying the moment it was recorded where the loop stamped one. */
  trace: readonly (AutomationStudioLlmEvidenceLoopTrace & { at?: number })[];
  accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
};

/**
 * What an exhausted loop publishes about the allowance it ran out of.
 *
 * The last refusal's codes are left behind here on purpose: they travel as the
 * diagnostic's `issueCodes`, so a reader has one place to look for issue codes
 * rather than two that can disagree.
 */
function evidenceLoopExhausted(
  exhaustion: AutomationStudioLlmEvidenceLoopExhaustion
): NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["exhausted"]> {
  return {
    bound: exhaustion.bound,
    maxIterations: exhaustion.maxIterations,
    iterations: exhaustion.iterations,
    draftSteps: exhaustion.draftSteps,
    proposableSteps: exhaustion.proposableSteps,
    completionAttempts: exhaustion.completionAttempts,
    ...(exhaustion.budgetBound ? { budgetBound: exhaustion.budgetBound } : {})
  };
}

function evidenceLoopDiagnostic(
  result: EvidenceLoopProgress,
  /** Present only for the one ending that ran out of something. */
  exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion
): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]> {
  const steps = automationStudioFlowBootstrapEvidenceSteps(result.trace);
  return {
    iterationCount: result.accounting.iterations,
    // Decisions, not trace rows. One decision is one paid call, and the loop
    // writes two rows for the one kind of decision that edits the draft and
    // re-runs a step, so counting rows here reported a refused build as having
    // made more calls than it did -- the same defect the created build's audit
    // had (`runtime/service/flow-bootstrap-commands/evidence-trace.ts`), fixed
    // in the same work so the two paths cannot disagree about what a call is.
    decisionCount: new Set(result.trace.flatMap((item) => item.iteration > 0 ? [item.iteration] : [])).size,
    toolCallCount: result.accounting.toolCalls,
    evidenceBytes: result.accounting.evidenceBytes,
    ...(steps.length ? { steps } : {}),
    ...(exhaustion ? { exhausted: evidenceLoopExhausted(exhaustion) } : {})
  };
}
