import type { EvidenceReference, RecordingSession, TimelineEntry } from "@fluxiq/contracts/recording";
import type { RecordingTargetValidationPolicy } from "./target-policy.ts";
import { validateActionVisualEntityTarget } from "./visual-target.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "../../../flows/executable/validation/index.ts";
export function validateRecordingSession<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, targetPolicy: RecordingTargetValidationPolicy<TTarget>): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const entryIds = new Set<string>();
  const noteIds = new Set(recording.notes.map((note) => note.id));
  const sourceIds = new Set(recording.sources.map((source) => source.id));

  if (!recording.recordingId) {
    addIssue(issues, "error", "recording.missing_id", "Recording must have a recordingId.", "recordingId");
  }
  if (recording.initialState.timestamp < recording.startedAt) {
    addIssue(issues, "warning", "recording.initial_state_before_start", "Initial state timestamp is before recording start.", "initialState.timestamp");
  }
  if (recording.endedAt !== undefined && recording.endedAt < recording.startedAt) {
    addIssue(issues, "error", "recording.ends_before_start", "Recording endedAt must be greater than or equal to startedAt.", "endedAt");
  }

  let previousSequence = -1;
  for (const [index, entry] of recording.timeline.entries()) {
    const path = `timeline.${index}`;
    if (entry.recordingId !== recording.recordingId) {
      addIssue(issues, "error", "timeline.recording_id_mismatch", "Timeline entry recordingId must match the parent recording.", `${path}.recordingId`);
    }
    if (entryIds.has(entry.id)) {
      addIssue(issues, "error", "timeline.duplicate_entry_id", `Duplicate timeline entry id "${entry.id}".`, `${path}.id`);
    }
    entryIds.add(entry.id);
    if (entry.sequence <= previousSequence) {
      addIssue(issues, "error", "timeline.sequence_not_increasing", "Timeline entry sequence values must be strictly increasing.", `${path}.sequence`);
    }
    previousSequence = entry.sequence;
    if (!sourceIds.has(entry.sourceId)) {
      addIssue(issues, "warning", "timeline.unknown_source", `Timeline entry references unknown source "${entry.sourceId}".`, `${path}.sourceId`);
    }
    validateTimelineEntry(entry, issues, path, noteIds, targetPolicy);
  }

  for (const [index, note] of recording.notes.entries()) {
    const path = `notes.${index}`;
    for (const linkedEntryId of note.linkedEntryIds ?? []) {
      if (!entryIds.has(linkedEntryId)) {
        addIssue(issues, "warning", "note.missing_linked_entry", `Note links to missing timeline entry "${linkedEntryId}".`, `${path}.linkedEntryIds`);
      }
    }
  }

  return result(issues);
}

function validateTimelineEntry<TTarget, TEvidence>(
  entry: TimelineEntry<TTarget, TEvidence>,
  issues: AutomationStudioValidationIssue[],
  path: string,
  noteIds: Set<string>,
  targetPolicy: RecordingTargetValidationPolicy<TTarget>
): void {
  if (entry.confidence !== undefined && (entry.confidence < 0 || entry.confidence > 1)) {
    addIssue(issues, "error", "timeline.invalid_confidence", "Timeline entry confidence must be between 0 and 1.", `${path}.confidence`);
  }
  if (entry.type === "note" && !noteIds.has(entry.noteId)) {
    addIssue(issues, "warning", "timeline.missing_note", `Note entry references missing note "${entry.noteId}".`, `${path}.noteId`);
  }
  if (entry.type === "action" && entry.visualTarget) validateActionVisualEntityTarget(entry.visualTarget, issues, `${path}.visualTarget`);
  if (entry.type === "action" && entry.target !== undefined) issues.push(...targetPolicy.targetIssues(entry.target, `${path}.target`));
  if (entry.type === "action") issues.push(...targetPolicy.parameterIssues(entry.parameters, `${path}.parameters`));
  if (entry.type === "state_delta" && entry.deltas.length === 0) {
    addIssue(issues, "warning", "timeline.empty_state_delta", "State delta entries should contain at least one delta.", `${path}.deltas`);
  }
}
