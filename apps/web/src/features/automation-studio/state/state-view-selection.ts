import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeStateViewModel } from "./model/types";
import { objectMetadata, stringMetadata } from "./state-visual-classification";

export function stateSelection(selection: AutomationSelection | null): { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string; stateRef?: string } {
  if (selection?.kind !== "state") return {};
  return compactStateSelection({
    sourceId: selection.sourceId,
    phase: selection.phase,
    evidenceId: selection.evidenceId,
    factPath: selection.factPath,
    recordingId: selection.recordingId,
    proposalId: selection.proposalId,
    timelineEntryId: selection.timelineEntryId,
    stateSnapshotId: selection.stateSnapshotId,
    stateRef: selection.stateRef
  });
}

export function stateSelectionKey(selection: AutomationSelection | null): string {
  if (selection?.kind !== "state") return `${selection?.kind ?? "none"}:${selection?.id ?? ""}`;
  return [
    selection.kind,
    selection.id,
    selection.nodeId ?? "",
    selection.sourceId ?? "",
    selection.phase ?? "",
    selection.evidenceId ?? "",
    selection.factPath ?? "",
    selection.recordingId ?? "",
    selection.proposalId ?? "",
    selection.timelineEntryId ?? "",
    selection.stateSnapshotId ?? "",
    selection.stateRef ?? ""
  ].join("|");
}

export function stateAutomationSelection(model: NodeStateViewModel, input: BuildNodeStateViewModelInput, next: { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string }): AutomationSelection {
  const nodeId = inputNodeId(input) ?? (model.activeSource?.kind === "learned" ? model.activeSource.nodeId : undefined);
  const sourceId = next.sourceId ?? model.activeSource?.id;
  const recordingId = inputSelectionRecordingId(input) ?? (model.activeSource?.kind === "observed" ? model.activeSource.recordingId : undefined);
  const proposalId = inputSelectionProposalId(input);
  return {
    kind: "state",
    id: `state:${nodeId ?? model.activeSource?.id ?? "workspace"}`,
    ...(nodeId ? { nodeId } : {}),
    ...(sourceId ? { sourceId } : {}),
    phase: next.phase ?? model.activePhase,
    ...(next.evidenceId ? { evidenceId: next.evidenceId } : {}),
    ...(next.factPath ? { factPath: next.factPath } : {}),
    ...(recordingId ? { recordingId } : {}),
    ...(proposalId ? { proposalId } : {}),
    ...(input.selection?.kind === "state" && input.selection.timelineEntryId ? { timelineEntryId: input.selection.timelineEntryId } : {}),
    ...(input.selection?.kind === "state" && input.selection.stateSnapshotId ? { stateSnapshotId: input.selection.stateSnapshotId } : {}),
    ...(input.selection?.kind === "state" && input.selection.stateRef ? { stateRef: input.selection.stateRef } : {})
  };
}

export function inputSelectionProposalId(input: BuildNodeStateViewModelInput): string | undefined {
  if (input.selection?.kind === "state") return input.selection.proposalId;
  if (input.selection?.kind === "editor-node") return stringMetadata(objectMetadata(input.selection.node.metadata).proposalId);
  return stringMetadata(objectMetadata(input.selectedProposal).proposalId);
}

export function inputSelectionRecordingId(input: BuildNodeStateViewModelInput): string | undefined {
  if (input.selection?.kind === "recording") return input.selection.id;
  if (input.selection?.kind === "state") return input.selection.recordingId;
  if (input.selection?.kind === "editor-node") return stringMetadata(objectMetadata(input.selection.node.metadata).recordingId);
  return stringMetadata(objectMetadata(input.selectedRecording).recordingId)
    ?? stringMetadata(objectMetadata(input.selectedProposal).recordingId)
    ?? stringMetadata(objectMetadata(objectMetadata(input.selectedProposal).metadata).recordingId);
}

export function inputNodeId(input: BuildNodeStateViewModelInput): string | undefined {
  const selected = input.selection;
  if (selected?.kind === "node" || selected?.kind === "editor-node") return selected.id;
  if (selected?.kind === "state") return selected.nodeId;
  const node = input.selectedNode;
  if (node && typeof node === "object" && !Array.isArray(node) && typeof (node as { id?: unknown }).id === "string") return (node as { id: string }).id;
  return undefined;
}

export function compactStateViewState(value: { sourceId?: string | undefined; stateSnapshotId?: string | undefined; phase?: NodeStatePhase | undefined; selectedEvidenceId?: string | undefined; selectedFactPath?: string | undefined }): NonNullable<BuildNodeStateViewModelInput["viewState"]> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as NonNullable<BuildNodeStateViewModelInput["viewState"]>;
}

export function compactStateSelection(value: { sourceId?: string | undefined; phase?: NodeStatePhase | undefined; evidenceId?: string | undefined; factPath?: string | undefined; recordingId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined; stateRef?: string | undefined }) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string; stateRef?: string };
}
