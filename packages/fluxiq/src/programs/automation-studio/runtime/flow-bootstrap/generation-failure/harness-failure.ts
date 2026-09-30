// A harness refusal projected into a Flow Bootstrap failure: its code and the
// stage it belongs to, the request's accounting, and -- where a provider
// answered -- what it said when it refused.
//
// The arms here decide only *which* failure this is. Its own fields --
// retryability, whether the provider was reached, what came back -- come from
// `automationStudioFlowBootstrapFailureState`, the one table the parser reads
// too, so a projection cannot describe a state the reader will refuse. Three
// copies of that decision used to exist; this file held one of them.
import { parseAutomationStudioLlmProviderRefusal } from "../../provider-refusal/index.ts";
// The leaf, not `runtime/llm/`: this directory and that one are a module cycle
// (`harness-vocabulary.ts`), and a value read through the `llm/` barrel from
// here left its `export *` half-copied under vite-node.
import {
  automationStudioLlmExecutionGrantRefusedAfterResponse,
  type AutomationStudioLlmExecutionGrantCallRefusalReason,
  type AutomationStudioLlmExecutionGrantRefusalCode
} from "../../llm/grant-refusal/index.ts";
import type {
  AutomationStudioLlmDiagnostic,
  AutomationStudioLlmProviderMetadata,
  AutomationStudioLlmProviderInvocationState,
  AutomationStudioLlmProviderPreflightErrorCode,
  AutomationStudioLlmRunBudgetDiagnostic,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmUsageSummary
} from "../../llm/index.ts";
import type { AutomationStudioLlmProviderRefusal } from "../../provider-refusal/index.ts";
import type { AutomationStudioFlowBootstrapFailureStage, AutomationStudioFlowBootstrapPhaseFailureCode } from "./codes.ts";
import { flowBootstrapDiagnosticIssueCodes } from "./diagnostic.ts";
import { parseAutomationStudioFlowBootstrapProviderThrow } from "./diagnostic-parse.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "./error.ts";
import { automationStudioFlowBootstrapFailureState, automationStudioFlowBootstrapProviderStatus } from "./failure-state.ts";
import { FLOW_BOOTSTRAP_EXECUTION_GRANT_CODES, FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES, FLOW_BOOTSTRAP_RUN_BUDGET_CODES } from "./harness-vocabulary.ts";

