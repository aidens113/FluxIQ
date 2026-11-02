import type { AutomationStudioRecordingCandidateParameterNormalizer, AutomationStudioRecordingMapperCandidate, RecordingFlowActionCandidate } from "../../../../components/automation/importer/recording-mapper/index.ts";

export type RecordingCandidateInput = {
  candidate: AutomationStudioRecordingMapperCandidate;
  actionEntryId: string;
  sourceEntryId: string;
  recordingId: string;
  domainId: string;
  stateLink?: RecordingFlowActionCandidate["stateLink"];
  recordedGapMs?: number;
  mapperOutputIds?: string[];
  nextCandidateId(actionEntryId: string): string;
  normalizeParameters?: AutomationStudioRecordingCandidateParameterNormalizer;
};
