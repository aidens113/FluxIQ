import type { StateSnapshot } from "fluxiq/automation-studio";
import {
  AUTOMATION_STATE_ENDPOINTS,
  stateCommandPostflight,
  stateCommandPreflight,
  stateCommandRequestFailure,
  stateCommandThrownFailure,
  type AutomationStateCommandCapabilities,
  type AutomationStateCommandOutcome,
  type AutomationStateCommandScope,
  type AutomationStateResolvedIndex
} from "./command-contracts";

export type AutomationStateIndexLookup = {
  scope: AutomationStateCommandScope;
  recordingId: string;
  timelineEntryId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
  signal?: AbortSignal;
};

export type AutomationStateIndexResolution<TState extends StateSnapshot = StateSnapshot> = {
  resolved: AutomationStateResolvedIndex;
  state: TState | null;
};

export async function resolveAutomationStateIndex<TState extends StateSnapshot = StateSnapshot>(
  input: AutomationStateIndexLookup,
  capabilities: AutomationStateCommandCapabilities
): Promise<AutomationStateCommandOutcome<AutomationStateIndexResolution<TState>>> {
  const preflight = stateCommandPreflight<AutomationStateIndexResolution<TState>>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.recordingId.trim()) return { status: "failure", code: "RECORDING_REQUIRED", error: "A recording is required to resolve indexed State." };
  if (!input.timelineEntryId && !input.stateSnapshotId) {
    return { status: "failure", code: "STATE_TARGET_REQUIRED", error: "A timeline entry or State snapshot is required." };
  }

  const endpoint = input.stateSnapshotId ? AUTOMATION_STATE_ENDPOINTS.snapshot : AUTOMATION_STATE_ENDPOINTS.recordingEntry;
  const payload = {
    projectId: input.scope.projectId,
    recordingId: input.recordingId,
    ...(input.timelineEntryId ? { entryId: input.timelineEntryId } : {}),
    ...(input.stateSnapshotId ? { stateSnapshotId: input.stateSnapshotId } : {}),
    includeState: input.includeState === true
  };

  try {
    const response = await capabilities.api.post<{
      resolved: AutomationStateResolvedIndex | null;
      state?: TState;
      reason?: string;
    }>(endpoint, payload, input.signal ? { signal: input.signal } : {});
    const postflight = stateCommandPostflight<AutomationStateIndexResolution<TState>>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok) return stateCommandRequestFailure(response, "Indexed State could not be resolved.");
    if (!response.payload?.resolved) {
      return { status: "failure", code: "STATE_NOT_INDEXED", error: response.payload?.reason ?? "No indexed State snapshot exists for this item." };
    }
    return {
      status: "success",
      value: { resolved: response.payload.resolved, state: input.includeState === true ? response.payload.state ?? null : null }
    };
  } catch (error) {
    return stateCommandThrownFailure(error, input.signal, "Indexed State could not be resolved.");
  }
}