export function flowBootstrapHarnessFailure(input: {
  diagnostics: AutomationStudioLlmDiagnostic[];
  request: AutomationStudioLlmTaskRequest;
  provider?: AutomationStudioLlmProviderMetadata;
  usage?: AutomationStudioLlmUsageSummary;
  /** Observed by the provider/harness; provider metadata alone proves nothing. */
  providerInvocation: AutomationStudioLlmProviderInvocationState;
  /**
   * What the provider answered, when it answered a refusal. It arrives typed on
   * the harness result (`AutomationStudioLlmTaskResult.providerRefusal`) and is
   * re-read here through the parser the reader uses, so this projection cannot
   * store a record the stored-diagnostic parse would refuse.
   */
  providerRefusal?: AutomationStudioLlmProviderRefusal;
}): AutomationStudioFlowBootstrapGenerationError {
  // Harness-owned provider/output diagnostics are appended after instruction
  // diagnostics. Select the newest error so an earlier instruction diagnostic
  // cannot mask the actual provider failure at this projection boundary.
  const error = findLastError(input.diagnostics);
  const refusedGrant = executionGrantHarnessFailure(error, input);
  if (refusedGrant) return refusedGrant;
  const projected = input.provider
    ? resolvedProviderHarnessFailure(error?.code)
    : { ...preProviderHarnessFailure(error?.code), stage: "pre_provider_validation" as const };
  const request = {
    requestId: input.request.requestId,
    estimatedInputTokens: input.request.estimatedInputTokens
  };
  // A refusal made before the call keeps the request's accounting and nothing
  // else -- no provider, no model, no status, no usage -- whichever branch it
  // arrived on. The provider branch used to add the provider and model it *would*
  // have called, so the same refused reservation was recorded two different ways
  // depending on whether the harness happened to hand over its metadata, and the
  // record named a provider in the same breath as saying no request was made.
  // `provider` here means the provider that answered, which is what the harness
  // result now means by it too.
  if (projected.stage === "pre_provider_validation") return harnessFailure({ ...projected, providerInvocation: input.providerInvocation, accounting: request });
  const providerStatus = automationStudioFlowBootstrapProviderStatus(error?.metadata?.providerStatus);
  // Re-read through the reader's own parse, never stored as handed over: an
  // adapter may pass the typed field without `provider-contract.ts` bounding it
  // (`error.refusal ?? parse(error.responseBody)`), and a record the reader
  // would refuse does not lose the refusal, it loses the whole diagnostic.
  const providerRefusal = parseAutomationStudioLlmProviderRefusal(input.providerRefusal);
  // What an untyped throw was, where the failure is the one code that says only
  // that something threw -- by either path to it, the normalizer's
  // `llm.provider_request_failed` or an unrecognised code whose diagnostic
  // happens to carry one. Re-read through the reader's parse for the refusal's
  // reason: a value it would refuse would take the whole diagnostic with it, so
  // one that does not parse is left out and the failure keeps its code.
  const providerThrow = projected.code === "flow_bootstrap.provider_transport_unknown"
    ? parseAutomationStudioFlowBootstrapProviderThrow(error?.metadata?.providerThrow) ?? undefined
    : undefined;
  return harnessFailure({
    ...projected,
    providerInvocation: input.providerInvocation,
    providerStatus,
    ...(providerThrow ? { providerThrow } : {}),
    accounting: {
      ...request,
      ...(input.provider?.provider ? { provider: input.provider.provider } : {}),
      ...(input.provider?.model ? { model: input.provider.model } : {}),
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      ...(providerRefusal ? { providerRefusal } : {}),
      ...(input.usage?.inputTokens !== undefined ? { inputTokens: input.usage.inputTokens } : {}),
      ...(input.usage?.outputTokens !== undefined ? { outputTokens: input.usage.outputTokens } : {}),
      ...(input.usage?.totalTokens !== undefined ? { totalTokens: input.usage.totalTokens } : {}),
      ...(input.usage?.estimatedCostUsd !== undefined ? { estimatedCostUsd: input.usage.estimatedCostUsd } : {})
    }
  });
}

/**
 * A call the grant refused, under the grant's own code, with the check that
 * refused it as the one issue code.
 *
 * These reached the `llm.provider_request_failed` arm below and were published
 * as `provider_transport_unknown` -- a request whose answer is unknown -- for a
 * call no request had been made for. `run-mun5e1ie-5aeefbbd` ended its first
 * decision that way, and nothing in its record could say which check it was.
 * All but one were refused before anything was sent, so they belong to provider
 * resolution and carry no accounting; the one raised after the provider
 * answered keeps the request stage and the call's accounting.
 */
