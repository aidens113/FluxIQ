import {
  AUTOMATION_FLOW_ENDPOINTS,
  flowCommandPostflight,
  flowCommandPreflight,
  flowCommandRequestFailure,
  flowCommandThrownFailure,
  type AutomationFlowCommandCapabilities,
  type AutomationFlowCommandOutcome,
  type AutomationFlowCommandScope
} from "./command-contracts";

export async function publishAutomationFlow<TPublication>(
  input: { scope: AutomationFlowCommandScope; flowId: string; version: string; changelog: string; publishedBy: string; authorizationPin: string; signal?: AbortSignal },
  capabilities: AutomationFlowCommandCapabilities
): Promise<AutomationFlowCommandOutcome<{ publication: TPublication | null; flowId: string; version: string }>> {
  const preflight = flowCommandPreflight<{ publication: TPublication | null; flowId: string; version: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.version.trim()) return { status: "failure", code: "VERSION_REQUIRED", error: "A Flow version is required." };
  if (input.authorizationPin.length < 4) return { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required to publish a Flow." };
  try {
    const response = await capabilities.api.post<{ publication?: TPublication }>(AUTOMATION_FLOW_ENDPOINTS.publish, {
      projectId: input.scope.projectId,
      flowId: input.flowId,
      version: input.version,
      changelog: input.changelog,
      publishedBy: input.publishedBy,
      authorizationPin: input.authorizationPin
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ publication: TPublication | null; flowId: string; version: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok) return flowCommandRequestFailure(response, "Flow could not be published.");
    return { status: "success", value: { publication: response.payload?.publication ?? null, flowId: input.flowId, version: input.version } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow could not be published.");
  }
}

export async function deprecateAutomationFlow<TPublication>(
  input: { scope: AutomationFlowCommandScope; flowId: string; version: string; reason: string; authorizationPin: string; signal?: AbortSignal },
  capabilities: AutomationFlowCommandCapabilities
): Promise<AutomationFlowCommandOutcome<{ publication: TPublication | null; flowId: string; version: string }>> {
  const preflight = flowCommandPreflight<{ publication: TPublication | null; flowId: string; version: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.reason.trim()) return { status: "failure", code: "REASON_REQUIRED", error: "A deprecation reason is required." };
  if (input.authorizationPin.length < 4) return { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required to deprecate a published Flow." };
  try {
    const response = await capabilities.api.post<{ publication?: TPublication }>(AUTOMATION_FLOW_ENDPOINTS.deprecate, {
      projectId: input.scope.projectId,
      flowId: input.flowId,
      version: input.version,
      reason: input.reason,
      authorizationPin: input.authorizationPin
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ publication: TPublication | null; flowId: string; version: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok) return flowCommandRequestFailure(response, "Published Flow version could not be deprecated.");
    return { status: "success", value: { publication: response.payload?.publication ?? null, flowId: input.flowId, version: input.version } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Published Flow version could not be deprecated.");
  }
}
