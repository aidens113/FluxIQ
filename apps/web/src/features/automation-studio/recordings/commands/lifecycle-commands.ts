import type { JsonObject } from "../../../programs/program-api";
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
import {
  commitAutomationRecordingCleanup,
  type AutomationRecordingCleanup,
  type AutomationRecordingCleanupTransaction
} from "./cleanup-transaction";

type CommandInput = { scope: AutomationRecordingCommandScope; signal?: AbortSignal };
type AuthorizedInput = CommandInput & { authorizationPin: string };

function requestOptions(signal?: AbortSignal) {
  return signal ? { signal } : {};
}

function requirePin<T>(authorizationPin: string): AutomationRecordingCommandOutcome<T> | null {
  return authorizationPin.length < 4
    ? { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required for this Recording action." }
    : null;
}

async function postRecording<TPayload, TValue>(
  input: CommandInput,
  capabilities: AutomationRecordingCommandCapabilities,
  endpoint: string,
  body: JsonObject,
  fallback: string,
  select: (payload: TPayload | undefined) => TValue | null
): Promise<AutomationRecordingCommandOutcome<TValue>> {
  const preflight = recordingCommandPreflight<TValue>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    const response = await capabilities.api.post<TPayload>(endpoint, body, requestOptions(input.signal));
    const postflight = recordingCommandPostflight<TValue>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok) return recordingRequestFailure(response, fallback);
    const value = select(response.payload);
    return value === null ? { status: "failure", error: fallback } : { status: "success", value };
  } catch (error) {
    return recordingThrownFailure(error, input.signal, fallback);
  }
}

export async function createAutomationRecording<TRecording>(
  input: AuthorizedInput & {
    recordingId: string;
    taskId: string;
    environment: JsonObject;
    initialState: JsonObject;
    metadata?: JsonObject;
  },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording; recordingId: string }>> {
  const pinFailure = requirePin<{ recording: TRecording; recordingId: string }>(input.authorizationPin);
  if (pinFailure) return pinFailure;
  return postRecording(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.create, {
    projectId: input.scope.projectId,
    recordingId: input.recordingId,
    taskId: input.taskId,
    authorizationPin: input.authorizationPin,
    environment: input.environment,
    initialState: input.initialState,
    metadata: input.metadata ?? {}
  }, "Recording could not be created.", (payload: { recording?: TRecording } | undefined) =>
    payload?.recording ? { recording: payload.recording, recordingId: input.recordingId } : null);
}

export async function finalizeAutomationRecording<TRecording>(
  input: AuthorizedInput & { recordingId: string },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording; recordingId: string }>> {
  const pinFailure = requirePin<{ recording: TRecording; recordingId: string }>(input.authorizationPin);
  if (pinFailure) return pinFailure;
  return postRecording(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.finalize, {
    projectId: input.scope.projectId,
    recordingId: input.recordingId,
    authorizationPin: input.authorizationPin
  }, "Recording could not be finalized.", (payload: { recording?: TRecording } | undefined) =>
    payload?.recording ? { recording: payload.recording, recordingId: input.recordingId } : null);
}

export async function normalizeAutomationRecording<TTimeline, TReview = unknown>(
  input: CommandInput & { recordingId: string },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ timeline: TTimeline; review: TReview | null; reviewError: string | null; recordingId: string }>> {
  type Value = { timeline: TTimeline; review: TReview | null; reviewError: string | null; recordingId: string };
  const preflight = recordingCommandPreflight<Value>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    const timelineResponse = await capabilities.api.post<{ normalizedTimeline?: TTimeline }>(AUTOMATION_RECORDING_ENDPOINTS.normalize, {
      projectId: input.scope.projectId,
      recordingId: input.recordingId
    }, requestOptions(input.signal));
    const afterTimeline = recordingCommandPostflight<Value>(input.scope, capabilities, input.signal);
    if (afterTimeline) return afterTimeline;
    if (!timelineResponse.ok) return recordingRequestFailure(timelineResponse, "Recording could not be normalized.");
    if (!timelineResponse.payload?.normalizedTimeline) return { status: "failure", error: "Recording could not be normalized." };

    const reviewResponse = await capabilities.api.post<{ review?: TReview }>(AUTOMATION_RECORDING_ENDPOINTS.normalizationReview, {
      projectId: input.scope.projectId,
      recordingId: input.recordingId
    }, requestOptions(input.signal));
    const postflight = recordingCommandPostflight<Value>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (reviewResponse.aborted) return recordingRequestFailure(reviewResponse, "Normalization details could not be created.");
    return {
      status: "success",
      value: {
        timeline: timelineResponse.payload.normalizedTimeline,
        review: reviewResponse.ok ? reviewResponse.payload?.review ?? null : null,
        reviewError: reviewResponse.ok ? null : reviewResponse.error ?? "Normalization details could not be created.",
        recordingId: input.recordingId
      }
    };
  } catch (error) {
    return recordingThrownFailure(error, input.signal, "Recording could not be normalized.");
  }
}