function executionGrantHarnessFailure(
  error: AutomationStudioLlmDiagnostic | undefined,
  input: { request: AutomationStudioLlmTaskRequest; provider?: AutomationStudioLlmProviderMetadata }
): AutomationStudioFlowBootstrapGenerationError | undefined {
  const grantCode = error?.code;
  if (typeof grantCode !== "string" || !Object.hasOwn(FLOW_BOOTSTRAP_EXECUTION_GRANT_CODES, grantCode)) return undefined;
  const reason = error?.metadata?.grantRefusalReason;
  const afterResponse = typeof reason === "string" && automationStudioLlmExecutionGrantRefusedAfterResponse(reason as AutomationStudioLlmExecutionGrantCallRefusalReason);
  const code: AutomationStudioFlowBootstrapPhaseFailureCode = afterResponse
    ? "flow_bootstrap.execution_grant_revoked_in_flight"
    : FLOW_BOOTSTRAP_EXECUTION_GRANT_CODES[grantCode as AutomationStudioLlmExecutionGrantRefusalCode];
  const stage: AutomationStudioFlowBootstrapFailureStage = afterResponse ? "provider_request" : "provider_resolution";
  const state = automationStudioFlowBootstrapFailureState(code, stage, undefined);
  const issueCodes = typeof reason === "string" ? flowBootstrapDiagnosticIssueCodes([`llm.execution_grant.${reason}`]) : [];
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage,
    retryable: state.retryable,
    providerInvocation: state.providerInvocation,
    providerResponse: state.providerResponse,
    ...(issueCodes.length ? { issueCodes } : {}),
    ...(afterResponse ? {
      accounting: {
        requestId: input.request.requestId,
        estimatedInputTokens: input.request.estimatedInputTokens,
        ...(input.provider?.provider ? { provider: input.provider.provider } : {}),
        ...(input.provider?.model ? { model: input.provider.model } : {})
      }
    } : {})
  });
}

function harnessFailure(projected: {
  code: AutomationStudioFlowBootstrapPhaseFailureCode;
  stage: AutomationStudioFlowBootstrapFailureStage;
  issueCodes?: string[];
  providerStatus?: number | undefined;
  providerInvocation: AutomationStudioLlmProviderInvocationState;
  accounting: NonNullable<AutomationStudioFlowBootstrapGenerationError["diagnostic"]["accounting"]>;
  providerThrow?: AutomationStudioFlowBootstrapGenerationError["diagnostic"]["providerThrow"];
}): AutomationStudioFlowBootstrapGenerationError {
  const state = automationStudioFlowBootstrapFailureState(projected.code, projected.stage, projected.providerStatus);
  return new AutomationStudioFlowBootstrapGenerationError({
    code: projected.code,
    stage: projected.stage,
    retryable: state.retryable,
    providerInvocation: state.acceptedProviderInvocations.includes(projected.providerInvocation) ? projected.providerInvocation : state.providerInvocation,
    providerResponse: state.providerResponse,
    ...(projected.issueCodes?.length ? { issueCodes: projected.issueCodes } : {}),
    accounting: projected.accounting,
    ...(projected.providerThrow ? { providerThrow: projected.providerThrow } : {})
  });
}

/**
 * The failure a harness refusal made before the provider was resolved is
 * projected to. Every one of these codes keeps the request's accounting, which
 * is why they are also the pre-provider codes the parser admits accounting for.
 *
 * The `default` arm is a catch-all in the same way the provider branch's is, so
 * it carries the harness code it could not name for the same reason.
 */
function preProviderHarnessFailure(code: unknown): { code: AutomationStudioFlowBootstrapPhaseFailureCode; issueCodes?: string[] } {
  const projected = preProviderHarnessFailureCode(code);
  return { code: projected, ...(projected === "flow_bootstrap.harness_preflight_failed" ? unnamedHarnessCode(code) : {}) };
}

function preProviderHarnessFailureCode(code: unknown): AutomationStudioFlowBootstrapPhaseFailureCode {
  switch (code) {
    case "llm.provider_input_budget_exceeded": return "flow_bootstrap.pre_provider_input_budget_exceeded";
    case "llm.provider_request_context_unbounded": return "flow_bootstrap.pre_provider_request_context_unbounded";
    case "llm.provider_request_limits_invalid": return "flow_bootstrap.pre_provider_request_limits_invalid";
    case "llm.provider_request_construction_failed": return "flow_bootstrap.pre_provider_request_construction_failed";
    case "llm.provider_request_setup_failed": return "flow_bootstrap.pre_provider_request_setup_failed";
    case "llm_budget.input_limit_exceeded": return "flow_bootstrap.pre_provider_input_limit_exceeded";
    case "llm_budget.request_total_exceeded": return "flow_bootstrap.pre_provider_request_total_exceeded";
    case "llm_budget.invalid_cost_limit": return "flow_bootstrap.pre_provider_invalid_cost_limit";
    case "llm.provider_invalid_timeout": return "flow_bootstrap.pre_provider_invalid_timeout";
    case "llm_budget.invalid_token_limit":
    case "llm_budget.absolute_token_ceiling":
    case "llm_budget.input_exceeds_total":
    case "llm_budget.output_exceeds_total": return "flow_bootstrap.pre_provider_invalid_token_limits";
    case "evidence_loop.context_missing":
    case "bootstrap.registry_context_missing":
    case "bootstrap.instructions_missing":
    case "bootstrap.catalog_empty":
    case "bootstrap.catalog_essentials_missing": return "flow_bootstrap.pre_provider_context_invalid";
    default: return runBudgetFailureCode(code) ?? "flow_bootstrap.harness_preflight_failed";
  }
}

