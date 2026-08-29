import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { isActionLikeTimelineEntry } from "./state-source-index";
import { numberValue, objectRecord, stringValue } from "./value-utils";

export function resolveSelectedActionVisualTarget(entry: unknown, snapshot: StateSnapshot | null): ResolvedActionVisualTargetViewModel | undefined {
  const record = objectRecord(entry);
  if (!record || !isActionLikeTimelineEntry(record) || !objectRecord(record.visualTarget)) return undefined;
  const target = objectRecord(record.visualTarget)!;
  const actionEntryId = stringValue(record.id) ?? "action";
  const base = compactActionVisualTarget({
    actionEntryId,
    stateSnapshotId: stringValue(target.stateSnapshotId) ?? snapshot?.id,
    entityId: stringValue(target.entityId),
    entityKind: stringValue(target.entityKind),
    statePath: statePathValue(target.statePath),
    anchor: evidenceAnchorValue(target.anchor),
    confidence: numberValue(target.confidence)
  });
  if (!snapshot) return { ...base, resolution: base.anchor ? "anchor" : "missing" };
  const frames = snapshot.presentation?.visualFrames ?? [];
  const frame = frames.find((item) => item.id === stringValue(target.visualFrameId)) ?? frames[0];
  const layerId = stringValue(target.visualLayerId);
  const layer = layerId ? (frame?.layers.find((item) => item.id === layerId) ?? frames.flatMap((item) => item.layers).find((item) => item.id === layerId)) : undefined;
  if (layer) return compactActionVisualTarget({ ...base, visualFrameId: frame?.id, visualLayerId: layer.id, anchor: layerAnchorValue(layer) ?? base.anchor, statePath: layerStatePathValue(layer) ?? base.statePath, resolution: "exact-layer" });
  if (base.statePath) {
    const pathKey = `${base.statePath.namespace}.${base.statePath.path}`;
    const pathLayerMatch = frames.flatMap((item) => item.layers.map((layer) => ({ frame: item, layer }))).find((item) => statePathKey(layerStatePathValue(item.layer)) === pathKey);
    if (pathLayerMatch) return compactActionVisualTarget({ ...base, visualFrameId: pathLayerMatch.frame.id, visualLayerId: pathLayerMatch.layer.id, anchor: layerAnchorValue(pathLayerMatch.layer) ?? base.anchor, resolution: "state-path" });
    const stateAnchor = snapshot.namespaces[base.statePath.namespace]?.values[base.statePath.path]?.presentation?.anchor;
    if (stateAnchor) return { ...base, anchor: stateAnchor, resolution: "state-path" };
  }
  const entityLayerMatch = frames.flatMap((item) => item.layers.map((layer) => ({ frame: item, layer }))).find((item) => {
    const identity = layerEntityIdentity(item.layer);
    return identity.entityId === base.entityId && (!base.entityKind || !identity.entityKind || identity.entityKind === base.entityKind);
  });
  if (entityLayerMatch) return compactActionVisualTarget({ ...base, visualFrameId: entityLayerMatch.frame.id, visualLayerId: entityLayerMatch.layer.id, anchor: layerAnchorValue(entityLayerMatch.layer) ?? base.anchor, resolution: "entity" });
  if (base.anchor && base.anchor.type !== "none") return { ...base, resolution: "anchor" };
  return { ...base, resolution: "missing", issues: ["No visual layer, state-path anchor, or direct anchor matched the action visual target."] };
}

export function statePathValue(value: unknown): { namespace: string; path: string } | undefined {
  const record = objectRecord(value);
  const namespace = stringValue(record?.namespace);
  const path = stringValue(record?.path);
  return namespace && path ? { namespace, path } : undefined;
}

export function evidenceAnchorValue(value: unknown): EvidenceAnchor | undefined {
  const record = objectRecord(value);
  return stringValue(record?.type) ? value as EvidenceAnchor : undefined;
}

export function layerAnchorValue(layer: StateVisualFrame["layers"][number]): EvidenceAnchor | undefined {
  if (layer.kind === "image") return compactAnchor({ type: "bounds", bounds: layer.bounds, boundsKind: layer.boundsKind });
  if ("anchor" in layer && layer.anchor) return layer.anchor;
  if ("bounds" in layer && layer.bounds) return compactAnchor({ type: "bounds", bounds: layer.bounds, boundsKind: layer.boundsKind });
  return undefined;
}

export function layerStatePathValue(layer: StateVisualFrame["layers"][number]): { namespace: string; path: string } | undefined {
  if (layer.kind !== "region" && layer.kind !== "element") return undefined;
  const raw = layer.statePath ?? stringValue(objectRecord(layer.metadata)?.statePath) ?? stringValue(objectRecord(layer.metadata)?.factPath);
  if (!raw) return undefined;
  const [namespace, ...pathParts] = raw.split(".");
  return namespace && pathParts.length ? { namespace, path: pathParts.join(".") } : undefined;
}

export function layerEntityIdentity(layer: StateVisualFrame["layers"][number]): { entityId?: string; entityKind?: string } {
  const anchor = "anchor" in layer ? layer.anchor : undefined;
  if (anchor?.type === "entity") return compactIdentity({ entityId: anchor.entityId, entityKind: anchor.entityKind });
  const metadata = objectRecord(layer.metadata);
  return compactIdentity({ entityId: stringValue(metadata?.entityId), entityKind: stringValue(metadata?.entityKind) });
}

export function statePathKey(value: { namespace: string; path: string } | undefined): string {
  return value ? `${value.namespace}.${value.path}` : "";
}

export function compactActionVisualTarget(value: Record<string, unknown>): ResolvedActionVisualTargetViewModel {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as ResolvedActionVisualTargetViewModel;
}

export function compactAnchor(value: { type: "bounds"; bounds: { x: number; y: number; width: number; height: number }; boundsKind?: "screenshot" | "document" | undefined }): EvidenceAnchor {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as unknown as EvidenceAnchor;
}

export function compactIdentity(value: { entityId?: string | undefined; entityKind?: string | undefined }): { entityId?: string; entityKind?: string } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { entityId?: string; entityKind?: string };
}

export function selectedEntryVisualTarget(entry: unknown): Record<string, unknown> | null {
  const record = objectRecord(entry);
  if (!record || !isActionLikeTimelineEntry(record)) return null;
  return objectRecord(record.visualTarget);
}
