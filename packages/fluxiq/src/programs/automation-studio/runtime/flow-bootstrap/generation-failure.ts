import type {
  AutomationStudioLlmDiagnostic,
  AutomationStudioLlmProviderMetadata,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmUsageSummary
} from "../llm/index.ts";
import type {
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopFailureCode,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace
} from "../llm/index.ts";
import type { AutomationStudioLlmProviderPreflightErrorCode } from "../llm/index.ts";
import { parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import { automationStudioFlowBootstrapEvidenceSteps } from "./evidence-loop-steps.ts";

type ProviderPreflightSuffix<Code> = Code extends `llm.provider_${infer Suffix}` ? Suffix : never;

/**
 * Each provider refusal made before a request is sent, under its Flow-bootstrap
 * name. They all used to arrive as one `llm.provider_configuration_invalid` and
 * leave as one `flow_bootstrap.provider_configuration_invalid`, so a refusal
 * could not say which check made it.
 *
 * Keyed by the provider's own codes, so a refusal added there fails the type
 * check until it is named here. Written as literals rather than derived at run
 * time: the DeepSeek adapter reads values out of this directory, so a value
 * read back from `runtime/llm/` here would close a module cycle.
 */
const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES: {
  readonly [Code in AutomationStudioLlmProviderPreflightErrorCode]: `flow_bootstrap.provider_${ProviderPreflightSuffix<Code>}`
} = Object.freeze({
  "llm.provider_secret_reference_invalid": "flow_bootstrap.provider_secret_reference_invalid",
  "llm.provider_model_unsupported": "flow_bootstrap.provider_model_unsupported",
  "llm.provider_response_limit_invalid": "flow_bootstrap.provider_response_limit_invalid",
  "llm.provider_request_identity_invalid": "flow_bootstrap.provider_request_identity_invalid",
  "llm.provider_request_scope_invalid": "flow_bootstrap.provider_request_scope_invalid",
  "llm.provider_request_context_unbounded": "flow_bootstrap.provider_request_context_unbounded",
  "llm.provider_request_task_mismatch": "flow_bootstrap.provider_request_task_mismatch",
  "llm.provider_recent_actions_invalid": "flow_bootstrap.provider_recent_actions_invalid",
  "llm.provider_failure_evidence_invalid": "flow_bootstrap.provider_failure_evidence_invalid",
  "llm.provider_exploration_evidence_invalid": "flow_bootstrap.provider_exploration_evidence_invalid",
  "llm.provider_result_summary_invalid": "flow_bootstrap.provider_result_summary_invalid",
  "llm.provider_recovery_context_invalid": "flow_bootstrap.provider_recovery_context_invalid",
  "llm.provider_flow_bootstrap_context_invalid": "flow_bootstrap.provider_flow_bootstrap_context_invalid",
  "llm.provider_evidence_loop_context_invalid": "flow_bootstrap.provider_evidence_loop_context_invalid",
  "llm.provider_request_limits_invalid": "flow_bootstrap.provider_request_limits_invalid",
  "llm.provider_request_timeout_invalid": "flow_bootstrap.provider_request_timeout_invalid",
  "llm.provider_input_budget_exceeded": "flow_bootstrap.provider_input_budget_exceeded",
  "llm.provider_credential_in_request": "flow_bootstrap.provider_credential_in_request",
  "llm.provider_request_construction_failed": "flow_bootstrap.provider_request_construction_failed",
  "llm.provider_request_setup_failed": "flow_bootstrap.provider_request_setup_failed"
});
const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST = Object.values(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES);
const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET: ReadonlySet<string> = new Set(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST);

export type AutomationStudioFlowBootstrapFailureStage =
  | "pre_provider_validation"
  | "provider_resolution"
  | "provider_request"
  | "provider_output_validation"
  | "post_provider_validation"
  | "persistence";

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES = {
  pre_provider_validation: [
    "flow_bootstrap.pre_provider_validation_failed",
    "flow_bootstrap.invalid_input",
    "flow_bootstrap.generation_lock_failed",
    "flow_bootstrap.blank_target_required",
    "flow_bootstrap.canonical_settings_binding_unavailable",
    "flow_bootstrap.stale_grant_binding",
    "flow_bootstrap.pending_adaptation_exists",
    "flow_bootstrap.pending_adaptation_check_failed",
    "flow_bootstrap.active_instructions_required",
    "flow_bootstrap.instruction_resolution_failed",
    "flow_bootstrap.bootstrap_context_failed",
    "flow_bootstrap.node_catalog_unavailable",
    "flow_bootstrap.required_capabilities_unavailable",
    "flow_bootstrap.evidence_runtime_unavailable",
    "flow_bootstrap.harness_preflight_failed",
    "flow_bootstrap.pre_provider_input_budget_exceeded",
    "flow_bootstrap.pre_provider_request_context_unbounded",
    "flow_bootstrap.pre_provider_request_limits_invalid",
    "flow_bootstrap.pre_provider_request_construction_failed",
    "flow_bootstrap.pre_provider_request_setup_failed",
    "flow_bootstrap.pre_provider_input_limit_exceeded",
    "flow_bootstrap.pre_provider_request_total_exceeded",
    "flow_bootstrap.pre_provider_invalid_cost_limit",
    "flow_bootstrap.pre_provider_invalid_timeout",
    "flow_bootstrap.pre_provider_invalid_token_limits",
    "flow_bootstrap.pre_provider_context_invalid"
  ],
  provider_resolution: [
    "flow_bootstrap.provider_resolution_failed",
    "flow_bootstrap.provider_resolver_unavailable",
    "flow_bootstrap.provider_resolution_invalid"
  ],
  provider_request: [
    "flow_bootstrap.provider_request_failed",
    "flow_bootstrap.provider_auth_failed",
    "flow_bootstrap.provider_rate_limited",
    "flow_bootstrap.provider_timeout",
    "flow_bootstrap.provider_aborted",
    "flow_bootstrap.provider_redirect_rejected",
    "flow_bootstrap.provider_http_error",
    "flow_bootstrap.provider_network_error",
    "flow_bootstrap.provider_secret_unavailable",
    // No longer produced. Kept so a diagnostic stored before the refusals were
    // split still parses.
    "flow_bootstrap.provider_configuration_invalid",
    "flow_bootstrap.provider_transport_unknown",
    ...FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST
  ],
  provider_output_validation: [
    "flow_bootstrap.provider_output_validation_failed",
    "flow_bootstrap.evidence_completion_wrapper_invalid",
    "flow_bootstrap.evidence_completion_plan_invalid",
    "flow_bootstrap.evidence_completion_profile_limit_exceeded",
    // The bound domain would not turn a completed plan's parameters into ones
    // its nodes can run with: a handle it never issued or that went stale, a
    // handle with no resolver bound, or parameters it refused outright.
    "flow_bootstrap.evidence_completion_parameters_unresolved",
    "flow_bootstrap.provider_response_malformed",
    "flow_bootstrap.provider_response_oversize",
    "flow_bootstrap.provider_output_padding_truncated",
    "flow_bootstrap.provider_output_truncated",
    "flow_bootstrap.provider_usage_invalid",
    "flow_bootstrap.provider_usage_limit_exceeded",
    "flow_bootstrap.provider_output_invalid",
    "flow_bootstrap.provider_output_oversize",
    "flow_bootstrap.evidence_invalid_configuration",
    "flow_bootstrap.evidence_invalid_decision",
    "flow_bootstrap.evidence_unknown_tool",
    // No longer produced: the loop gives a reused call id one of its own and
    // answers a repeated request itself. Kept so a stored diagnostic still parses.
    "flow_bootstrap.evidence_duplicate_call",
    "flow_bootstrap.evidence_duplicate_tool_request",
    // The exploration kept repeating itself -- asking again for what it already
    // had, or to look again with nothing changed -- until the no-progress guard.
    "flow_bootstrap.evidence_repeat_without_progress",
    "flow_bootstrap.evidence_tool_failed",
    "flow_bootstrap.evidence_limit",
    "flow_bootstrap.evidence_iteration_limit",
    "flow_bootstrap.evidence_cancelled",
    // The model kept answering with something the exploration could not use --
    // malformed, failing Core's checks, timing out -- so it was stopped: the
    // same refusals came back until the no-progress guard, or refusals ran
    // unbroken to the far backstop.
    "flow_bootstrap.evidence_unusable_decision",
    // Building the Flow needed an action with a lasting consequence the build
    // was not permitted. Not a failure of the build: the diagnostic carries
    // the request a person grants or refuses, and a build whose grant holds
    // what it asks for can take the action.
    "flow_bootstrap.permission_required"
  ],
  post_provider_validation: ["flow_bootstrap.post_provider_validation_failed"],
  persistence: ["flow_bootstrap.persistence_failed"]
} as const;

export type AutomationStudioFlowBootstrapPhaseFailureCode =
  typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES[keyof typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES][number];

const FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE = new Map<string, AutomationStudioFlowBootstrapFailureStage>(
  Object.entries(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES)
    .flatMap(([stage, codes]) => codes.map((code) => [code, stage as AutomationStudioFlowBootstrapFailureStage] as const))
);

export type AutomationStudioFlowBootstrapFailureDiagnostic = {
  code: string;
  stage: AutomationStudioFlowBootstrapFailureStage;
  retryable: boolean;
  providerInvocation: "not_attempted" | "attempted";
  providerResponse: "not_received" | "received" | "unknown";
  accounting?: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    providerStatus?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  evidenceLoop?: {
    iterationCount: number;
    decisionCount: number;
    toolCallCount: number;
    evidenceBytes: number;
    /**
     * Every decision the loop recorded, in order. A decision that called a
     * tool is named by that tool. One that called none is named by
     * `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS`, with the first code
     * that refused it as its `resultCode` -- so a build stopped on refused
     * plans says, decision by decision, what refused each one.
     */
    steps?: Array<{
      toolId: string;
      effectApplied?: boolean;
      resultCode?: string;
    }>;
  };
  /**
   * Why a completed plan was refused, as the issue codes that refused it --
   * validation's own, or a domain's refusal of a node's parameters. Codes
   * only, at most sixteen, never a message.
   */
  issueCodes?: string[];
  /**
   * Present exactly when the code is `flow_bootstrap.permission_required`:
   * what the build needed to do, its consequences, the control as a person
   * would recognise it, and why. What FluxIQ asks the person with.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
};

const MAX_DIAGNOSTIC_ISSUE_CODES = 16;
const DIAGNOSTIC_ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

export function parseAutomationStudioFlowBootstrapFailureDiagnostic(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isRecord(value) || !hasExactFields(value, ["code", "stage", "retryable", "providerInvocation", "providerResponse", "accounting", "evidenceLoop", "issueCodes", "permissionRequest"])) return null;
  if (typeof value.code !== "string" || !FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE.has(value.code)) return null;
  if (!FLOW_BOOTSTRAP_FAILURE_STAGES.has(value.stage as AutomationStudioFlowBootstrapFailureStage)) return null;
  if (value.retryable !== true && value.retryable !== false) return null;
  if (value.providerInvocation !== "not_attempted" && value.providerInvocation !== "attempted") return null;
  if (value.providerResponse !== "not_received" && value.providerResponse !== "received" && value.providerResponse !== "unknown") return null;
  const phaseFailureStage = FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE.get(value.code);
  if (phaseFailureStage && !phaseFailureStateMatches(value, phaseFailureStage)) return null;
  const accounting = parseAccounting(value.accounting);
  if (value.accounting !== undefined && !accounting) return null;
  const evidenceLoop = parseEvidenceLoopCounts(value.evidenceLoop);
  if (value.evidenceLoop !== undefined && !evidenceLoop) return null;
  if (value.issueCodes !== undefined && (!Array.isArray(value.issueCodes) || !value.issueCodes.length
    || value.issueCodes.length > MAX_DIAGNOSTIC_ISSUE_CODES
    || !value.issueCodes.every((code) => typeof code === "string" && DIAGNOSTIC_ISSUE_CODE.test(code)))) return null;
  // A request travels with its code and never without it: a needs-permission
  // ending with nothing to ask is not one, and a request on any other ending
  // would ask a person about a build that stopped for another reason.
  const permissionRequest = value.permissionRequest === undefined ? undefined : parseAutomationStudioActionPermissionRequest(value.permissionRequest);
  if (permissionRequest === null || (value.code === "flow_bootstrap.permission_required") !== (permissionRequest !== undefined)) return null;
  return {
    code: value.code,
    stage: value.stage as AutomationStudioFlowBootstrapFailureStage,
    retryable: value.retryable,
    providerInvocation: value.providerInvocation,
    providerResponse: value.providerResponse,
    ...(accounting ? { accounting } : {}),
    ...(evidenceLoop ? { evidenceLoop } : {}),
    ...(value.issueCodes !== undefined ? { issueCodes: [...value.issueCodes as string[]] } : {}),
    ...(permissionRequest ? { permissionRequest } : {})
  };
}

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
  "llm_evidence_loop.cancelled": "flow_bootstrap.evidence_cancelled"
};

export function flowBootstrapEvidenceLoopFailure(
  result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>,
  /** What the loop spent before it ended, when the caller can say. */
  accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
): AutomationStudioFlowBootstrapGenerationError {
  return new AutomationStudioFlowBootstrapGenerationError({
    code: EVIDENCE_LOOP_FAILURE_CODES[result.code],
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    ...(accounting ? { accounting } : {}),
    evidenceLoop: evidenceLoopDiagnostic(result)
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
  accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
): AutomationStudioFlowBootstrapGenerationError {
  const issueCodes = diagnosticIssueCodes(progress.issueCodes);
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
  accounting: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>,
  code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode,
    | "flow_bootstrap.evidence_completion_wrapper_invalid"
    | "flow_bootstrap.evidence_completion_plan_invalid"
    | "flow_bootstrap.evidence_completion_profile_limit_exceeded"
    | "flow_bootstrap.evidence_completion_parameters_unresolved">,
  /** The codes that refused the plan. Anything that is not a code is dropped. */
  issues: ReadonlyArray<{ code: string }> = []
): AutomationStudioFlowBootstrapGenerationError {
  const issueCodes = diagnosticIssueCodes(issues.map((issue) => issue.code));
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
 * lasting consequence its grant did not permit.
 *
 * Built from the loop's progress at the moment the request was raised, which
 * ended it; the request is Core's own, already bounded by the gate that raised
 * it. Not retryable as it stands -- the same grant would ask the same question
 * -- but a build whose grant adds `permissionRequest.missing` can go on.
 */
export function flowBootstrapPermissionRequiredFailure(
  request: AutomationStudioActionPermissionRequest,
  progress: EvidenceLoopProgress,
  accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
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

/** Distinct issue codes, codes only, at most sixteen. */
function diagnosticIssueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes.filter((code) => DIAGNOSTIC_ISSUE_CODE.test(code)))].slice(0, MAX_DIAGNOSTIC_ISSUE_CODES);
}

/** What a loop has recorded so far: a finished result's, or a stopped loop's. */
type EvidenceLoopProgress = {
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
};

function evidenceLoopDiagnostic(
  result: EvidenceLoopProgress
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
    ...(steps.length ? { steps } : {})
  };
}

const FLOW_BOOTSTRAP_FAILURE_STAGES = new Set<AutomationStudioFlowBootstrapFailureStage>([
  "pre_provider_validation",
  "provider_resolution",
  "provider_request",
  "provider_output_validation",
  "post_provider_validation",
  "persistence"
]);

export function parseAutomationStudioFlowBootstrapGenerationError(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isRecord(value)) return null;
  try {
    const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic(value.diagnostic);
    if (!diagnostic) return null;
    if (value.name !== "AutomationStudioFlowBootstrapGenerationError") return null;
    if (value.message !== `Flow Bootstrap generation failed (${diagnostic.code}).`) return null;
    return diagnostic;
  } catch {
    return null;
  }
}

