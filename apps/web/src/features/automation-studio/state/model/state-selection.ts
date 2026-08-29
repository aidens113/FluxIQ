import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { compactObject, objectRecord, readableToken, stringValue } from "./value-utils";

export const nodeStatePhases: Array<{ id: NodeStatePhase; label: string }> = [
  { id: "input", label: "Input" },
  { id: "action", label: "Action" },
  { id: "expected_output", label: "Expected Output" },
  { id: "actual_output", label: "Actual Output" }
];

export function phaseFrom(value: unknown, source: NodeStateSource | null): NodeStatePhase {
  if (value === "input" || value === "action" || value === "expected_output" || value === "actual_output") {
    return value === "actual_output" && source?.kind !== "runtime" ? "input" : value;
  }
  return "input";
}

export function selectionRecord(selection: AutomationSelection | null): { sourceId?: string; phase?: NodeStatePhase; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string } {
  const record = objectRecord(selection);
  return compactObject({
    sourceId: stringValue(record?.sourceId),
    phase: phaseFrom(record?.phase, null),
    recordingId: stringValue(record?.recordingId),
    proposalId: stringValue(record?.proposalId),
    timelineEntryId: stringValue(record?.timelineEntryId),
    stateSnapshotId: stringValue(record?.stateSnapshotId)
  }) as { sourceId?: string; phase?: NodeStatePhase; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string };
}

export function selectedNodeId(selection: AutomationSelection | null, selectedNode: unknown): string {
  const nodeRecord = objectRecord(selectedNode);
  return stringValue(nodeRecord?.id)
    ?? stringValue(objectRecord(nodeRecord?.node)?.id)
    ?? (selection?.kind === "state" ? selection.nodeId ?? "" : "")
    ?? (selection?.kind === "node" || selection?.kind === "editor-node" ? selection.id : "")
    ?? "";
}

export function selectedNodeLabel(selectedNode: unknown, nodeId: string): string {
  const record = objectRecord(selectedNode);
  return stringValue(record?.label) ?? stringValue(objectRecord(record?.node)?.label) ?? (nodeId || "Selected Node");
}

export function sourceLabel(source: NodeStateSource): string {
  if (source.kind === "learned") return `${source.label} (${source.recordingIds.length} recording${source.recordingIds.length === 1 ? "" : "s"})`;
  return source.label;
}

export function phaseLabel(phase: NodeStatePhase): string {
  return nodeStatePhases.find((item) => item.id === phase)?.label ?? readableToken(phase);
}
