// What a diagnostic's own fields must say, given its code and its stage. One
// table, read by everything that writes a diagnostic and by the parser that
// reads one back.
//
// **The producer and the reader used to carry a copy each, and that is what
// erased a live failure.** `flowBootstrapPhaseFailure` derived a
// `provider_request` failure's state from the stage alone -- not retryable, the
// provider's answer unknown -- while the parser held a per-code table and, for
// any code that table did not name, demanded `"received"`. Commit `a8cc85e`
// added three codes to that stage (`aborted_or_timed_out`, `internal_error`,
// `unexpected_error`) and taught only the producer. All three then parsed back
// as `null`, and `null` at the wrong-answer re-author in `runtime/service.ts` is
// reported as the bare word `flow_bootstrap.extend_failed`: the stage, the
// retryability, the provider-invocation state, the provider's answer and the
// accounting all gone. `run-muhubegx-9469de5e` is that failure, and the test
// that guards it (`runtime/tests/service-bootstrap/tests/accounting.test.ts`,
// "attributes an unexpected harness throw conservatively") had been failing on
// `dev` since.
//
// With one function on both sides they cannot disagree: whatever a producer
// writes for a code, the reader computes the same thing for it. A code this file
// has no rule for takes its stage's default state rather than nothing, so the
// worst case is a less specific true statement instead of an erased failure.
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES,
  FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET,
  type AutomationStudioFlowBootstrapFailureStage,
  type AutomationStudioFlowBootstrapPhaseFailureCode
} from "./codes.ts";
import { FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST, FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET } from "./harness-vocabulary.ts";

/**
 * The state a diagnostic with a given code and stage carries.
 *
 * `accounting` is what the record may hold rather than what it does: `required`
 * for the harness refusals whose only trace of the call is its accounting,
 * `absent` where naming a cost would claim a call that was not costed, and
 * `optional` everywhere the harness may attach it and a phase failure may not.
 */
export type AutomationStudioFlowBootstrapFailureState = {
  retryable: boolean;
  /** The canonical state written when no observed harness provenance exists. */
  providerInvocation: AutomationStudioFlowBootstrapFailureDiagnostic["providerInvocation"];
  /** Canonical plus explicitly compatible historical/observed states. */
  acceptedProviderInvocations: readonly AutomationStudioFlowBootstrapFailureDiagnostic["providerInvocation"][];
  providerResponse: AutomationStudioFlowBootstrapFailureDiagnostic["providerResponse"];
  accounting: "required" | "absent" | "optional";
  /**
   * Whether the diagnostic carries the question a person answers. Exactly one
   * code does, and it travels with that code and never without it: a
   * needs-permission ending with nothing to ask is not one, and a request on any
   * other ending would ask a person about a build that stopped for another
   * reason.
   */
  permissionRequest: "required" | "absent";
};

const PERMISSION_REQUIRED_CODE = "flow_bootstrap.permission_required";

/**
 * The endings after the request that another attempt could actually get past.
 *
 * Everything at a stage past `provider_request` was not retryable, on the
 * reasoning that a build refused for what it produced would produce the same
 * thing again. That is true of a plan which cannot answer its instruction and
 * false of a build that ran out of turns: what ran out was calls, and a retry
 * with a larger budget is precisely the answer. `run-mulryg6h-ff241a12` spent
 * its whole allowance exploring competently and published `retryable: false` --
 * the one field an operator acts on, saying the opposite of the truth.
 *
 * A named set rather than exceptions written inline, so the next ending worth
 * retrying is added in one place and the parser reads the same list the
 * producers write from.
 */
const FLOW_BOOTSTRAP_RETRYABLE_AFTER_REQUEST_CODES: ReadonlySet<string> = new Set([
  "flow_bootstrap.evidence_iteration_limit"
] satisfies readonly AutomationStudioFlowBootstrapPhaseFailureCode[]);

type ProviderRequestCode = typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES["provider_request"][number];
type ProviderPreflightCode = typeof FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST[number];

/**
 * A code's rule, before the HTTP status is known.
 *
 * `"server_error"` is retryable exactly when the status is 5xx, and
 * `"by_status"` is an answer received when there is a status and unknown when
 * there is not -- the two things that cannot be settled from the code alone.
 */
type ProviderRequestStateRule = {
  retryable: boolean | "server_error";
  providerInvocation: AutomationStudioFlowBootstrapFailureDiagnostic["providerInvocation"];
  acceptedProviderInvocations?: readonly AutomationStudioFlowBootstrapFailureDiagnostic["providerInvocation"][];
  providerResponse: AutomationStudioFlowBootstrapFailureDiagnostic["providerResponse"] | "by_status";
};