export class AutomationStudioFlowBootstrapGenerationError extends Error {
  readonly name = "AutomationStudioFlowBootstrapGenerationError";

  constructor(readonly diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic) {
    super(`Flow Bootstrap generation failed (${diagnostic.code}).`);
  }
}

export function flowBootstrapPhaseFailure(
  stage: AutomationStudioFlowBootstrapFailureStage,
  accounting?: AutomationStudioFlowBootstrapFailureDiagnostic["accounting"],
  requestedCode?: AutomationStudioFlowBootstrapPhaseFailureCode
): AutomationStudioFlowBootstrapGenerationError {
  const beforeProvider = stage === "pre_provider_validation" || stage === "provider_resolution";
  const defaultCode = FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE[stage];
  const allowedCodes = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES[stage] as readonly string[];
  const code = requestedCode && allowedCodes.includes(requestedCode) ? requestedCode : defaultCode;
  return new AutomationStudioFlowBootstrapGenerationError({
    code,
    stage,
    retryable: false,
    providerInvocation: beforeProvider ? "not_attempted" : "attempted",
    providerResponse: beforeProvider ? "not_received" : stage === "provider_request" ? "unknown" : "received",
    ...(!beforeProvider && stage !== "provider_request" && accounting ? { accounting } : {})
  });
}

const FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE: Record<
  AutomationStudioFlowBootstrapFailureStage,
  AutomationStudioFlowBootstrapPhaseFailureCode
> = {
  pre_provider_validation: "flow_bootstrap.pre_provider_validation_failed",
  provider_resolution: "flow_bootstrap.provider_resolution_failed",
  provider_request: "flow_bootstrap.provider_request_failed",
  provider_output_validation: "flow_bootstrap.provider_output_validation_failed",
  post_provider_validation: "flow_bootstrap.post_provider_validation_failed",
  persistence: "flow_bootstrap.persistence_failed"
};
export function flowBootstrapHarnessFailure(input: {
  diagnostics: AutomationStudioLlmDiagnostic[];
  request: AutomationStudioLlmTaskRequest;
  provider?: AutomationStudioLlmProviderMetadata;
  usage?: AutomationStudioLlmUsageSummary;
}): AutomationStudioFlowBootstrapGenerationError {
  // Harness-owned provider/output diagnostics are appended after instruction
  // diagnostics. Select the newest error so an earlier instruction diagnostic
  // cannot mask the actual provider failure at this projection boundary.
  const error = findLastError(input.diagnostics);
  if (!input.provider) return new AutomationStudioFlowBootstrapGenerationError({
    code: preProviderHarnessFailureCode(error?.code),
    stage: "pre_provider_validation",
    retryable: false,
    providerInvocation: "not_attempted",
    providerResponse: "not_received",
    accounting: {
      requestId: input.request.requestId,
      estimatedInputTokens: input.request.estimatedInputTokens
    }
  });
  const providerStatus = safeProviderStatus(error?.metadata?.providerStatus);
  const failure = providerHarnessFailureProjection(error?.code, providerStatus);
  return new AutomationStudioFlowBootstrapGenerationError({
    code: failure.code,
    stage: failure.stage,
    retryable: failure.retryable,
    providerInvocation: "attempted",
    providerResponse: failure.providerResponse,
    accounting: {
      requestId: input.request.requestId,
      estimatedInputTokens: input.request.estimatedInputTokens,
      ...(input.provider.provider ? { provider: input.provider.provider } : {}),
      ...(input.provider.model ? { model: input.provider.model } : {}),
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      ...(input.usage?.inputTokens !== undefined ? { inputTokens: input.usage.inputTokens } : {}),
      ...(input.usage?.outputTokens !== undefined ? { outputTokens: input.usage.outputTokens } : {}),
      ...(input.usage?.totalTokens !== undefined ? { totalTokens: input.usage.totalTokens } : {}),
      ...(input.usage?.estimatedCostUsd !== undefined ? { estimatedCostUsd: input.usage.estimatedCostUsd } : {})
    }
  });
}

