import type { RecordingApi } from "./recording-api-types";

export function queryRecordingPage(api: RecordingApi, input: { projectId: string; limit: number; offset: number }) {
  return api.post<{ recordings?: any[]; page?: { limit: number; offset: number; total: number } }>("list-recordings", {
    projectId: input.projectId,
    summaries: true,
    limit: input.limit,
    offset: input.offset
  });
}