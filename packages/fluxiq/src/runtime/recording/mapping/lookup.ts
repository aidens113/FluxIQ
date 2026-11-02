import type { ProposalNodeStateLink } from "@fluxiq/contracts/recording";
import type { AutomationStudioRecordingMapperCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";

export interface RecordingMappingLookup {
  resolveCandidateActionEntryId(sourceEntryId: string, candidate: AutomationStudioRecordingMapperCandidate): string;
  proposalNodeStateLink(actionEntryId: string): ProposalNodeStateLink | undefined;
}
