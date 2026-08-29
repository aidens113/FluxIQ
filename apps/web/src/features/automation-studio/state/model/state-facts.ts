import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { readablePath, valueSummary } from "./value-utils";

export function stateFactsFromSnapshot(snapshot: StateSnapshot): StateFactViewModel[] {
  const facts: StateFactViewModel[] = [];
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    for (const [path, stateValue] of Object.entries(stateNamespace.values)) {
      const presentation = stateValue.presentation;
      const fullPath = `${namespace}.${path}`;
      facts.push({
        id: `${snapshot.id ?? snapshot.timestamp}:${fullPath}`,
        namespace,
        path,
        fullPath,
        label: presentation?.label ?? readablePath(path),
        value: valueSummary(stateValue.value),
        rawValue: stateValue.value,
        observedAt: stateValue.observedAt,
        ...(stateValue.confidence !== undefined ? { confidence: stateValue.confidence } : {}),
        ...(presentation?.anchor ? { anchor: presentation.anchor } : {}),
        ...(stateValue.sourceId ? { source: stateValue.sourceId } : {})
      });
    }
  }
  return facts.sort((left, right) => left.namespace.localeCompare(right.namespace) || left.path.localeCompare(right.path));
}

export function stateValueType(value: unknown): string | undefined {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "undefined" ? undefined : typeof value;
}
