import type { EvidenceComparator, EvidenceReference, NodeEvidenceBinding, StateFact, StateFactReference } from "../index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";
import { validateEvidenceAnchor } from "./state.ts";

export function validateStateFactReference(fact: StateFactReference): AutomationStudioValidationResult;
export function validateStateFactReference(fact: StateFactReference, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateStateFactReference(fact: StateFactReference, issues?: AutomationStudioValidationIssue[], path = "fact"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (fact.snapshotId !== undefined && !fact.snapshotId.trim()) addIssue(localIssues, "error", "evidence.fact_empty_snapshot_id", "State fact snapshotId cannot be empty when provided.", `${path}.snapshotId`);
  if (!fact.namespace.trim()) addIssue(localIssues, "error", "evidence.fact_missing_namespace", "State fact reference must include a namespace.", `${path}.namespace`);
  if (!fact.path.trim()) addIssue(localIssues, "error", "evidence.fact_missing_path", "State fact reference must include a path.", `${path}.path`);
  if (fact.observedAt !== undefined && !Number.isFinite(fact.observedAt)) addIssue(localIssues, "error", "evidence.fact_invalid_observed_at", "State fact observedAt must be finite.", `${path}.observedAt`);
  if (fact.evidence) validateEvidenceReference(fact.evidence, localIssues, `${path}.evidence`);
  if (!issues) return result(localIssues);
}

export function validateStateFact(fact: StateFact): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  validateStateFactReference(fact, issues, "fact");
  if (fact.id !== undefined && !fact.id.trim()) addIssue(issues, "error", "evidence.fact_empty_id", "State fact id cannot be empty when provided.", "fact.id");
  if (fact.confidence !== undefined && (fact.confidence < 0 || fact.confidence > 1)) addIssue(issues, "error", "evidence.fact_invalid_confidence", "State fact confidence must be between 0 and 1.", "fact.confidence");
  if (fact.anchor) validateEvidenceAnchor(fact.anchor, issues, "fact.anchor");
  return result(issues);
}

export function validateNodeEvidenceBinding(binding: NodeEvidenceBinding): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!binding.id.trim()) addIssue(issues, "error", "evidence.binding_missing_id", "Node evidence binding must have an id.", "id");
  if (!binding.nodeId.trim()) addIssue(issues, "error", "evidence.binding_missing_node_id", "Node evidence binding must have a nodeId.", "nodeId");
  validateStateFactReference(binding.fact, issues, "fact");
  validateEvidenceComparator(binding.comparator, issues, "comparator");
  if (binding.weight !== undefined && (binding.weight < 0 || binding.weight > 1)) addIssue(issues, "error", "evidence.binding_invalid_weight", "Node evidence binding weight must be between 0 and 1.", "weight");
  if (binding.confidence !== undefined && (binding.confidence < 0 || binding.confidence > 1)) addIssue(issues, "error", "evidence.binding_invalid_confidence", "Node evidence binding confidence must be between 0 and 1.", "confidence");
  if (binding.anchor) validateEvidenceAnchor(binding.anchor, issues, "anchor");
  binding.provenance?.forEach((reference, index) => validateEvidenceReference(reference, issues, `provenance.${index}`));
  return result(issues);
}

function validateEvidenceComparator(comparator: EvidenceComparator, issues: AutomationStudioValidationIssue[], path: string): void {
  if (comparator.kind === "numeric" && !Number.isFinite(comparator.value)) {
    addIssue(issues, "error", "evidence.comparator_invalid_numeric_value", "Numeric evidence comparator value must be finite.", `${path}.value`);
  }
  if (comparator.kind === "custom" && !comparator.comparatorId.trim()) {
    addIssue(issues, "error", "evidence.comparator_missing_custom_id", "Custom evidence comparator must have a comparatorId.", `${path}.comparatorId`);
  }
}

function validateEvidenceReference(reference: EvidenceReference, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!reference.artifactId.trim()) addIssue(issues, "error", "evidence.reference_missing_artifact", "Evidence reference must have an artifactId.", `${path}.artifactId`);
  if (reference.entryId !== undefined && !reference.entryId.trim()) addIssue(issues, "error", "evidence.reference_empty_entry", "Evidence reference entryId cannot be empty when provided.", `${path}.entryId`);
  if (reference.signalPath !== undefined && !reference.signalPath.trim()) addIssue(issues, "error", "evidence.reference_empty_signal_path", "Evidence reference signalPath cannot be empty when provided.", `${path}.signalPath`);
  if (reference.noteId !== undefined && !reference.noteId.trim()) addIssue(issues, "error", "evidence.reference_empty_note", "Evidence reference noteId cannot be empty when provided.", `${path}.noteId`);
  if (reference.relationship !== undefined && !reference.relationship.trim()) addIssue(issues, "error", "evidence.reference_empty_relationship", "Evidence reference relationship cannot be empty when provided.", `${path}.relationship`);
  if (reference.confidence !== undefined && (reference.confidence < 0 || reference.confidence > 1)) addIssue(issues, "error", "evidence.reference_invalid_confidence", "Evidence reference confidence must be between 0 and 1.", `${path}.confidence`);
}