/**
 * The codes a harness refusal made before the provider call is projected to.
 * Unlike every other pre-provider failure, each keeps the request's
 * accounting, so the parser admits accounting for exactly these codes. A
 * `pre_provider_` prefix test would also catch the phase's default code, which
 * never carries accounting, and so refuse a diagnostic Core itself produced.
 */
const FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODES = [
  "flow_bootstrap.harness_preflight_failed",
  "flow_bootstrap.pre_provider_input_budget_exceeded",
  "flow_bootstrap.pre_provider_request_context_unbounded",
  "flow_bootstrap.pre_provider_request_limits_invalid",
  "flow_bootstrap.pre_provider_request_construction_failed",
  "flow_bootstrap.pre_provider_request_setup_failed",
  "flow_bootstrap.pre_provider_input_limit_exceeded",
  "flow_bootstrap.pre_provider_request_total_exceeded",
  "flow_bootstrap.pre_provider_invalid_cost_limit",
  "flow_bootstrap.pre_provider_invalid_timeout",
  "flow_bootstrap.pre_provider_invalid_token_limits",
  "flow_bootstrap.pre_provider_context_invalid"
] as const satisfies readonly AutomationStudioFlowBootstrapPhaseFailureCode[];
const FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET: ReadonlySet<string> = new Set(FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODES);

