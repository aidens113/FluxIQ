import type { AutomationStudioActionConsequence, AutomationStudioActionPermissionRequest, AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../../runtime/index.ts";
import type { FlowIdProjectRequest } from "./flow.ts";

export type AutomationStudioFlowBootstrapGenerationReadiness = {
  contractVersion: "automation-studio.flow-bootstrap-generation-readiness.v2";
  schemaVersion: "0.1";
  supported: boolean;
  generationEndpoint: "generate-flow-bootstrap-adaptation";
  reviewEndpoint: "review-flow-adaptation";
  runtime: {
    providerResolverConfigured: boolean;
    nativeNodeRegistryConfigured: boolean;
  };
  capabilities: {
    taskKind: "flow_bootstrap";
    expectedOutput: "flow_bootstrap";
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
  contractVersion: "automation-studio.flow-bootstrap-generation-readiness.v2",
  schemaVersion: "0.1",
  supported: true,
  generationEndpoint: "generate-flow-bootstrap-adaptation",
  reviewEndpoint: "review-flow-adaptation",
  runtime: {
    providerResolverConfigured: true,
    nativeNodeRegistryConfigured: true
  },
  capabilities: {
    taskKind: "flow_bootstrap",
    expectedOutput: "flow_bootstrap",
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
  if (!readinessRecord(value) || !readinessExactKeys(value, ["contractVersion", "schemaVersion", "supported", "generationEndpoint", "reviewEndpoint", "runtime", "capabilities"])) return null;
  const expected = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS;
  if (value.contractVersion !== expected.contractVersion
    || value.schemaVersion !== expected.schemaVersion
    || typeof value.supported !== "boolean"
    || value.generationEndpoint !== expected.generationEndpoint
    || value.reviewEndpoint !== expected.reviewEndpoint) return null;
  if (!readinessRecord(value.runtime) || !readinessExactKeys(value.runtime, ["providerResolverConfigured", "nativeNodeRegistryConfigured"])) return null;
  if (![value.runtime.providerResolverConfigured, value.runtime.nativeNodeRegistryConfigured].every((item) => typeof item === "boolean")) return null;
  if (value.supported !== [value.runtime.providerResolverConfigured, value.runtime.nativeNodeRegistryConfigured].every((item) => item === true)) return null;
  if (!readinessRecord(value.capabilities) || !readinessExactKeys(value.capabilities, ["taskKind", "expectedOutput", "requiresNativeNodeRegistryContext", "structuredFailureDiagnostics"])) return null;
  const expectedCapabilities = expected.capabilities;
  if (value.capabilities.taskKind !== expectedCapabilities.taskKind
    || value.capabilities.expectedOutput !== expectedCapabilities.expectedOutput
    || value.capabilities.requiresNativeNodeRegistryContext !== true) return null;
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
  /**
   * The lasting consequences the build's actions may have: `move_money`,
   * `delete`, `send_or_publish`, `modify_existing`, `create_new`. Absent is
   * none. A class Core does not recognise refuses the request rather than
   * being dropped. This is how a person's answer to a permission request
   * reaches the next build: send what the request listed as `missing`.
   *
   * The model call itself needs nothing: the build runs for the signed-in
   * actor, whose unlocked Secret Keys key pays for it.
   */
  permittedConsequences?: AutomationStudioActionConsequence[];
  evidenceGuided?: true;
  /**
   * `candidate` stores an unverified candidate draft. `configured` asks for
   * Core's own authoring mode (`FLUXIQ_AUTHORING_MODE`, `model/authoring-mode/`):
   * a candidate draft in candidate mode, a proposed adaptation in legacy mode.
   * Absent is a proposed adaptation. Either value requires evidenceGuided:true.
   */
  authoringMode?: "candidate" | "configured";
  useReusableContext?: true;
  /**
   * Where the Flow this build writes starts, in the bound domain's own
   * spelling -- a URL for the web, something else for a domain with no pages.
   *
   * Given, the build is told it is not there yet: the model is shown the
   * location, the domain refuses every call until the Flow has reached it, and
   * the step that reaches it is therefore in the draft the plan is assembled
   * from. Omitted, the build behaves exactly as it always has and explores
   * whatever the caller put in front of it -- which is right when a person is
   * already looking at the page they are asking about, and wrong when the Flow
   * is meant to get there by itself (`runtime/flow-bootstrap/start-location.ts`).
   */
  startLocation?: string;
  /**
   * `extend` improves the Flow as it stands -- its steps become the draft the
   * model amends and its Router, Subflow and graph Flow ids are kept -- rather
   * than writing a Flow from nothing. Omitted, the build is a `create`, which
   * requires a blank Flow (`runtime/flow-bootstrap/extend.ts`).
   */
  mode?: "create" | "extend";
  /**
   * What the chat's reading of the message that asked for this build cost, in
   * US dollars: a finite, non-negative amount. A build that is not a repair
   * opens the Flow's creation purse with it carried, so the call that decided
   * to build the Flow counts against the Flow's ceiling. Omitted, nothing is
   * carried. Anything else refuses the request.
   */
  interpretationCostUsd?: number;
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
  /**
   * Present exactly when `code` is `flow_bootstrap.permission_required`: the
   * build needed an action with a lasting consequence its request did not
   * permit. Ask the person with it, and send the next build's
   * `permittedConsequences` with the classes it lists as `missing` if they agree.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
};

export type GenerateFlowBootstrapAdaptationResponse = AutomationStudioGenerateFlowBootstrapAdaptationResult;

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
