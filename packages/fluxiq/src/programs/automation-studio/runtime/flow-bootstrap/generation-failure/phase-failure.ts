// The failure a build's own catch raises, from the phase it had reached.
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES,
  FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE,
  type AutomationStudioFlowBootstrapFailureStage,
  type AutomationStudioFlowBootstrapPhaseFailureCode
} from "./codes.ts";
import type { AutomationStudioLlmRequestRefusalCode } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { AutomationStudioFlowBootstrapGenerationError, parseAutomationStudioFlowBootstrapGenerationError } from "./error.ts";
import { automationStudioFlowBootstrapFailureState, automationStudioFlowBootstrapProviderStatus } from "./failure-state.ts";
import { flowBootstrapThrownIssueCodes } from "./thrown-issue-codes.ts";

/**
 * The failure for a phase, under the most specific code the caller can vouch
 * for.
 *
 * A requested code that does not belong to the stage, or that requires
 * something a phase failure cannot supply -- the accounting of a refused
 * harness request, the question a needs-permission ending asks -- falls back to
 * the stage's default: a less specific code that is true beats a specific one
 * that is not, and a diagnostic whose code and fields disagree does not read
 * back at all.
 */
export function flowBootstrapPhaseFailure(
  stage: AutomationStudioFlowBootstrapFailureStage,
  accounting?: AutomationStudioFlowBootstrapFailureDiagnostic["accounting"],
  requestedCode?: AutomationStudioFlowBootstrapPhaseFailureCode,
  /** What the catch caught, where it recognised nothing: named by class and Core frame, never by message. */
  thrown?: unknown
): AutomationStudioFlowBootstrapGenerationError {
  const code = phaseFailureCode(stage, accounting, requestedCode);
  const issueCodes = flowBootstrapThrownIssueCodes(thrown);
  const state = automationStudioFlowBootstrapFailureState(code, stage, automationStudioFlowBootstrapProviderStatus(accounting?.providerStatus));
  // A phase failure names a cost only where the record would be wrong without
  // one. Past the request the accounting is what the build actually spent; at
  // the request itself it is a running total that may belong to calls this
  // failure had nothing to do with, so it stays behind.
  const keepAccounting = accounting !== undefined && (state.accounting === "required"
    || (state.accounting === "optional" && stage !== "provider_request"));
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage,
    retryable: state.retryable,
    providerInvocation: state.providerInvocation,
    providerResponse: state.providerResponse,
    ...(keepAccounting ? { accounting } : {}),
    ...(issueCodes.length ? { issueCodes } : {})
  });
}

function phaseFailureCode(
  stage: AutomationStudioFlowBootstrapFailureStage,
  accounting: AutomationStudioFlowBootstrapFailureDiagnostic["accounting"],
  requestedCode: AutomationStudioFlowBootstrapPhaseFailureCode | undefined
): AutomationStudioFlowBootstrapPhaseFailureCode {
  const allowedCodes = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES[stage] as readonly string[];
  if (!requestedCode || !allowedCodes.includes(requestedCode)) return FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE[stage];
  const state = automationStudioFlowBootstrapFailureState(requestedCode, stage, undefined);
  const unsupplied = (state.accounting === "required" && accounting === undefined) || state.permissionRequest === "required";
  return unsupplied ? FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE[stage] : requestedCode;
}

/**
 * Which kind of throw the build's catch caught, where it recognised neither a
 * Flow Bootstrap failure nor a refusal it has a name for.
 *
 * Only for `provider_request`, whose default is the misleading one: the other
 * stages' defaults already say what happened. A DOMException is how both an
 * abort and a deadline arrive; a TypeError or RangeError is a defect in Core
 * rather than a condition of the run; anything else was thrown deliberately by
 * one of Core's own guards. Which of the three it was travels; the message never
 * does.
 *
 * `runtime/service.ts` held a private copy of this until 2026-09-26; two copies
 * of a classification is the shape that produced the defect this directory was
 * split to fix, so it now calls this one.
 *
 * `fallback` is for a caller that has tracked something more specific than the
 * stage default -- the build's own catch knows which phase-specific code it had
 * reached, and answering the stage's generic default there would throw away the
 * one thing the caller knew. Absent, the stage's default stands, which is what
 * every caller without such a code wants.
 */