function preProviderHarnessFailureCode(code: unknown): typeof FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODES[number] {
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
    default: return "flow_bootstrap.harness_preflight_failed";
  }
}

function findLastError(diagnostics: AutomationStudioLlmDiagnostic[]): AutomationStudioLlmDiagnostic | undefined {
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    if (diagnostics[index]?.severity === "error") return diagnostics[index];
  }
  return undefined;
}

type ProviderHarnessFailureProjection = {
  code: AutomationStudioFlowBootstrapPhaseFailureCode;
  stage: "provider_request" | "provider_output_validation";
  retryable: boolean;
  providerResponse: AutomationStudioFlowBootstrapFailureDiagnostic["providerResponse"];
};

function providerHarnessFailureProjection(code: unknown, status: number | undefined): ProviderHarnessFailureProjection {
  if (typeof code === "string" && Object.hasOwn(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES, code)) {
    return providerRequestProjection(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES[code as AutomationStudioLlmProviderPreflightErrorCode], false, "not_received");
  }
  switch (code) {
    case "llm.provider_auth_failed": return providerRequestProjection("flow_bootstrap.provider_auth_failed", false, "received");
    case "llm.provider_rate_limited": return providerRequestProjection("flow_bootstrap.provider_rate_limited", true, "received");
    case "llm.provider_timeout": return providerRequestProjection("flow_bootstrap.provider_timeout", true, "not_received");
    case "llm.provider_aborted": return providerRequestProjection("flow_bootstrap.provider_aborted", false, "not_received");
    case "llm.provider_redirect_rejected": return providerRequestProjection("flow_bootstrap.provider_redirect_rejected", false, "received");
    case "llm.provider_http_error": return providerRequestProjection(
      "flow_bootstrap.provider_http_error",
      status !== undefined && status >= 500,
      status === undefined ? "unknown" : "received"
    );
    case "llm.provider_network_error": return providerRequestProjection("flow_bootstrap.provider_network_error", true, "unknown");
    case "llm.provider_secret_unavailable": return providerRequestProjection("flow_bootstrap.provider_secret_unavailable", false, "not_received");
    case "llm.provider_malformed_response": return providerOutputProjection("flow_bootstrap.provider_response_malformed");
    case "llm.provider_output_invalid": return providerOutputProjection("flow_bootstrap.provider_output_invalid");
    case "llm.provider_response_oversize": return providerOutputProjection("flow_bootstrap.provider_response_oversize");
    case "llm.provider_output_padding_truncated": return providerOutputProjection("flow_bootstrap.provider_output_padding_truncated");
    case "llm.provider_output_truncated": return providerOutputProjection("flow_bootstrap.provider_output_truncated");
    case "llm.provider_usage_invalid": return providerOutputProjection("flow_bootstrap.provider_usage_invalid");
    case "llm.provider_usage_limit_exceeded": return providerOutputProjection("flow_bootstrap.provider_usage_limit_exceeded");
    case "llm_output.provider_result_too_large": return providerOutputProjection("flow_bootstrap.provider_output_oversize");
    case "llm_usage.input_limit_exceeded":
    case "llm_usage.output_limit_exceeded":
    case "llm_usage.total_limit_exceeded":
      return providerOutputProjection("flow_bootstrap.provider_usage_limit_exceeded");
    case "llm_usage.invalid":
    case "llm_usage.invalid_token_count":
    case "llm_usage.invalid_cost":
    case "llm_usage.inconsistent_total":
      return providerOutputProjection("flow_bootstrap.provider_usage_invalid");
    case "llm.provider_request_failed": return providerRequestProjection("flow_bootstrap.provider_transport_unknown", false, "unknown");
    default:
      return typeof code === "string" && (code.startsWith("llm_output.") || code.startsWith("bootstrap.") || code === "llm.provider_diagnostic")
        ? providerOutputProjection("flow_bootstrap.provider_output_invalid")
        : providerRequestProjection("flow_bootstrap.provider_transport_unknown", false, "unknown");
  }
}

