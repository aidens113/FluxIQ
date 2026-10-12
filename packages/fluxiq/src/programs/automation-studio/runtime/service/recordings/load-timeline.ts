import { readFile } from "node:fs/promises";
import type { RecordingSession } from "../../../model/index.ts";
import { AutomationStudioProjectRuntimeStreamStore, AutomationStudioRecordingStreamStore, type AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

/** File-only and legacy split histories share one typed recording read owner. */
export async function loadRecordingTimeline(filePath: string, projectId: string, recordingId: string, pool?: AutomationStudioProjectDatabasePool): Promise<RecordingSession["timeline"]> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "";
    throw error;
  });
  const legacy = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line) as RecordingSession["timeline"][number]);
  if (!pool) return AutomationStudioRecordingStreamStore.merge(legacy) as RecordingSession["timeline"];
  const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId });
  try { return await store.readRecordingTimeline(recordingId, legacy); }
  finally { await store.close(); }
}