export function flowBootstrapUnclassifiedThrowCode(
  error: unknown,
  stage: AutomationStudioFlowBootstrapFailureStage,
  fallback?: AutomationStudioFlowBootstrapPhaseFailureCode
): AutomationStudioFlowBootstrapPhaseFailureCode {
  if (stage !== "provider_request") return fallback ?? FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE[stage];
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return "flow_bootstrap.aborted_or_timed_out";
  if (error instanceof TypeError || error instanceof RangeError) return "flow_bootstrap.internal_error";
  if (error instanceof Error) return "flow_bootstrap.unexpected_error";
  return fallback ?? FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE[stage];
}

/**
 * The diagnostic for a caught value, whatever it is. Never `null`.
 *
 * **This exists because `null` is what erases a live failure.** A caller that
 * asks the parser alone and has nothing to do with `null` invents a word for it:
 * `runtime/service.ts`'s wrong-answer re-author answered `flow_bootstrap.extend_failed`
 * -- a code belonging to no stage, which nothing can read back and which says
 * only that something went wrong -- and that is the whole account
 * `run-muhubegx-9469de5e` left of its repair. A value that carries a diagnostic
 * gives it up here; one that does not is named by the kind of throw it is, at the
 * stage the caller can vouch for, with that stage's provider-invocation state.
 *
 * `stage` is what the caller knows, not a guess: the phase it had reached when
 * the throw came out of it.
 */
export function automationStudioFlowBootstrapFailureDiagnosticOf(
  error: unknown,
  stage: AutomationStudioFlowBootstrapFailureStage
): AutomationStudioFlowBootstrapFailureDiagnostic {
  const refused = flowBootstrapRequestRefusalCode(error);
  if (refused) return flowBootstrapPhaseFailure("pre_provider_validation", undefined, refused).diagnostic;
  return parseAutomationStudioFlowBootstrapGenerationError(error)
    ?? flowBootstrapPhaseFailure(stage, undefined, flowBootstrapUnclassifiedThrowCode(error, stage)).diagnostic;
}

/**
 * The build's code for a model request one of Core's guards refused to build.
 *
 * Whatever stage the caller vouches for, a refused request was never sent, so
 * it is `pre_provider_validation` with the guard named. Recognised by the
 * error's `name` and `code` rather than its class, because this directory takes
 * only types from `runtime/llm`.
 */
const FLOW_BOOTSTRAP_REQUEST_REFUSAL_CODES: { readonly [Code in AutomationStudioLlmRequestRefusalCode]: AutomationStudioFlowBootstrapPhaseFailureCode } = Object.freeze({
  "llm.request.evidence_denied_key": "flow_bootstrap.request_refused_evidence_denied_key",
  "llm.request.routing_denied_key": "flow_bootstrap.request_refused_routing_denied_key",
  "llm.request.denied_keys_undeclared": "flow_bootstrap.request_refused_denied_keys_undeclared",
  "llm.request.reusable_context_invalid": "flow_bootstrap.request_refused_reusable_context_invalid",
  "llm.request.diagnosis_misplaced": "flow_bootstrap.request_refused_diagnosis_misplaced",
  "llm.request.failure_evidence_invalid": "flow_bootstrap.request_refused_failure_evidence_invalid",
  "llm.request.exploration_evidence_invalid": "flow_bootstrap.request_refused_exploration_evidence_invalid"
});

function flowBootstrapRequestRefusalCode(error: unknown): AutomationStudioFlowBootstrapPhaseFailureCode | undefined {
  if (!(error instanceof Error) || error.name !== "AutomationStudioLlmRequestRefusedError") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && Object.hasOwn(FLOW_BOOTSTRAP_REQUEST_REFUSAL_CODES, code)
    ? FLOW_BOOTSTRAP_REQUEST_REFUSAL_CODES[code as AutomationStudioLlmRequestRefusalCode]
    : undefined;
}