function findLastError(diagnostics: AutomationStudioLlmDiagnostic[]): AutomationStudioLlmDiagnostic | undefined {
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    if (diagnostics[index]?.severity === "error") return diagnostics[index];
  }
  return undefined;
}

type ProjectedHarnessFailure = {
  code: AutomationStudioFlowBootstrapPhaseFailureCode;
  stage: AutomationStudioFlowBootstrapFailureStage;
  /** The harness code this projection could not name, where it could not name one. */
  issueCodes?: string[];
};

/**
 * Which failure a harness refusal is, once a provider has been resolved.
 *
 * A resolved provider does not mean a request was sent, which is what this
 * branch used to assume: it read the presence of provider metadata as the
 * request having happened.
 */
function resolvedProviderHarnessFailure(code: unknown): ProjectedHarnessFailure {
  // **Unreachable from the harness, and kept deliberately.** A refused run-budget
  // reservation no longer returns the provider's metadata at all, so it arrives
  // through the pre-provider branch, which projects these same six codes; that
  // was the other half of this fix, made in `runtime/llm/harness/run.ts` while
  // this arm was being written. It stays because the failure mode it guards is
  // the worst one available here: any result that carries provider metadata
  // beside a run-budget refusal would otherwise fall to the `default` arm below
  // and be published as an attempted provider request whose answer is unknown --
  // a request that was never made, which is precisely the claim two live runs
  // were read on for a day. A stage and a state that are true cost one lookup.
  const runBudget = runBudgetFailureCode(code);
  if (runBudget) return { code: runBudget, stage: "pre_provider_validation" };
  if (typeof code === "string" && Object.hasOwn(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES, code)) {
    return { code: FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES[code as AutomationStudioLlmProviderPreflightErrorCode], stage: "provider_request" };
  }
  switch (code) {
    case "llm.provider_auth_failed": return providerRequest("flow_bootstrap.provider_auth_failed");
    case "llm.provider_rate_limited": return providerRequest("flow_bootstrap.provider_rate_limited");
    case "llm.provider_timeout": return providerRequest("flow_bootstrap.provider_timeout");
    case "llm.provider_aborted": return providerRequest("flow_bootstrap.provider_aborted");
    case "llm.provider_redirect_rejected": return providerRequest("flow_bootstrap.provider_redirect_rejected");
    case "llm.provider_http_error": return providerRequest("flow_bootstrap.provider_http_error");
    case "llm.provider_network_error": return providerRequest("flow_bootstrap.provider_network_error");
    case "llm.provider_secret_unavailable": return providerRequest("flow_bootstrap.provider_secret_unavailable");
    case "llm.provider_malformed_response": return providerOutput("flow_bootstrap.provider_response_malformed");
    case "llm.provider_output_invalid": return providerOutput("flow_bootstrap.provider_output_invalid");
    case "llm.provider_response_oversize": return providerOutput("flow_bootstrap.provider_response_oversize");
    case "llm.provider_output_padding_truncated": return providerOutput("flow_bootstrap.provider_output_padding_truncated");
    case "llm.provider_output_truncated": return providerOutput("flow_bootstrap.provider_output_truncated");
    case "llm.provider_usage_invalid": return providerOutput("flow_bootstrap.provider_usage_invalid");
    case "llm.provider_usage_limit_exceeded": return providerOutput("flow_bootstrap.provider_usage_limit_exceeded");
    case "llm_output.provider_result_too_large": return providerOutput("flow_bootstrap.provider_output_oversize");
    case "llm_usage.input_limit_exceeded":
    case "llm_usage.output_limit_exceeded":
    case "llm_usage.total_limit_exceeded":
      return providerOutput("flow_bootstrap.provider_usage_limit_exceeded");
    case "llm_usage.invalid":
    case "llm_usage.invalid_token_count":
    case "llm_usage.invalid_cost":
    case "llm_usage.inconsistent_total":
      return providerOutput("flow_bootstrap.provider_usage_invalid");
    // A request that failed and says nothing else -- what
    // `normalizedAutomationStudioLlmProviderFailure` answers for a throw it
    // could not structurally type. One of the two paths to
    // `provider_transport_unknown`, the honest one, and the one that fits
    // `run-muhs8hx3-6fd929e6` and `run-muhtuizo-c458e49c` (see
    // `harness-vocabulary.ts`).
    case "llm.provider_request_failed": return providerRequest("flow_bootstrap.provider_transport_unknown");
    default: {
      // The other path: a code this projection does not recognise. It is the one
      // place a failure's provider-invocation state is not observed, and the
      // reason a refused run-budget reservation was recorded for months as a
      // transport failure that never happened.
      //
      // **A code arriving here now names itself.** It travels as an issue code,
      // because the two runs above could only ever be narrowed by elimination:
      // the stored record kept the projected code and dropped the harness code
      // behind it, so "which refusal was this" had no answer in the evidence and
      // three tasks argued it from the shape of the surrounding fields. The next
      // one says so outright. Naming the code is still the remedy; this is what
      // makes it possible to name.
      const unnamed = unnamedHarnessCode(code);
      return typeof code === "string" && (code.startsWith("llm_output.") || code.startsWith("bootstrap.") || code === "llm.provider_diagnostic")
        ? { ...providerOutput("flow_bootstrap.provider_output_invalid"), ...unnamed }
        : { ...providerRequest("flow_bootstrap.provider_transport_unknown"), ...unnamed };
    }
  }
}