/** Nothing was sent, and nothing about the request has changed, so nothing is worth retrying as it stands. */
const PROVIDER_PREFLIGHT_RULE: ProviderRequestStateRule = { retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received" };

const AMBIGUOUS_PROVIDER_INVOCATIONS = ["unknown", "attempted"] as const;
const PREFLIGHT_WITH_LEGACY_ATTEMPTED = ["not_attempted", "attempted"] as const;

/**
 * Every `provider_request` code that is not one of the provider's own pre-flight
 * refusals, which all say the same thing and are answered by the set above.
 *
 * Keyed by the stage's own code list, so a code added there without a rule here
 * fails the type check -- which is the check that was missing when `a8cc85e`
 * added three.
 */
const FLOW_BOOTSTRAP_PROVIDER_REQUEST_RULES: {
  readonly [Code in Exclude<ProviderRequestCode, ProviderPreflightCode>]: ProviderRequestStateRule
} = Object.freeze({
  // The stage's default: a request was attempted and its answer is unknown.
  "flow_bootstrap.provider_request_failed": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "unknown" },
  "flow_bootstrap.provider_auth_failed": { retryable: false, providerInvocation: "attempted", providerResponse: "received" },
  "flow_bootstrap.provider_rate_limited": { retryable: true, providerInvocation: "attempted", providerResponse: "received" },
  "flow_bootstrap.provider_timeout": { retryable: true, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "not_received" },
  "flow_bootstrap.provider_aborted": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "not_received" },
  "flow_bootstrap.provider_redirect_rejected": { retryable: false, providerInvocation: "attempted", providerResponse: "received" },
  "flow_bootstrap.provider_http_error": { retryable: "server_error", providerInvocation: "attempted", providerResponse: "by_status" },
  "flow_bootstrap.provider_network_error": { retryable: true, providerInvocation: "attempted", providerResponse: "unknown" },
  "flow_bootstrap.provider_secret_unavailable": { retryable: false, providerInvocation: "not_attempted", acceptedProviderInvocations: PREFLIGHT_WITH_LEGACY_ATTEMPTED, providerResponse: "not_received" },
  "flow_bootstrap.execution_grant_revoked_in_flight": { retryable: false, providerInvocation: "attempted", providerResponse: "received" },
  // The three kinds of unrecognised throw. Whether the request had gone out
  // when it was thrown is exactly what is not known, so none of them claims an
  // answer, and none is retryable as it stands: an abort and a Core defect are
  // not, and a deadline arrives as the same DOMException an abort does.
  "flow_bootstrap.aborted_or_timed_out": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "unknown" },
  "flow_bootstrap.internal_error": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "unknown" },
  "flow_bootstrap.unexpected_error": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "unknown" },
  "flow_bootstrap.provider_configuration_invalid": { retryable: false, providerInvocation: "not_attempted", acceptedProviderInvocations: PREFLIGHT_WITH_LEGACY_ATTEMPTED, providerResponse: "not_received" },
  "flow_bootstrap.provider_transport_unknown": { retryable: false, providerInvocation: "unknown", acceptedProviderInvocations: AMBIGUOUS_PROVIDER_INVOCATIONS, providerResponse: "unknown" }
});

/**
 * The fields a diagnostic with this code, at this stage, must carry.
 *
 * `providerStatus` is the status its accounting holds, where it holds one: the
 * two rules that cannot be settled from a code alone need it.
 */
export function automationStudioFlowBootstrapFailureState(
  code: string,
  stage: AutomationStudioFlowBootstrapFailureStage,
  providerStatus: number | undefined
): AutomationStudioFlowBootstrapFailureState {
  return {
    ...providerState(code, stage, providerStatus),
    permissionRequest: code === PERMISSION_REQUIRED_CODE ? "required" : "absent"
  };
}

function providerState(
  code: string,
  stage: AutomationStudioFlowBootstrapFailureStage,
  providerStatus: number | undefined
): Omit<AutomationStudioFlowBootstrapFailureState, "permissionRequest"> {
  if (stage === "pre_provider_validation" || stage === "provider_resolution") {
    return {
      retryable: false,
      providerInvocation: "not_attempted",
      acceptedProviderInvocations: ["not_attempted"],
      providerResponse: "not_received",
      accounting: stage === "pre_provider_validation" && FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET.has(code) ? "required" : "absent"
    };
  }
  if (stage !== "provider_request") {
    return {
      retryable: FLOW_BOOTSTRAP_RETRYABLE_AFTER_REQUEST_CODES.has(code),
      providerInvocation: "attempted",
      acceptedProviderInvocations: ["attempted"],
      providerResponse: "received",
      accounting: "optional"
    };
  }
  const rule = providerRequestRule(code);
  return {
    retryable: rule.retryable === "server_error" ? providerStatus !== undefined && providerStatus >= 500 : rule.retryable,
    providerInvocation: rule.providerInvocation,
    acceptedProviderInvocations: rule.acceptedProviderInvocations ?? [rule.providerInvocation],
    providerResponse: rule.providerResponse === "by_status" ? (providerStatus === undefined ? "unknown" : "received") : rule.providerResponse,
    // The stage default names a request whose answer is unknown, and it is what
    // the catch produces for a throw it could not place. Such a failure must not
    // also claim a cost: the accounting it would carry is the running total of a
    // build that may never have sent anything.
    accounting: code === "flow_bootstrap.provider_request_failed" ? "absent" : "optional"
  };
}

function providerRequestRule(code: string): ProviderRequestStateRule {
  if (FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET.has(code)) return PROVIDER_PREFLIGHT_RULE;
  // A code the table does not name takes the stage's default state. The table is
  // exhaustive over the stage's codes, so this is reached only by a code that
  // does not belong to the stage at all -- and giving it the default is what
  // keeps the producer and the reader in step even then.
  return Object.hasOwn(FLOW_BOOTSTRAP_PROVIDER_REQUEST_RULES, code)
    ? FLOW_BOOTSTRAP_PROVIDER_REQUEST_RULES[code as Exclude<ProviderRequestCode, ProviderPreflightCode>]
    : FLOW_BOOTSTRAP_PROVIDER_REQUEST_RULES["flow_bootstrap.provider_request_failed"];
}

/** An HTTP status a provider could actually have answered with, or nothing. */
export function automationStudioFlowBootstrapProviderStatus(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 400 && (value as number) <= 599
    ? value as number
    : undefined;
}
