import type { ActionVisualEntityTarget } from "../index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";
import { validateEvidenceAnchor, validateStatePath } from "./state.ts";

export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget): AutomationStudioValidationResult;
export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget, issues?: AutomationStudioValidationIssue[], path = "visualTarget"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (!target.entityId.trim()) addIssue(localIssues, "error", "action.visual_target_missing_entity", "Action visual target must include an entityId.", `${path}.entityId`);
  if (target.entityKind !== undefined && !target.entityKind.trim()) addIssue(localIssues, "error", "action.visual_target_empty_entity_kind", "Action visual target entityKind cannot be empty when provided.", `${path}.entityKind`);
  if (target.visualFrameId !== undefined && !target.visualFrameId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_frame", "Action visual target visualFrameId cannot be empty when provided.", `${path}.visualFrameId`);
  if (target.visualLayerId !== undefined && !target.visualLayerId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_layer", "Action visual target visualLayerId cannot be empty when provided.", `${path}.visualLayerId`);
  if (target.stateSnapshotId !== undefined && !target.stateSnapshotId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_state", "Action visual target stateSnapshotId cannot be empty when provided.", `${path}.stateSnapshotId`);
  if (target.confidence !== undefined && (target.confidence < 0 || target.confidence > 1)) addIssue(localIssues, "error", "action.visual_target_invalid_confidence", "Action visual target confidence must be between 0 and 1.", `${path}.confidence`);
  if (target.source !== undefined && target.source !== "importer" && target.source !== "runtime" && target.source !== "inferred" && target.source !== "operator") {
    addIssue(localIssues, "error", "action.visual_target_invalid_source", "Action visual target source must be importer, runtime, inferred, or operator.", `${path}.source`);
  }
  if (target.statePath) validateStatePath(target.statePath, localIssues, `${path}.statePath`);
  if (target.anchor) validateEvidenceAnchor(target.anchor, localIssues, `${path}.anchor`);
  if (!issues) return result(localIssues);
}
