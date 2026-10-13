import type { RecordingApi } from "./recording-api-types";

export async function generateRecordingDeterministicSubflow(api: RecordingApi, input: { projectId: string; recordingId: string; flowId: string; authorizationPin: string }) {
  return { ok: false, error: "Author task instructions in the destination Flow and optionally attach this described recording. Recording-only Subflow generation has been retired." };
}

export function repairRecordingStateIndex(api: RecordingApi, input: { projectId: string; recordingId: string; authorizationPin: string }) {
  return api.post<{ warnings?: string[] }>("repair-recording-state-index", {
    projectId: input.projectId,
    recordingId: input.recordingId,
    mode: "write",
    authorizationPin: input.authorizationPin
  });
}