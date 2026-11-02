import type { RecordingFlowActionCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";

export type RecordingMappingResult = {
  candidates: RecordingFlowActionCandidate[];
  issues: string[];
  stats: { mappedEntryCount: number; emittedCandidateCount: number; acceptedCandidateCount: number };
};