function providerRequestProjection(
  code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode, `flow_bootstrap.provider_${string}`>,
  retryable: boolean,
  providerResponse: AutomationStudioFlowBootstrapFailureDiagnostic["providerResponse"]
): ProviderHarnessFailureProjection {
  return { code, stage: "provider_request", retryable, providerResponse };
}

function providerOutputProjection(
  code: Extract<AutomationStudioFlowBootstrapPhaseFailureCode, `flow_bootstrap.provider_${string}`>
): ProviderHarnessFailureProjection {
  return { code, stage: "provider_output_validation", retryable: false, providerResponse: "received" };
}
function safeProviderStatus(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 400 && (value as number) <= 599
    ? value as number
    : undefined;
}

function phaseFailureStateMatches(
  value: Record<string, unknown>,
  stage: AutomationStudioFlowBootstrapFailureStage
): boolean {
  if (value.stage !== stage) return false;
  if (stage === "pre_provider_validation" || stage === "provider_resolution") {
    const harnessAccounting = stage === "pre_provider_validation" && typeof value.code === "string"
      && FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET.has(value.code);
    return value.retryable === false
      && value.providerInvocation === "not_attempted"
      && value.providerResponse === "not_received"
      && (harnessAccounting ? value.accounting !== undefined : value.accounting === undefined);
  }
  if (value.providerInvocation !== "attempted") return false;
  if (value.code === "flow_bootstrap.provider_request_failed") {
    return value.retryable === false
      && value.providerResponse === "unknown"
      && value.accounting === undefined;
  }
  const providerState = fixedProviderFailureState(value.code, providerStatusFromAccounting(value.accounting));
  if (providerState) {
    return value.retryable === providerState.retryable
      && value.providerResponse === providerState.providerResponse;
  }
  return value.retryable === false && value.providerResponse === "received";
}

