import type { ApiResponse, JsonObject, ProgramApiRequestOptions } from "../../../programs/program-api";

export type AutomationRecordingCommandScope = {
  projectId: string;
  generation: number;
};

export type AutomationRecordingCommandOutcome<T> =
  | { status: "success"; value: T }
  | { status: "failure"; error: string; code?: string }
  | { status: "cancelled"; reason: string }
  | { status: "stale"; reason: string };

export type AutomationRecordingScopeGuard = {
  isCurrent(scope: AutomationRecordingCommandScope): boolean;
};

export type AutomationRecordingApi = {
  post<T>(endpoint: string, payload: JsonObject, options?: ProgramApiRequestOptions): Promise<ApiResponse<T>>;
};

export type AutomationRecordingCommandCapabilities = AutomationRecordingScopeGuard & {
  api: AutomationRecordingApi;
};

export const AUTOMATION_RECORDING_ENDPOINTS = {
  create: "create-recording",
  finalize: "finalize-recording",
  normalize: "normalize-recording",
  normalizationReview: "create-normalization-review",
  update: "update-recording",
  delete: "delete-recording",
  deleteMany: "delete-recordings",
  appendNote: "append-recording-note",
  appendMarker: "append-recording-marker"
} as const;

export function recordingCommandPreflight<T>(
  scope: AutomationRecordingCommandScope,
  guard: AutomationRecordingScopeGuard,
  signal?: AbortSignal
): AutomationRecordingCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The Recording command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The active project changed before the Recording command started." };
  return null;
}

export function recordingCommandPostflight<T>(
  scope: AutomationRecordingCommandScope,
  guard: AutomationRecordingScopeGuard,
  signal?: AbortSignal
): AutomationRecordingCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The Recording command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The Recording command completed for an inactive project generation." };
  return null;
}

export function recordingRequestFailure<T>(
  response: { aborted?: boolean; error?: string },
  fallback: string
): AutomationRecordingCommandOutcome<T> {
  return response.aborted
    ? { status: "cancelled", reason: response.error ?? "The Recording request was cancelled." }
    : { status: "failure", error: response.error ?? fallback };
}

export function recordingThrownFailure<T>(
  error: unknown,
  signal: AbortSignal | undefined,
  fallback: string
): AutomationRecordingCommandOutcome<T> {
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return { status: "cancelled", reason: "The Recording request was cancelled." };
  }
  return { status: "failure", error: error instanceof Error ? error.message : fallback };
}
