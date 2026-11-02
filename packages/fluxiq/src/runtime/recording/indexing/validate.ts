import { readRecordingIndexItem } from "./dictionary/index.ts";
import { RECORDING_STATE_INDEX_SCHEMA_VERSION, type RecordingIndex, type RecordingActionVisualTargetIndexItem, type RecordingStateIndexValidationIssue } from "@fluxiq/contracts/recording";
import type { RecordingReferenceReader } from "./policy/index.ts";

export function validateRecordingIndex(index: RecordingIndex, references: RecordingReferenceReader): RecordingStateIndexValidationIssue[] {
  const issues: RecordingStateIndexValidationIssue[] = [];
  if (index.schemaVersion !== RECORDING_STATE_INDEX_SCHEMA_VERSION) {
    issues.push(issue("invalid_schema_version", "schemaVersion", `Recording index schemaVersion must be ${RECORDING_STATE_INDEX_SCHEMA_VERSION}.`));
  }
  if (!index.projectId || !index.recordingId) {
    issues.push(issue("invalid_identity", "", "Recording index must include projectId and recordingId."));
  }
  if (!isFiniteNonNegative(index.summary.startedAt) || !isFiniteNonNegative(index.summary.updatedAt)) {
    issues.push(issue("invalid_summary", "summary", "Recording summary must include non-negative startedAt and updatedAt timestamps."));
  }
  for (const [entryId, entry] of sortedEntries(index.entries)) {
    if (entry.entryId !== entryId) issues.push(issue("entry_key_mismatch", `entries.${entryId}`, "Entry key must match entry.entryId."));
    if (entry.stateSnapshotId && !readRecordingIndexItem(index.states, entry.stateSnapshotId)) {
      issues.push(issue("missing_state", `entries.${entryId}.stateSnapshotId`, `Entry references missing state snapshot ${entry.stateSnapshotId}.`));
    }
    if (entry.actionId && !readRecordingIndexItem(index.actions, entry.actionId)) {
      issues.push(issue("missing_action", `entries.${entryId}.actionId`, `Entry references missing action ${entry.actionId}.`));
    }
    validateObjectRefs(index.projectId, entry.objectRefs ?? [], `entries.${entryId}.objectRefs`, references, issues);
  }
  for (const [actionId, action] of sortedEntries(index.actions)) {
    if (action.actionId !== actionId) issues.push(issue("action_key_mismatch", `actions.${actionId}`, "Action key must match action.actionId."));
    if (!readRecordingIndexItem(index.entries, action.entryId)) issues.push(issue("missing_entry", `actions.${actionId}.entryId`, `Action references missing entry ${action.entryId}.`));
    for (const field of ["stateBeforeId", "stateAtActionId", "stateAfterId"] as const) {
      const stateSnapshotId = action[field];
      if (stateSnapshotId && !readRecordingIndexItem(index.states, stateSnapshotId)) {
        issues.push(issue("missing_state", `actions.${actionId}.${field}`, `Action references missing state snapshot ${stateSnapshotId}.`));
      }
    }
    if (action.visualTarget) validateVisualTarget(index, actionId, action.visualTarget, issues);
    validateObjectRefs(index.projectId, action.sourceObjectRefs ?? [], `actions.${actionId}.sourceObjectRefs`, references, issues);
  }
  for (const [stateSnapshotId, state] of sortedEntries(index.states)) {
    if (state.stateSnapshotId !== stateSnapshotId) issues.push(issue("state_key_mismatch", `states.${stateSnapshotId}`, "State key must match state.stateSnapshotId."));
    if (!readRecordingIndexItem(index.entries, state.entryId)) issues.push(issue("missing_entry", `states.${stateSnapshotId}.entryId`, `State references missing entry ${state.entryId}.`));
    if (!state.stateRef) issues.push(issue("missing_state_ref", `states.${stateSnapshotId}.stateRef`, "State snapshot must include a stateRef object reference."));
    validateObjectRefs(index.projectId, [state.stateRef, ...(state.screenshotRef ? [state.screenshotRef] : []), ...(state.objectRefs ?? [])], `states.${stateSnapshotId}.objectRefs`, references, issues);
    for (const actionId of state.linkedActionIds ?? []) {
      if (!readRecordingIndexItem(index.actions, actionId)) issues.push(issue("missing_action", `states.${stateSnapshotId}.linkedActionIds`, `State links missing action ${actionId}.`));
    }
  }
  for (const [proposalId, proposal] of sortedEntries(index.proposals)) {
    if (proposal.proposalId !== proposalId) issues.push(issue("proposal_key_mismatch", `proposals.${proposalId}`, "Proposal key must match proposal.proposalId."));
    if (proposal.recordingId !== index.recordingId) {
      issues.push(issue("proposal_recording_mismatch", `proposals.${proposalId}.recordingId`, "Proposal must belong to this recording index."));
    }
    for (const stateSnapshotId of proposal.stateSnapshotIds ?? []) {
      if (!readRecordingIndexItem(index.states, stateSnapshotId)) issues.push(issue("missing_state", `proposals.${proposalId}.stateSnapshotIds`, `Proposal references missing state snapshot ${stateSnapshotId}.`));
    }
    validateObjectRefs(index.projectId, proposal.objectRefs ?? [], `proposals.${proposalId}.objectRefs`, references, issues);
  }
  return issues;
}

function validateObjectRefs(projectId: string, refs: string[], path: string, references: RecordingReferenceReader, issues: RecordingStateIndexValidationIssue[]): void {
  for (const ref of refs) {
    const result = references.validate(ref, { projectId });
    if (!result.ok) issues.push(issue(result.code, path, result.message));
  }
}

function validateVisualTarget(index: RecordingIndex, actionId: string, target: RecordingActionVisualTargetIndexItem, issues: RecordingStateIndexValidationIssue[]): void {
  const path = `actions.${actionId}.visualTarget`;
  if (target.stateSnapshotId && !readRecordingIndexItem(index.states, target.stateSnapshotId)) {
    issues.push(issue("missing_state", `${path}.stateSnapshotId`, `Action visual target references missing state snapshot ${target.stateSnapshotId}.`));
  }
  if (target.statePath && (!target.statePath.namespace.trim() || !target.statePath.path.trim())) {
    issues.push(issue("invalid_summary", `${path}.statePath`, "Action visual target statePath must include namespace and path."));
  }
  if (target.confidence !== undefined && (target.confidence < 0 || target.confidence > 1)) {
    issues.push(issue("invalid_summary", `${path}.confidence`, "Action visual target confidence must be between 0 and 1."));
  }
}

function issue(code: RecordingStateIndexValidationIssue["code"], path: string, message: string): RecordingStateIndexValidationIssue {
  return { code, path, message };
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function sortedEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}