function fixedProviderFailureState(
  code: unknown,
  status: number | undefined
): Pick<ProviderHarnessFailureProjection, "retryable" | "providerResponse"> | null {
  if (typeof code === "string" && FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET.has(code)) return { retryable: false, providerResponse: "not_received" };
  switch (code) {
    case "flow_bootstrap.provider_auth_failed": return { retryable: false, providerResponse: "received" };
    case "flow_bootstrap.provider_rate_limited": return { retryable: true, providerResponse: "received" };
    case "flow_bootstrap.provider_timeout": return { retryable: true, providerResponse: "not_received" };
    case "flow_bootstrap.provider_aborted": return { retryable: false, providerResponse: "not_received" };
    case "flow_bootstrap.provider_redirect_rejected": return { retryable: false, providerResponse: "received" };
    case "flow_bootstrap.provider_http_error": return {
      retryable: status !== undefined && status >= 500,
      providerResponse: status === undefined ? "unknown" : "received"
    };
    case "flow_bootstrap.provider_network_error": return { retryable: true, providerResponse: "unknown" };
    case "flow_bootstrap.provider_secret_unavailable": return { retryable: false, providerResponse: "not_received" };
    case "flow_bootstrap.provider_configuration_invalid": return { retryable: false, providerResponse: "not_received" };
    case "flow_bootstrap.provider_transport_unknown": return { retryable: false, providerResponse: "unknown" };
    case "flow_bootstrap.provider_response_malformed":
    case "flow_bootstrap.provider_response_oversize":
    case "flow_bootstrap.provider_output_padding_truncated":
    case "flow_bootstrap.provider_output_truncated":
    case "flow_bootstrap.provider_usage_invalid":
    case "flow_bootstrap.provider_usage_limit_exceeded":
    case "flow_bootstrap.provider_output_invalid":
    case "flow_bootstrap.provider_output_oversize":
    case "flow_bootstrap.evidence_completion_wrapper_invalid":
    case "flow_bootstrap.evidence_completion_plan_invalid":
    case "flow_bootstrap.evidence_completion_profile_limit_exceeded":
    case "flow_bootstrap.evidence_completion_parameters_unresolved":
      return { retryable: false, providerResponse: "received" };
    default: return null;
  }
}

