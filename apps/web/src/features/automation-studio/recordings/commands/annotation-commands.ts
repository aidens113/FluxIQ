import {
  AUTOMATION_RECORDING_ENDPOINTS,
  recordingCommandPostflight,
  recordingCommandPreflight,
  recordingRequestFailure,
  recordingThrownFailure,
  type AutomationRecordingCommandCapabilities,
  type AutomationRecordingCommandOutcome,
  type AutomationRecordingCommandScope
} from "./command-contracts";

type AnnotationInput = {
  scope: AutomationRecordingCommandScope;
  recordingId: string;
  authorizationPin: string;
  linkedEntryId?: string;
  signal?: AbortSignal;
};

async function appendAnnotation<TRecording>(
  input: AnnotationInput,
  capabilities: AutomationRecordingCommandCapabilities,
  endpoint: string,
  body: Record<string, unknown>,
  fallback: string
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording | null; recordingId: string }>> {
  const preflight = recordingCommandPreflight<{ recording: TRecording | null; recordingId: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (input.authorizationPin.length < 4) {
    return { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required for this Recording action." };
  }
  try {
    const response = await capabilities.api.post<{ recording?: TRecording }>(endpoint, {
      projectId: input.scope.projectId,
      recordingId: input.recordingId,
      authorizationPin: input.authorizationPin,
      ...body
    }, input.signal ? { signal: input.signal } : {});
    const postflight = recordingCommandPostflight<{ recording: TRecording | null; recordingId: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok) return recordingRequestFailure(response, fallback);
    return { status: "success", value: { recording: response.payload?.recording ?? null, recordingId: input.recordingId } };
  } catch (error) {
    return recordingThrownFailure(error, input.signal, fallback);
  }
}

export function addAutomationRecordingNote<TRecording>(
  input: AnnotationInput & { text: string },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording | null; recordingId: string }>> {
  const text = input.text.trim();
  if (!text) return Promise.resolve({ status: "failure", code: "NOTE_REQUIRED", error: "A note is required." });
  return appendAnnotation(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.appendNote, {
    text,
    linkedEntryIds: input.linkedEntryId ? [input.linkedEntryId] : []
  }, "Note could not be added.");
}

export function addAutomationRecordingMarker<TRecording>(
  input: AnnotationInput & { label: string; monotonicOffsetMs?: number },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording | null; recordingId: string }>> {
  const label = input.label.trim();
  if (!label) return Promise.resolve({ status: "failure", code: "MARKER_REQUIRED", error: "A marker label is required." });
  return appendAnnotation(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.appendMarker, {
    label,
    linkedEntryId: input.linkedEntryId,
    monotonicOffsetMs: input.monotonicOffsetMs
  }, "Marker could not be added.");
}
