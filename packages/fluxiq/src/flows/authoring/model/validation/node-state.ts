import type { NodeStateRuntimeComparison, NodeStateSource, NodeStateViewSelection } from "../index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

export function validateNodeStateSource(source: NodeStateSource): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!source.id.trim()) addIssue(issues, "error", "node_state.source_missing_id", "Node state source must have an id.", "id");
  if (!source.label.trim()) addIssue(issues, "error", "node_state.source_missing_label", "Node state source must have a label.", "label");
  if (source.kind === "learned") {
    if (!source.nodeId.trim()) addIssue(issues, "error", "node_state.learned_missing_node_id", "Learned node state source must include a nodeId.", "nodeId");
    if (source.modelId !== undefined && !source.modelId.trim()) addIssue(issues, "error", "node_state.learned_empty_model_id", "Learned node state modelId cannot be empty when provided.", "modelId");
    if (!source.recordingIds.length) addIssue(issues, "warning", "node_state.learned_without_recordings", "Learned node state source should retain contributing recording IDs.", "recordingIds");
    source.recordingIds.forEach((recordingId, index) => {
      if (!recordingId.trim()) addIssue(issues, "error", "node_state.learned_empty_recording_id", "Learned node state recordingIds cannot contain empty IDs.", `recordingIds.${index}`);
    });
    if (source.confidence !== undefined && (source.confidence < 0 || source.confidence > 1)) addIssue(issues, "error", "node_state.learned_invalid_confidence", "Learned node state confidence must be between 0 and 1.", "confidence");
  } else if (source.kind === "observed") {
    if (!source.recordingId.trim()) addIssue(issues, "error", "node_state.observed_missing_recording_id", "Observed node state source must include a recordingId.", "recordingId");
    if (source.timelineEntryId !== undefined && !source.timelineEntryId.trim()) addIssue(issues, "error", "node_state.observed_empty_timeline_entry_id", "Observed node state timelineEntryId cannot be empty when provided.", "timelineEntryId");
    if (!Number.isFinite(source.timestamp)) addIssue(issues, "error", "node_state.observed_invalid_timestamp", "Observed node state source timestamp must be finite.", "timestamp");
  } else if (source.kind === "runtime") {
    if (source.sessionId !== undefined && !source.sessionId.trim()) addIssue(issues, "error", "node_state.runtime_empty_session_id", "Runtime node state sessionId cannot be empty when provided.", "sessionId");
    if (!Number.isFinite(source.timestamp)) addIssue(issues, "error", "node_state.runtime_invalid_timestamp", "Runtime node state source timestamp must be finite.", "timestamp");
  }
  return result(issues);
}

export function validateNodeStateViewSelection(selection: NodeStateViewSelection): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (selection.sourceId !== undefined && !selection.sourceId.trim()) addIssue(issues, "error", "node_state.selection_empty_source_id", "Node state view sourceId cannot be empty when provided.", "sourceId");
  return result(issues);
}

export function validateNodeStateRuntimeComparison(comparison: NodeStateRuntimeComparison): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!comparison.expectedSourceId.trim()) addIssue(issues, "error", "node_state.comparison_missing_expected_source", "Runtime comparison must include an expectedSourceId.", "expectedSourceId");
  if (!comparison.actualSourceId.trim()) addIssue(issues, "error", "node_state.comparison_missing_actual_source", "Runtime comparison must include an actualSourceId.", "actualSourceId");
  if (!comparison.nodeId.trim()) addIssue(issues, "error", "node_state.comparison_missing_node_id", "Runtime comparison must include a nodeId.", "nodeId");
  if (comparison.phase !== "actual_output") addIssue(issues, "error", "node_state.comparison_invalid_phase", "Runtime comparison phase must be actual_output.", "phase");
  comparison.matches.forEach((item, index) => {
    validateRuntimeComparisonPath(item.evidenceId, issues, `matches.${index}.evidenceId`, "node_state.comparison_match_missing_evidence", "Runtime comparison match must include an evidenceId.");
    validateRuntimeComparisonPath(item.factPath, issues, `matches.${index}.factPath`, "node_state.comparison_match_missing_fact", "Runtime comparison match must include a factPath.");
    if (item.score !== undefined && (item.score < 0 || item.score > 1)) addIssue(issues, "error", "node_state.comparison_match_invalid_score", "Runtime comparison match score must be between 0 and 1.", `matches.${index}.score`);
  });
  comparison.mismatches.forEach((item, index) => {
    validateRuntimeComparisonPath(item.evidenceId, issues, `mismatches.${index}.evidenceId`, "node_state.comparison_mismatch_missing_evidence", "Runtime comparison mismatch must include an evidenceId.");
    validateRuntimeComparisonPath(item.factPath, issues, `mismatches.${index}.factPath`, "node_state.comparison_mismatch_missing_fact", "Runtime comparison mismatch must include a factPath.");
    if (item.severity !== "warning" && item.severity !== "error") addIssue(issues, "error", "node_state.comparison_mismatch_invalid_severity", "Runtime comparison mismatch severity must be warning or error.", `mismatches.${index}.severity`);
  });
  if (comparison.confidence !== undefined && (comparison.confidence < 0 || comparison.confidence > 1)) addIssue(issues, "error", "node_state.comparison_invalid_confidence", "Runtime comparison confidence must be between 0 and 1.", "confidence");
  return result(issues);
}

function validateRuntimeComparisonPath(value: string, issues: AutomationStudioValidationIssue[], path: string, code: string, message: string): void {
  if (!value.trim()) addIssue(issues, "error", code, message, path);
}