function providerStatusFromAccounting(value: unknown): number | undefined {
  return isRecord(value) ? safeProviderStatus(value.providerStatus) : undefined;
}
function parseAccounting(value: unknown): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, ["requestId", "estimatedInputTokens", "provider", "model", "providerStatus", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"])) return null;
  if (typeof value.requestId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(value.requestId)) return null;
  // A build's totals, not one request's: an iterating build adds up every call.
  if (!boundedInteger(value.estimatedInputTokens, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS)) return null;
  if (value.provider !== undefined && !boundedLabel(value.provider)) return null;
  if (value.model !== undefined && !boundedLabel(value.model)) return null;
  if (value.providerStatus !== undefined && safeProviderStatus(value.providerStatus) === undefined) return null;
  for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (value[field] !== undefined && !boundedInteger(value[field], AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS)) return null;
  }
  if (value.estimatedCostUsd !== undefined && (typeof value.estimatedCostUsd !== "number" || !Number.isFinite(value.estimatedCostUsd) || value.estimatedCostUsd < 0 || value.estimatedCostUsd > 10)) return null;
  return {
    requestId: value.requestId,
    estimatedInputTokens: value.estimatedInputTokens as number,
    ...(value.provider !== undefined ? { provider: value.provider as string } : {}),
    ...(value.model !== undefined ? { model: value.model as string } : {}),
    ...(value.providerStatus !== undefined ? { providerStatus: value.providerStatus as number } : {}),
    ...(value.inputTokens !== undefined ? { inputTokens: value.inputTokens as number } : {}),
    ...(value.outputTokens !== undefined ? { outputTokens: value.outputTokens as number } : {}),
    ...(value.totalTokens !== undefined ? { totalTokens: value.totalTokens as number } : {}),
    ...(value.estimatedCostUsd !== undefined ? { estimatedCostUsd: value.estimatedCostUsd } : {})
  };
}

/**
 * The most a loop can record: its ceiling on decisions, plus the one
 * observation it may make before the first. These were sixteen, the loop's old
 * ceiling, and were left behind when it rose -- so a diagnostic from a longer
 * exploration failed to parse, and its named reason was replaced by a generic
 * transport failure.
 */
const EVIDENCE_LOOP_MAX_ITERATIONS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations;
const EVIDENCE_LOOP_MAX_TRACE_STEPS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1;
/** The published steps are one per trace row, and one decision may write two of them. */
const EVIDENCE_LOOP_MAX_TRACE_ROWS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2 + 1;

function parseEvidenceLoopCounts(value: unknown): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, ["iterationCount", "decisionCount", "toolCallCount", "evidenceBytes", "steps"])) return null;
  if (!boundedInteger(value.iterationCount, EVIDENCE_LOOP_MAX_ITERATIONS) || !boundedInteger(value.decisionCount, EVIDENCE_LOOP_MAX_TRACE_STEPS)
    || !boundedInteger(value.toolCallCount, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls)
    || !boundedInteger(value.evidenceBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)) return null;
  let steps: NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["steps"]> | undefined;
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps) || value.steps.length > EVIDENCE_LOOP_MAX_TRACE_ROWS) return null;
    steps = [];
    for (const step of value.steps) {
      if (!isRecord(step) || !hasExactFields(step, ["toolId", "effectApplied", "resultCode"])
        || typeof step.toolId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(step.toolId)
        || (step.effectApplied !== undefined && typeof step.effectApplied !== "boolean")
        || (step.resultCode !== undefined && (typeof step.resultCode !== "string" || !/^[a-z0-9_.:-]{1,100}$/i.test(step.resultCode)))) return null;
      steps.push({
        toolId: step.toolId,
        ...(step.effectApplied !== undefined ? { effectApplied: step.effectApplied } : {}),
        ...(step.resultCode !== undefined ? { resultCode: step.resultCode } : {})
      });
    }
  }
  return {
    iterationCount: value.iterationCount as number,
    decisionCount: value.decisionCount as number,
    toolCallCount: value.toolCallCount as number,
    evidenceBytes: value.evidenceBytes as number,
    ...(steps ? { steps } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, allowed: string[]): boolean {
  const fields = new Set(allowed);
  return Object.keys(value).every((key) => fields.has(key));
}

function boundedInteger(value: unknown, maximum: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function boundedLabel(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\r\n]/.test(value);
}
