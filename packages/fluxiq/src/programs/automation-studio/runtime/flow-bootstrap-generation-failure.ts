import type {
  AutomationStudioLlmDiagnostic,
  AutomationStudioLlmProviderMetadata,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmUsageSummary
} from "./llm-harness.ts";

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
    "flow_bootstrap.blank_target_required",
    "flow_bootstrap.canonical_settings_binding_unavailable",
    "flow_bootstrap.stale_grant_binding",
    "flow_bootstrap.pending_adaptation_exists",
    "flow_bootstrap.active_instructions_required",
    "flow_bootstrap.node_catalog_unavailable",
    "flow_bootstrap.required_capabilities_unavailable"
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
    "flow_bootstrap.provider_configuration_invalid",
    "flow_bootstrap.provider_transport_unknown"
  ],
  provider_output_validation: [
    "flow_bootstrap.provider_output_validation_failed",
    "flow_bootstrap.provider_response_malformed",
    "flow_bootstrap.provider_response_oversize",
    "flow_bootstrap.provider_usage_invalid",
    "flow_bootstrap.provider_usage_limit_exceeded",
    "flow_bootstrap.provider_output_invalid",
    "flow_bootstrap.provider_output_oversize"
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
};

export function parseAutomationStudioFlowBootstrapFailureDiagnostic(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isRecord(value) || !hasExactFields(value, ["code", "stage", "retryable", "providerInvocation", "providerResponse", "accounting"])) return null;
  if (typeof value.code !== "string" || !FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE.has(value.code)) return null;
  if (!FLOW_BOOTSTRAP_FAILURE_STAGES.has(value.stage as AutomationStudioFlowBootstrapFailureStage)) return null;
  if (value.retryable !== true && value.retryable !== false) return null;
  if (value.providerInvocation !== "not_attempted" && value.providerInvocation !== "attempted") return null;
  if (value.providerResponse !== "not_received" && value.providerResponse !== "received" && value.providerResponse !== "unknown") return null;
  const phaseFailureStage = FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE.get(value.code);
  if (phaseFailureStage && !phaseFailureStateMatches(value, phaseFailureStage)) return null;
  const accounting = parseAccounting(value.accounting);
  if (value.accounting !== undefined && !accounting) return null;
  return {
    code: value.code,
    stage: value.stage as AutomationStudioFlowBootstrapFailureStage,
    retryable: value.retryable,
    providerInvocation: value.providerInvocation,
    providerResponse: value.providerResponse,
    ...(accounting ? { accounting } : {})
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
  if (!input.provider) return flowBootstrapPhaseFailure("pre_provider_validation");
  const error = input.diagnostics.find((diagnostic) => diagnostic.severity === "error");
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

type ProviderHarnessFailureProjection = {
  code: AutomationStudioFlowBootstrapPhaseFailureCode;
  stage: "provider_request" | "provider_output_validation";
  retryable: boolean;
  providerResponse: AutomationStudioFlowBootstrapFailureDiagnostic["providerResponse"];
};

function providerHarnessFailureProjection(code: unknown, status: number | undefined): ProviderHarnessFailureProjection {
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
    case "llm.provider_configuration_invalid": return providerRequestProjection("flow_bootstrap.provider_configuration_invalid", false, "not_received");
    case "llm.provider_malformed_response": return providerOutputProjection("flow_bootstrap.provider_response_malformed");
    case "llm.provider_response_oversize": return providerOutputProjection("flow_bootstrap.provider_response_oversize");
    case "llm.provider_usage_invalid": return providerOutputProjection("flow_bootstrap.provider_usage_invalid");
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
    return value.retryable === false
      && value.providerInvocation === "not_attempted"
      && value.providerResponse === "not_received"
      && value.accounting === undefined;
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
    case "flow_bootstrap.provider_usage_invalid":
    case "flow_bootstrap.provider_usage_limit_exceeded":
    case "flow_bootstrap.provider_output_invalid":
    case "flow_bootstrap.provider_output_oversize":
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
  if (!boundedInteger(value.estimatedInputTokens, 50_000)) return null;
  if (value.provider !== undefined && !boundedLabel(value.provider)) return null;
  if (value.model !== undefined && !boundedLabel(value.model)) return null;
  if (value.providerStatus !== undefined && safeProviderStatus(value.providerStatus) === undefined) return null;
  for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (value[field] !== undefined && !boundedInteger(value[field], 50_000)) return null;
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
