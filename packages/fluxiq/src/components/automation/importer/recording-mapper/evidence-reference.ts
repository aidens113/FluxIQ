import type { AutomationStudioRecordingMapperCandidate } from "./candidate.ts";

export type RecordingProposalEvidenceReference = NonNullable<AutomationStudioRecordingMapperCandidate["evidence"]>[number];
