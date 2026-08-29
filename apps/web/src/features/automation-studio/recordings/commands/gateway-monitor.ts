import {
  recordingCommandPostflight,
  recordingCommandPreflight,
  recordingThrownFailure,
  type AutomationRecordingCommandOutcome,
  type AutomationRecordingCommandScope,
  type AutomationRecordingScopeGuard
} from "./command-contracts";

export type AutomationGatewayRecordingTransition =
  | { kind: "none" }
  | { kind: "live"; recordingId: string }
  | { kind: "stopped"; recordingId: string };

export type AutomationGatewayRecordingMonitorState = {
  activeRecordingId: string | null;
  openedRecordingIds: ReadonlySet<string>;
  processedStoppedRecordingIds: ReadonlySet<string>;
};

export type AutomationGatewayRecordingMonitorCapabilities = AutomationRecordingScopeGuard & {
  publish(transition: Exclude<AutomationGatewayRecordingTransition, { kind: "none" }>): void | Promise<void>;
};

export function createAutomationGatewayRecordingMonitorState(): AutomationGatewayRecordingMonitorState {
  return { activeRecordingId: null, openedRecordingIds: new Set(), processedStoppedRecordingIds: new Set() };
}

function activeRecordingIdFromSessions(sessions: readonly unknown[]): string | null {
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const recordingId = (session as { activeRecordingId?: unknown }).activeRecordingId;
    if (typeof recordingId === "string" && recordingId.length > 0) return recordingId;
  }
  return null;
}

export async function monitorAutomationGatewayRecording(
  input: {
    scope: AutomationRecordingCommandScope;
    sessions: readonly unknown[];
    state: AutomationGatewayRecordingMonitorState;
    signal?: AbortSignal;
  },
  capabilities: AutomationGatewayRecordingMonitorCapabilities
): Promise<AutomationRecordingCommandOutcome<{
  state: AutomationGatewayRecordingMonitorState;
  transition: AutomationGatewayRecordingTransition;
}>> {
  type Value = { state: AutomationGatewayRecordingMonitorState; transition: AutomationGatewayRecordingTransition };
  const preflight = recordingCommandPreflight<Value>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const activeRecordingId = activeRecordingIdFromSessions(input.sessions);
  const opened = new Set(input.state.openedRecordingIds);
  const processed = new Set(input.state.processedStoppedRecordingIds);
  let transition: AutomationGatewayRecordingTransition = { kind: "none" };

  if (activeRecordingId && !opened.has(activeRecordingId)) {
    opened.add(activeRecordingId);
    transition = { kind: "live", recordingId: activeRecordingId };
  } else if (!activeRecordingId && input.state.activeRecordingId && !processed.has(input.state.activeRecordingId)) {
    processed.add(input.state.activeRecordingId);
    transition = { kind: "stopped", recordingId: input.state.activeRecordingId };
  }

  const state: AutomationGatewayRecordingMonitorState = {
    activeRecordingId,
    openedRecordingIds: opened,
    processedStoppedRecordingIds: processed
  };
  if (transition.kind === "none") return { status: "success", value: { state, transition } };

  try {
    const beforePublish = recordingCommandPostflight<Value>(input.scope, capabilities, input.signal);
    if (beforePublish) return beforePublish;
    await capabilities.publish(transition);
    return { status: "success", value: { state, transition } };
  } catch (error) {
    return recordingThrownFailure(error, input.signal, "The gateway Recording transition could not be published.");
  }
}
