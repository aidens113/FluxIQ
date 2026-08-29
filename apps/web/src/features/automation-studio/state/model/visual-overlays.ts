import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { compactObject, readableToken } from "./value-utils";

export function buildOverlays(bindings: NodeEvidenceBindingViewModel[], facts: StateFactViewModel[], selectedEvidenceId: string | undefined, selectedFactPath: string | undefined): StateOverlayViewModel[] {
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  return bindings.flatMap((binding) => {
    const fact = factsByPath.get(binding.factPath);
    const anchor = binding.anchor ?? fact?.anchor;
    if (!anchor || anchor.type === "none") return [];
    return [{
      id: `overlay:${binding.id}`,
      label: binding.label,
      role: binding.role,
      tone: overlayTone(binding.role, binding.confidence),
      anchor,
      factPath: binding.factPath,
      evidenceId: binding.id,
      ...(binding.confidence !== undefined ? { confidence: binding.confidence } : {}),
      selected: binding.id === selectedEvidenceId || binding.factPath === selectedFactPath,
      visualTone: visualToneFromStatePath(binding.factPath)
    }];
  });
}

export function buildActionVisualTargetOverlays(target: ResolvedActionVisualTargetViewModel | undefined): StateOverlayViewModel[] {
  if (!target?.anchor || target.anchor.type === "none") return [];
  return [compactObject({
    id: `action-target:${target.actionEntryId}`,
    label: target.entityId ? `Action target: ${readableToken(target.entityId)}` : "Action target",
    role: "context" as const,
    tone: "action-target" as const,
    anchor: target.anchor,
    factPath: target.statePath ? `${target.statePath.namespace}.${target.statePath.path}` : undefined,
    confidence: target.confidence,
    selected: true,
    visualTone: "selected" as const
  }) as StateOverlayViewModel];
}

export function selectVisualFrame(snapshot: StateSnapshot | null): StateVisualFrame | undefined {
  const frames = snapshot?.presentation?.visualFrames ?? [];
  if (!frames.length) return undefined;
  const defaultFrameId = snapshot?.presentation?.defaultFrameId;
  return frames.find((frame) => frame.id === defaultFrameId) ?? frames[0];
}

export function buildRuntimeComparisonOverlays(comparison: NodeStateRuntimeComparisonViewModel, selectedEvidenceId: string | undefined, selectedFactPath: string | undefined): StateOverlayViewModel[] {
  return comparison.rows.flatMap((row) => {
    if (!row.anchor || row.anchor.type === "none") return [];
    const tone: StateOverlayTone = row.status === "match" ? "positive" : row.status === "mismatch" ? "mismatch" : "neutral";
    return [compactObject({
      id: `overlay:${row.id}`,
      label: row.label,
      role: row.status === "mismatch" ? "failure" : row.status === "match" ? "expectation" : "ignored",
      tone,
      anchor: row.anchor,
      factPath: row.factPath,
      evidenceId: row.evidenceId,
      confidence: row.score,
      selected: row.evidenceId === selectedEvidenceId || row.factPath === selectedFactPath,
      visualTone: visualToneFromStatePath(row.factPath)
    }) as StateOverlayViewModel];
  });
}

export function overlayTone(role: NodeEvidenceRole, confidence = 1): StateOverlayTone {
  if (role === "negative_eligibility" || role === "failure") return "negative";
  if (role === "ignored") return "neutral";
  if (confidence < 0.6) return "weak";
  return "positive";
}

export function visualToneFromStatePath(path: string): StateVisualTone {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".href") || normalized.includes(".url")) return "link";
  if (normalized.includes(".image") || normalized.includes(".img") || normalized.includes(".video") || normalized.includes(".canvas") || normalized.includes(".media")) return "media";
  if (normalized.includes(".nav") || normalized.includes(".menu") || normalized.includes(".tab") || normalized.includes(".breadcrumb")) return "navigation";
  if (normalized.includes(".list") || normalized.includes(".item") || normalized.includes(".row") || normalized.includes(".cell") || normalized.includes(".option")) return "list";
  if (normalized.includes(".status") || normalized.includes(".alert") || normalized.includes(".error") || normalized.includes(".warning") || normalized.includes(".toast")) return "status";
  if (normalized.includes(".value") || normalized.includes(".input")) return "input";
  if (normalized.includes(".text") || normalized.includes(".label") || normalized.includes(".title")) return "text";
  if (normalized.includes(".button") || normalized.includes(".control") || normalized.includes(".action")) return "control";
  if (normalized.includes(".enabled") || normalized.includes(".visible") || normalized.includes(".bounds")) return "region";
  if (normalized.includes(".selected") || normalized.includes(".focus")) return "selected";
  return "unknown";
}
