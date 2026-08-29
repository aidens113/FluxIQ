import type { RecordingApi } from "./recording-api-types";

export function repairRecordingStateIndex(api: RecordingApi, input: { projectId: string; recordingId: string; authorizationPin: string }) {
  return api.post<{ warnings?: string[] }>("repair-recording-state-index", {
    projectId: input.projectId,
    recordingId: input.recordingId,
    mode: "write",
    authorizationPin: input.authorizationPin
  });
}