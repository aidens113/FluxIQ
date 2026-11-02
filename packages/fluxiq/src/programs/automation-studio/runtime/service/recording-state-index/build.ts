import type { RecordingIndex } from "@fluxiq/contracts/recording";
import { buildRecordingStateIndex as buildIndex } from "../../../../../runtime/recording/indexing/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import { automationStudioRecordingIndexBuildPorts } from "./policy.ts";

export function buildRecordingStateIndex(projectId: string, recording: RecordingSession): RecordingIndex {
  return buildIndex(projectId, recording, automationStudioRecordingIndexBuildPorts);
}