export async function updateAutomationRecording<TRecording>(
  input: AuthorizedInput & { recordingId: string; changes: JsonObject },
  capabilities: AutomationRecordingCommandCapabilities
): Promise<AutomationRecordingCommandOutcome<{ recording: TRecording | null; recordingId: string }>> {
  const pinFailure = requirePin<{ recording: TRecording | null; recordingId: string }>(input.authorizationPin);
  if (pinFailure) return pinFailure;
  return postRecording(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.update, {
    ...input.changes,
    projectId: input.scope.projectId,
    recordingId: input.recordingId,
    authorizationPin: input.authorizationPin
  }, "Recording could not be updated.", (payload: { recording?: TRecording } | undefined) => ({
    recording: payload?.recording ?? null,
    recordingId: input.recordingId
  }));
}

export type AutomationRecordingDeleteCapabilities = AutomationRecordingCommandCapabilities & {
  cleanup: AutomationRecordingCleanupTransaction;
};

async function finishDeletion(
  input: AuthorizedInput & { recordingIds: readonly string[] },
  capabilities: AutomationRecordingDeleteCapabilities,
  proposalIds: readonly string[]
): Promise<AutomationRecordingCommandOutcome<AutomationRecordingCleanup>> {
  return commitAutomationRecordingCleanup({
    scope: input.scope,
    recordingIds: input.recordingIds,
    proposalIds,
    ...(input.signal ? { signal: input.signal } : {})
  }, { isCurrent: capabilities.isCurrent, transaction: capabilities.cleanup });
}

export async function deleteAutomationRecording(
  input: AuthorizedInput & { recordingId: string },
  capabilities: AutomationRecordingDeleteCapabilities
): Promise<AutomationRecordingCommandOutcome<AutomationRecordingCleanup>> {
  const pinFailure = requirePin<AutomationRecordingCleanup>(input.authorizationPin);
  if (pinFailure) return pinFailure;
  const result = await postRecording(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.delete, {
    projectId: input.scope.projectId,
    recordingId: input.recordingId,
    authorizationPin: input.authorizationPin
  }, "Recording could not be deleted.", (payload: { deletedRecordingId?: string; deletedProposalIds?: string[] } | undefined) => ({
    recordingIds: [payload?.deletedRecordingId ?? input.recordingId],
    proposalIds: payload?.deletedProposalIds ?? []
  }));
  if (result.status !== "success") return result;
  return finishDeletion({ ...input, recordingIds: result.value.recordingIds }, capabilities, result.value.proposalIds);
}

export async function deleteAutomationRecordings(
  input: AuthorizedInput & { recordingIds: readonly string[] },
  capabilities: AutomationRecordingDeleteCapabilities
): Promise<AutomationRecordingCommandOutcome<AutomationRecordingCleanup>> {
  const pinFailure = requirePin<AutomationRecordingCleanup>(input.authorizationPin);
  if (pinFailure) return pinFailure;
  const uniqueIds = [...new Set(input.recordingIds.filter(Boolean))];
  if (!uniqueIds.length) return { status: "failure", code: "RECORDING_REQUIRED", error: "At least one Recording is required." };
  const result = await postRecording(input, capabilities, AUTOMATION_RECORDING_ENDPOINTS.deleteMany, {
    projectId: input.scope.projectId,
    recordingIds: uniqueIds,
    authorizationPin: input.authorizationPin
  }, "Recordings could not be deleted.", (payload: { deletedRecordingIds?: string[]; deletedProposalIds?: string[] } | undefined) => ({
    recordingIds: payload?.deletedRecordingIds?.length ? payload.deletedRecordingIds : uniqueIds,
    proposalIds: payload?.deletedProposalIds ?? []
  }));
  if (result.status !== "success") return result;
  return finishDeletion({ ...input, recordingIds: result.value.recordingIds }, capabilities, result.value.proposalIds);
}
