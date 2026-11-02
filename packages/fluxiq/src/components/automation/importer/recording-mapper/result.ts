import type { AutomationStudioRecordingMapperCandidate } from "./candidate.ts";
export type AutomationStudioRecordingMapperResult = AutomationStudioRecordingMapperCandidate | {
  candidates: AutomationStudioRecordingMapperCandidate[];
} | null;
