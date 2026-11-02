import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { AutomationStudioRecordingMapperBinding } from "../../../components/automation/importer/recording-mapper/index.ts";
import type { ElementMatcher } from "../../target-matching/index.ts";
import type { RecordingMappingIo } from "./io.ts";
import type { RecordingMappingLookup } from "./lookup.ts";

export type RecordingMappingInput = {
  mapper: AutomationStudioRecordingMapperBinding;
  io: RecordingMappingIo;
  elementMatcher: ElementMatcher;
  recordingId: string;
  domainId: string;
  timeline: RecordingSession["timeline"];
  rawEntryCount: number;
  entryCounts: string;
  lookup?: RecordingMappingLookup;
  nextCandidateId(actionEntryId: string): string;
  formatTokenLabel(outputId: string): string;
};