/**
 * The harness code a catch-all arm could not name, as the one issue code it
 * publishes -- or nothing, where there was no code or it is not code-shaped.
 *
 * A diagnostic code is Core's own word, and `flowBootstrapDiagnosticIssueCodes`
 * holds it to a code's shape (no whitespace, so no sentence) before it travels.
 * A refusal that arrived with no code at all is left saying nothing rather than
 * publishing an invented word for it.
 */
function unnamedHarnessCode(code: unknown): { issueCodes?: string[] } {
  if (typeof code !== "string") return {};
  const issueCodes = flowBootstrapDiagnosticIssueCodes([code]);
  return issueCodes.length ? { issueCodes } : {};
}

/** The run's spending authority, refused before anything was sent. */
function runBudgetFailureCode(code: unknown): AutomationStudioFlowBootstrapPhaseFailureCode | undefined {
  return typeof code === "string" && Object.hasOwn(FLOW_BOOTSTRAP_RUN_BUDGET_CODES, code)
    ? FLOW_BOOTSTRAP_RUN_BUDGET_CODES[code as AutomationStudioLlmRunBudgetDiagnostic["code"]]
    : undefined;
}

function providerRequest(code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode, `flow_bootstrap.provider_${string}`>): ProjectedHarnessFailure {
  return { code, stage: "provider_request" };
}

function providerOutput(code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode, `flow_bootstrap.provider_${string}`>): ProjectedHarnessFailure {
  return { code, stage: "provider_output_validation" };
}
