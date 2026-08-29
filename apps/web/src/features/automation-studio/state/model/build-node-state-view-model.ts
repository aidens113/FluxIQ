import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { resolveSelectedActionVisualTarget, selectedEntryVisualTarget } from "./action-targets";
import { collectEvidenceBindings, evidenceBindingViewModel, summarizeEvidence } from "./evidence-bindings";
import { buildRuntimeComparison, collectDiffRows } from "./state-comparison";
import { stateFactsFromSnapshot } from "./state-facts";
import { phaseFrom, phaseLabel, selectedNodeId, selectedNodeLabel, selectionRecord, sourceLabel } from "./state-selection";
import { collectStateSources, inferPreferredObservedSourceId, stateSourceSnapshotId } from "./state-source-index";
import { buildStructuredStateRows } from "./structured-state";
import { stringValue } from "./value-utils";
import { buildActionVisualTargetOverlays, buildOverlays, buildRuntimeComparisonOverlays, selectVisualFrame } from "./visual-overlays";
import { nodeStatePhases } from "./state-selection";

export function buildNodeStateViewModel(input: BuildNodeStateViewModelInput): NodeStateViewModel {
  const nodeId = selectedNodeId(input.selection, input.selectedNode);
  const nodeLabel = selectedNodeLabel(input.selectedNode, nodeId);
  const sourceRecords = collectStateSources(input, nodeId);
  const sources = sourceRecords.map((record) => record.source);
  const bindings = collectEvidenceBindings(input, nodeId);
  const selection = selectionRecord(input.selection);
  const requestedSourceId = input.viewState?.sourceId
    ?? selection.sourceId
    ?? undefined;
  const selectedActionTarget = selectedEntryVisualTarget(input.selectedEntry);
  const requestedStateSnapshotId = input.viewState?.stateSnapshotId
    ?? selection.stateSnapshotId
    ?? stringValue(selectedActionTarget?.stateSnapshotId);
  const exactStateRequested = Boolean(requestedSourceId || requestedStateSnapshotId || selection.timelineEntryId);
  const sourceIdForRequestedSnapshot = requestedStateSnapshotId
    ? sourceRecords.find((record) => stateSourceSnapshotId(record.source) === requestedStateSnapshotId)?.source.id
    : undefined;
  const preferredSourceId = requestedSourceId && sourceRecords.some((record) => record.source.id === requestedSourceId)
    ? requestedSourceId
    : sourceIdForRequestedSnapshot
      ?? (!exactStateRequested ? inferPreferredObservedSourceId(input, sourceRecords, bindings, nodeId) : undefined)
      ?? requestedSourceId;
  const activeRecord = sourceRecords.find((record) => record.source.id === preferredSourceId) ?? (!exactStateRequested ? sourceRecords[0] ?? null : null);
  const activeSource = activeRecord?.source ?? null;
  const activePhase = phaseFrom(input.viewState?.phase ?? selectionRecord(input.selection).phase, activeSource);
  const snapshot = activeRecord?.snapshot ?? null;
  const facts = snapshot ? stateFactsFromSnapshot(snapshot) : [];
  const bindingModels = bindings.map((binding) => evidenceBindingViewModel(binding, input.viewState?.selectedEvidenceId));
  const runtimeComparison = buildRuntimeComparison(input, activeRecord, nodeId, bindings, facts, sourceRecords);
  const actionVisualTarget = resolveSelectedActionVisualTarget(input.selectedEntry, snapshot);
  const overlays = runtimeComparison && activePhase === "actual_output"
    ? buildRuntimeComparisonOverlays(runtimeComparison, input.viewState?.selectedEvidenceId, input.viewState?.selectedFactPath)
    : [
      ...buildOverlays(bindingModels, facts, input.viewState?.selectedEvidenceId, input.viewState?.selectedFactPath),
      ...buildActionVisualTargetOverlays(actionVisualTarget)
    ];
  const visualFrame = selectVisualFrame(snapshot);
  const structuredRows = buildStructuredStateRows(facts);
  const diffRows = collectDiffRows(activeRecord);
  const evidenceSummary = summarizeEvidence(bindingModels);
  const raw = {
    source: activeSource,
    snapshot,
    visualFrame,
    facts: facts.map((fact) => ({ namespace: fact.namespace, path: fact.path, value: fact.rawValue, observedAt: fact.observedAt, confidence: fact.confidence })),
    evidence: bindings,
    actionVisualTarget,
    runtimeComparison,
    deltas: activeRecord?.deltas ?? []
  };
  const emptyState = exactStateRequested && !activeRecord
    ? { title: "Requested state is not loaded", message: "The selected timeline entry or proposal node has an exact state link, but that state source is not available in this view yet." }
    : sources.length
    ? facts.length || bindings.length || visualFrame ? undefined : { title: "No state facts", message: "The selected source has no inspectable state values yet." }
    : { title: "No state source", message: nodeId ? "No observed, learned, or runtime state is linked to this node yet." : "Select a node or recording moment to inspect state." };

  return {
    title: nodeId ? `Node State: ${nodeLabel}` : "State View",
    subtitle: activeSource ? `${sourceLabel(activeSource)} | ${phaseLabel(activePhase)}` : "No state source selected",
    sources,
    activeSource,
    phases: nodeStatePhases.map((phase) => ({ ...phase, available: phase.id !== "actual_output" || activeSource?.kind === "runtime" })),
    activePhase,
    ...(visualFrame ? { visualFrame } : {}),
    facts,
    evidence: bindingModels,
    overlays,
    structuredRows,
    diffRows,
    ...(runtimeComparison ? { runtimeComparison } : {}),
    ...(actionVisualTarget ? { actionVisualTarget } : {}),
    raw,
    summary: {
      facts: facts.length,
      evidence: bindingModels.length,
      ...evidenceSummary,
      ...(runtimeComparison ? { matches: runtimeComparison.matches.length, mismatches: runtimeComparison.mismatches.length } : {}),
      ...(activeSource?.kind === "learned" && activeSource.confidence !== undefined ? { confidence: activeSource.confidence } : {})
    },
    ...(emptyState ? { emptyState } : {})
  };
}
