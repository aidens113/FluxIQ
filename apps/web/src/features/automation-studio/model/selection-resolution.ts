import type { AutomationSelection } from "../shared/selection-contracts";
import { flowToTaskPolicy } from "./project-artifacts";
import { recordingIdFromStateSourceId } from "./live-helpers";
import type { AutomationEntityIndexes, AutomationFlowEntry } from "./entity-indexes";

export type AutomationSelectionResolutionInput = {
  indexes: AutomationEntityIndexes;
  flowEntries: AutomationFlowEntry[];
  tasks: any[];
  proposals: any[];
  policies: any[];
  selection: AutomationSelection | null;
  lastOpenFlowId: string | null;
  lastOpenTaskId: string | null;
};

export type AutomationSelectionResolution = {
  selectionProposalId: string | undefined;
  selectionRecordingIdForProposal: string | undefined;
  selectedFlowEntry: AutomationFlowEntry | null;
  selectedFlow: any | null;
  runnableFlowEntry: AutomationFlowEntry | null;
  runnableFlow: any | null;
  selectedProposal: any | null;
  selectedTask: any | null;
  selectedTaskFlow: any | null;
  selectedTaskGraph: any | null;
  selectedCanonicalPolicy: any | null;
  selectedPolicy: any | null;
  selectedRecordingId: string | null | undefined;
  selectedRecording: any | null;
  selectedTimeline: any | null;
  selectedNode: any | null;
  selectedEntry: any | null;
  selectedSignal: any | null;
  flowForSelection: (selection: AutomationSelection | null | undefined) => any | null;
  recordingForSelection: (selection: AutomationSelection | null | undefined) => any | null;
  proposalForSelection: (selection: AutomationSelection | null | undefined) => any | null;
  taskForSelection: (selection: AutomationSelection | null | undefined) => any | null;
  policyForSelection: (selection: AutomationSelection | null | undefined) => any | null;
};

function proposalRecordingId(proposal: any): string | undefined {
  return typeof proposal?.metadata?.recordingId === "string"
    ? proposal.metadata.recordingId
    : typeof proposal?.recordingId === "string" ? proposal.recordingId : undefined;
}

function proposalIdForSelection(selection: AutomationSelection | null): string | undefined {
  if (selection?.kind === "state") return selection.proposalId;
  if (selection?.kind === "editor-node" && typeof selection.node.metadata?.proposalId === "string") return selection.node.metadata.proposalId;
  return undefined;
}

function recordingIdForProposalSelection(selection: AutomationSelection | null, indexes: AutomationEntityIndexes): string | undefined {
  if (selection?.kind === "recording") return selection.id;
  if (selection?.kind === "timeline") return indexes.timelineEntryById.get(selection.id)?.recordingId ?? undefined;
  if (selection?.kind === "state") return selection.recordingId ?? recordingIdFromStateSourceId(selection.sourceId);
  if (selection?.kind === "editor-node" && typeof selection.node.metadata?.recordingId === "string") return selection.node.metadata.recordingId;
  return undefined;
}

function proposalRecordingIdForSelection(
  selection: AutomationSelection | null,
  indexes: AutomationEntityIndexes,
  selectedProposal: any
): string | null | undefined {
  if (selection?.kind === "editor-node") {
    return typeof selection.node.metadata?.recordingId === "string"
      ? selection.node.metadata.recordingId
      : proposalRecordingId(selectedProposal);
  }
  if (selection?.kind === "state") {
    const proposal = selection.proposalId ? indexes.proposalById.get(selection.proposalId) : undefined;
    return selection.recordingId ?? proposalRecordingId(proposal);
  }
  return null;
}

