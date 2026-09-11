import type { FlowIdProjectRequest } from "./flow.ts";

export type AutomationStudioFlowBootstrapGenerationReadiness = {
  contractVersion: "automation-studio.flow-bootstrap-generation-readiness.v1";
  schemaVersion: "0.1";
  supported: boolean;
  generationEndpoint: "generate-flow-bootstrap-adaptation";
  preflightEndpoint: "preflight-llm-execution";
  issueGrantEndpoint: "issue-llm-execution-grant";
  reviewEndpoint: "review-flow-adaptation";
  runtime: {
    llmExecutionGrantsConfigured: boolean;
    providerResolverConfigured: boolean;
    nativeNodeRegistryConfigured: boolean;
  };
  capabilities: {
    grantPurpose: "build_and_adapt";
    taskKind: "flow_bootstrap";
    expectedOutput: "flow_bootstrap";
    canonicalBindingFields: readonly ["executionDigest", "settingsRevision"];
    requiresNativeNodeRegistryContext: true;
    structuredFailureDiagnostics: {
      version: "automation-studio.flow-bootstrap-failure.v1";
      stages: readonly ["pre_provider_validation", "provider_resolution", "provider_request", "provider_output_validation", "post_provider_validation", "persistence"];
      providerInvocationStates: readonly ["not_attempted", "attempted"];
      providerResponseStates: readonly ["not_received", "received", "unknown"];
      accountingFields: readonly ["requestId", "estimatedInputTokens", "provider", "model", "providerStatus", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"];
    };
  };
};

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS: AutomationStudioFlowBootstrapGenerationReadiness = {
  contractVersion: "automation-studio.flow-bootstrap-generation-readiness.v1",
  schemaVersion: "0.1",
  supported: true,
  generationEndpoint: "generate-flow-bootstrap-adaptation",
  preflightEndpoint: "preflight-llm-execution",
  issueGrantEndpoint: "issue-llm-execution-grant",
  reviewEndpoint: "review-flow-adaptation",
  runtime: {
    llmExecutionGrantsConfigured: true,
    providerResolverConfigured: true,
    nativeNodeRegistryConfigured: true
  },
  capabilities: {
    grantPurpose: "build_and_adapt",
    taskKind: "flow_bootstrap",
    expectedOutput: "flow_bootstrap",
    canonicalBindingFields: ["executionDigest", "settingsRevision"],
    requiresNativeNodeRegistryContext: true,
    structuredFailureDiagnostics: {
      version: "automation-studio.flow-bootstrap-failure.v1",
      stages: ["pre_provider_validation", "provider_resolution", "provider_request", "provider_output_validation", "post_provider_validation", "persistence"],
      providerInvocationStates: ["not_attempted", "attempted"],
      providerResponseStates: ["not_received", "received", "unknown"],
      accountingFields: ["requestId", "estimatedInputTokens", "provider", "model", "providerStatus", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"]
    }
  }
};

export function parseAutomationStudioFlowBootstrapGenerationReadiness(
  value: unknown
): AutomationStudioFlowBootstrapGenerationReadiness | null {
  if (!readinessRecord(value) || !readinessExactKeys(value, ["contractVersion", "schemaVersion", "supported", "generationEndpoint", "preflightEndpoint", "issueGrantEndpoint", "reviewEndpoint", "runtime", "capabilities"])) return null;
  const expected = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS;
  if (value.contractVersion !== expected.contractVersion
    || value.schemaVersion !== expected.schemaVersion
    || typeof value.supported !== "boolean"
    || value.generationEndpoint !== expected.generationEndpoint
    || value.preflightEndpoint !== expected.preflightEndpoint
    || value.issueGrantEndpoint !== expected.issueGrantEndpoint
    || value.reviewEndpoint !== expected.reviewEndpoint) return null;
  if (!readinessRecord(value.runtime) || !readinessExactKeys(value.runtime, ["llmExecutionGrantsConfigured", "providerResolverConfigured", "nativeNodeRegistryConfigured"])) return null;
  if (![value.runtime.llmExecutionGrantsConfigured, value.runtime.providerResolverConfigured, value.runtime.nativeNodeRegistryConfigured].every((item) => typeof item === "boolean")) return null;
  if (value.supported !== [value.runtime.llmExecutionGrantsConfigured, value.runtime.providerResolverConfigured, value.runtime.nativeNodeRegistryConfigured].every((item) => item === true)) return null;
  if (!readinessRecord(value.capabilities) || !readinessExactKeys(value.capabilities, ["grantPurpose", "taskKind", "expectedOutput", "canonicalBindingFields", "requiresNativeNodeRegistryContext", "structuredFailureDiagnostics"])) return null;
  const expectedCapabilities = expected.capabilities;
  if (value.capabilities.grantPurpose !== expectedCapabilities.grantPurpose
    || value.capabilities.taskKind !== expectedCapabilities.taskKind
    || value.capabilities.expectedOutput !== expectedCapabilities.expectedOutput
    || value.capabilities.requiresNativeNodeRegistryContext !== true
    || !readinessStringArray(value.capabilities.canonicalBindingFields, expectedCapabilities.canonicalBindingFields)) return null;
  const failure = value.capabilities.structuredFailureDiagnostics;
  const expectedFailure = expectedCapabilities.structuredFailureDiagnostics;
  if (!readinessRecord(failure) || !readinessExactKeys(failure, ["version", "stages", "providerInvocationStates", "providerResponseStates", "accountingFields"])) return null;
  if (failure.version !== expectedFailure.version
    || !readinessStringArray(failure.stages, expectedFailure.stages)
    || !readinessStringArray(failure.providerInvocationStates, expectedFailure.providerInvocationStates)
    || !readinessStringArray(failure.providerResponseStates, expectedFailure.providerResponseStates)
    || !readinessStringArray(failure.accountingFields, expectedFailure.accountingFields)) return null;
  return structuredClone(value) as AutomationStudioFlowBootstrapGenerationReadiness;
}

function readinessRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readinessExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function readinessStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

export type GenerateFlowBootstrapAdaptationRequest = FlowIdProjectRequest & {
  authSessionId: string;
  llmExecutionGrantId: string;
  evidenceGuided?: true;
  useReusableContext?: true;
};

export type GenerateFlowBootstrapAdaptationFailureDiagnostic = {
  code: string;
  stage: "pre_provider_validation" | "provider_resolution" | "provider_request" | "provider_output_validation" | "post_provider_validation" | "persistence";
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

export type GenerateFlowBootstrapAdaptationResponse = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  status: "proposed";
  riskLevel: "low" | "medium" | "high" | "destructive";
  sourceInstructionIds: string[];
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  accounting: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
};

export type FlowAdaptationRequest = FlowIdProjectRequest & {
  adaptationId: string;
};

export type ReviewFlowAdaptationRequest = FlowAdaptationRequest & {
  action: "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";
  reason?: string;
  supersededByAdaptationId?: string;
  authSessionId?: string;
  authorizationPin?: string;
};
