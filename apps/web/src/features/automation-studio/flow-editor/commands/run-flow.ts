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

export type RunnableAutomationFlow = {
  flowId: string;
  name?: string;
  scope?: { kind?: string };
  executionDefaults?: { authorizedDomainIds?: string[] };
};

export async function runCurrentAutomationFlow<TSession>(
  input: {
    scope: AutomationFlowCommandScope;
    flow: RunnableAutomationFlow | null;
    hasUnsavedChanges: boolean;
    allowSavedVersionWhenDirty: boolean;
    allowRequestedDomains: boolean;
    signal?: AbortSignal;
  },
  capabilities: AutomationFlowCommandCapabilities
): Promise<AutomationFlowCommandOutcome<{ session: TSession; requestedDomainIds: string[] }>> {
  const preflight = flowCommandPreflight<{ session: TSession; requestedDomainIds: string[] }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.flow) return { status: "failure", code: "FLOW_REQUIRED", error: "Open a Flow before running." };
  if (input.hasUnsavedChanges && !input.allowSavedVersionWhenDirty) {
    return { status: "cancelled", reason: "Run cancelled because the Flow has unsaved changes." };
  }
  const requestedDomainIds = input.flow.scope?.kind === "global" && Array.isArray(input.flow.executionDefaults?.authorizedDomainIds)
    ? [...input.flow.executionDefaults.authorizedDomainIds]
    : [];
  if (requestedDomainIds.length > 0 && !input.allowRequestedDomains) {
    return { status: "cancelled", reason: "Run cancelled before bound domain permissions were granted." };
  }
  try {
    const response = await capabilities.api.post<{ runtimeSession?: TSession }>(AUTOMATION_FLOW_ENDPOINTS.run, {
      projectId: input.scope.projectId,
      flowId: input.flow.flowId,
      authorizedDomainIds: requestedDomainIds
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ session: TSession; requestedDomainIds: string[] }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok || !response.payload?.runtimeSession) return flowCommandRequestFailure(response, "Flow run failed before a runtime session was returned.");
    return { status: "success", value: { session: response.payload.runtimeSession, requestedDomainIds } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow run could not be completed.");
  }
}