export function resolveAutomationSelection(input: AutomationSelectionResolutionInput): AutomationSelectionResolution {
  const { indexes, selection } = input;
  const selectedFlowEntry = (selection?.kind === "flow" ? indexes.flowEntryById.get(selection.id) : undefined)
    ?? (input.lastOpenFlowId ? indexes.canonicalFlowEntryById.get(input.lastOpenFlowId) : undefined)
    ?? indexes.canonicalFlowEntryById.values().next().value
    ?? input.flowEntries[0]
    ?? null;
  const selectedFlow = selectedFlowEntry?.flow ?? null;
  const runnableFlowEntry = selectedFlowEntry?.source === "canonical" ? selectedFlowEntry : null;
  const runnableFlow = runnableFlowEntry?.flow ?? null;

  const selectionProposalId = proposalIdForSelection(selection);
  const selectionRecordingIdForProposal = recordingIdForProposalSelection(selection, indexes);
  const selectedProposal = (selectionProposalId ? indexes.proposalById.get(selectionProposalId) : undefined)
    ?? (selectionRecordingIdForProposal ? indexes.latestProposalByRecordingId.get(selectionRecordingIdForProposal) : undefined)
    ?? (selection ? null : input.proposals[0] ?? null);

  const selectedTask = (selection?.kind === "policy"
    ? indexes.taskByPolicyId.get(selection.id) ?? indexes.taskById.get(selection.id)
    : undefined)
    ?? (input.lastOpenTaskId ? indexes.taskById.get(input.lastOpenTaskId) : undefined)
    ?? input.tasks[0]
    ?? null;
  const selectedTaskFlow = selectedTask?.taskId ? indexes.taskFlowByTaskId.get(selectedTask.taskId) ?? null : null;
  const selectedTaskGraph = selectedFlow ?? selectedTask?.graph ?? selectedTaskFlow;

  const selectedCanonicalPolicy = selectedTask
    ? (selectedTask.metadata?.policyId ? indexes.policyById.get(selectedTask.metadata.policyId) : undefined)
      ?? indexes.policyByTaskId.get(selectedTask.taskId)
      ?? null
    : selection?.kind === "policy"
      ? indexes.policyById.get(selection.id) ?? null
      : input.policies[0] ?? null;
  const selectedPolicy = selectedTaskGraph ? flowToTaskPolicy(selectedTaskGraph, selectedTask) : selectedCanonicalPolicy;

  const timelineRecordingId = selection?.kind === "timeline"
    ? indexes.timelineEntryById.get(selection.id)?.recordingId
    : selection?.kind === "state"
      ? selection.recordingId ?? recordingIdFromStateSourceId(selection.sourceId)
      : null;
  const proposalSelectionRecordingId = proposalRecordingIdForSelection(selection, indexes, selectedProposal);
  const selectedRecordingId = timelineRecordingId ?? proposalSelectionRecordingId;
  const selectedRecording = (selection?.kind === "recording"
    ? indexes.recordingById.get(selection.id)
    : selectedRecordingId ? indexes.recordingById.get(selectedRecordingId) : undefined)
    ?? (selection ? null : indexes.recordingById.values().next().value ?? null);
  const selectedTimeline = selectedRecording
    ? indexes.timelineByRecordingId.get(selectedRecording.recordingId) ?? null
    : selection ? null : indexes.timelineByRecordingId.values().next().value ?? null;

  const selectedNode = selection?.kind === "editor-node"
    ? {
        id: selection.id,
        ...selection.node,
        actions: (selection.node.actionTypes ?? []).map((actionType) => ({ actionType })),
        recovery: { strategy: selection.node.family }
      }
    : selectedProposal?.policy?.nodes?.find((node: any) => selection?.kind === "state" && selection.proposalId && selection.nodeId === node.id)
      ?? selectedPolicy?.nodes?.find((node: any) => selection?.kind === "node" && selection.id === node.id)
      ?? selectedPolicy?.nodes?.find((node: any) => selection?.kind === "state" && selection.nodeId === node.id)
      ?? (selection ? null : selectedPolicy?.nodes?.[0] ?? null);

  const selectedEntryLocation = selection?.kind === "timeline" ? indexes.timelineEntryById.get(selection.id) : undefined;
  const selectedEntry = selectedEntryLocation?.entry ?? null;
  const selectedSignal = selection?.kind === "signal" ? indexes.signalByPath.get(selection.id) ?? null : null;

  const taskForSelection = (source: AutomationSelection | null | undefined) => (
    source?.kind === "policy" ? indexes.taskByPolicyId.get(source.id) ?? indexes.taskById.get(source.id) : undefined
  ) ?? selectedTask ?? input.tasks[0] ?? null;

  const flowForSelection = (source: AutomationSelection | null | undefined) => {
    if (source?.kind === "flow") return indexes.flowById.get(source.id) ?? selectedFlow;
    const task = taskForSelection(source);
    return task?.taskId ? indexes.taskFlowByTaskId.get(task.taskId) ?? task.graph ?? selectedFlow : selectedFlow;
  };

  const recordingForSelection = (source: AutomationSelection | null | undefined) => {
    if (source?.kind === "recording") return indexes.recordingById.get(source.id) ?? null;
    const timelineId = source?.kind === "timeline"
      ? indexes.timelineEntryById.get(source.id)?.recordingId
      : source?.kind === "state" ? source.recordingId ?? recordingIdFromStateSourceId(source.sourceId) : null;
    const proposal = source?.kind === "state" && source.proposalId
      ? indexes.proposalById.get(source.proposalId)
      : undefined;
    const requestedId = timelineId
      ?? (source && "recordingId" in source ? source.recordingId : undefined)
      ?? proposalRecordingId(proposal);
    const exact = requestedId ? indexes.recordingById.get(requestedId) : undefined;
    if (source?.kind === "timeline" || source?.kind === "editor-node" || source?.kind === "state") return exact ?? null;
    return exact ?? selectedRecording;
  };

  const proposalForSelection = (source: AutomationSelection | null | undefined) => {
    const exact = source?.kind === "recording"
      ? indexes.proposalsByRecordingId.get(source.id)?.[0]
      : source?.kind === "state" && source.proposalId
        ? indexes.proposalById.get(source.proposalId)
        : undefined;
    if (source?.kind === "editor-node" || source?.kind === "state" || source?.kind === "recording") return exact ?? null;
    return exact ?? selectedProposal;
  };

  const policyForSelection = (source: AutomationSelection | null | undefined) => {
    if (source?.kind !== "policy") return selectedPolicy;
    const task = taskForSelection(source);
    return indexes.policyById.get(source.id)
      ?? (task?.metadata?.policyId ? indexes.policyById.get(task.metadata.policyId) : undefined)
      ?? selectedPolicy;
  };

  return {
    selectionProposalId,
    selectionRecordingIdForProposal,
    selectedFlowEntry,
    selectedFlow,
    runnableFlowEntry,
    runnableFlow,
    selectedProposal,
    selectedTask,
    selectedTaskFlow,
    selectedTaskGraph,
    selectedCanonicalPolicy,
    selectedPolicy,
    selectedRecordingId,
    selectedRecording,
    selectedTimeline,
    selectedNode,
    selectedEntry,
    selectedSignal,
    flowForSelection,
    recordingForSelection,
    proposalForSelection,
    taskForSelection,
    policyForSelection
  };
}