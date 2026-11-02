import type { RecordingIndex, RecordingStateIndexValidationIssue } from "@fluxiq/contracts/recording";
import { assertValidRecordingIndex as assertIndex, validateRecordingIndex as validateIndex } from "../../../runtime/recording/indexing/index.ts";
import { automationStudioRecordingReferenceReader } from "./recording-index-policy/index.ts";

export { RECORDING_STATE_INDEX_SCHEMA_VERSION } from "@fluxiq/contracts/recording";
export type { RecordingIndexSchemaVersion, RecordingIndex, RecordingIndexSummary, RecordingTimelineIndex, RecordingEntryIndexItem, RecordingActionIndexItem, RecordingActionVisualTargetIndexItem, RecordingStateIndexItem, RecordingStateCoordinateSpace, RecordingProposalIndexItem, ProposalNodeStateLink, RecordingStateIndexValidationIssue, EmptyRecordingIndexInput } from "@fluxiq/contracts/recording";
export { emptyRecordingIndex, isRecordingIndex, recordingIndexStateObjectRefs, sortRecordingIndex, recordingActionVisualTargetIndexItem } from "../../../runtime/recording/indexing/index.ts";

export function validateRecordingIndex(index: RecordingIndex): RecordingStateIndexValidationIssue[] {
  return validateIndex(index, automationStudioRecordingReferenceReader);
}

export function assertValidRecordingIndex(index: RecordingIndex): void {
  assertIndex(index, automationStudioRecordingReferenceReader);
}
