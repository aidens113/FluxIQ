import type { ActionVisualEntityTarget } from "./actions.ts";
import type { EvidenceAnchor, StatePath, StateSnapshot, StateValue, StateVisualFrame, StateVisualLayer } from "./state.ts";
import type { ActionEntry } from "./timeline.ts";

export type ActionVisualTargetResolution = "exact-layer" | "state-path" | "entity" | "anchor" | "missing";

export type ResolvedActionVisualTarget = {
  actionEntryId: string;
  stateSnapshotId?: string;
  visualFrameId?: string;
  visualLayerId?: string;
  anchor?: EvidenceAnchor;
  entityId?: string;
  entityKind?: string;
  statePath?: StatePath;
  confidence?: number;
  resolution: ActionVisualTargetResolution;
  issues?: string[];
};

export type ResolveActionVisualTargetInput = {
  action: { id: string; visualTarget?: ActionEntry["visualTarget"] };
  stateSnapshot?: StateSnapshot | null;
  stateSnapshotId?: string;
};

export function resolveActionVisualTarget(input: ResolveActionVisualTargetInput): ResolvedActionVisualTarget {
  const target = input.action.visualTarget;
  const stateSnapshot = input.stateSnapshot ?? null;
  const stateSnapshotId = target?.stateSnapshotId ?? input.stateSnapshotId ?? stateSnapshot?.id;
  if (!target) return missing(input.action.id, stateSnapshotId, ["Action has no visual target."]);

  const base = compactResolved({
    actionEntryId: input.action.id,
    stateSnapshotId,
    entityId: target.entityId,
    entityKind: target.entityKind,
    statePath: target.statePath,
    anchor: target.anchor,
    confidence: target.confidence
  });
  if (!stateSnapshot) {
    return target.anchor ? { ...base, resolution: "anchor" } : { ...base, resolution: "missing", issues: ["No state snapshot is available for visual target resolution."] };
  }

  const frames = stateSnapshot.presentation?.visualFrames ?? [];
  const frame = selectFrame(frames, target.visualFrameId);
  const layer = findLayer(frames, frame, target.visualLayerId);
  if (target.visualLayerId) {
    if (layer) return resolvedFromLayer(base, frame, layer, "exact-layer");
    return compactResolved({ ...base, visualFrameId: target.visualFrameId, visualLayerId: target.visualLayerId, resolution: "missing", issues: [`Visual layer "${target.visualLayerId}" was not found.`] });
  }

  if (target.statePath) {
    const statePath = statePathKey(target.statePath);
    const pathLayer = findLayerByStatePath(frames, statePath);
    if (pathLayer) return resolvedFromLayer(base, pathLayer.frame, pathLayer.layer, "state-path");
    const value = findStateValue(stateSnapshot, target.statePath);
    if (value?.presentation?.anchor) return { ...base, anchor: value.presentation.anchor, resolution: "state-path" };
  }

  const entityLayer = findLayerByEntity(frames, target.entityId, target.entityKind);
  if (entityLayer) return resolvedFromLayer(base, entityLayer.frame, entityLayer.layer, "entity");

  if (target.anchor && target.anchor.type !== "none") return { ...base, resolution: "anchor" };
  return { ...base, resolution: "missing", issues: ["No visual layer, state-path anchor, or direct anchor matched the action visual target."] };
}

function resolvedFromLayer(base: Omit<ResolvedActionVisualTarget, "resolution">, frame: StateVisualFrame | undefined, layer: StateVisualLayer, resolution: Exclude<ActionVisualTargetResolution, "anchor" | "missing">): ResolvedActionVisualTarget {
  return compactResolved({
    ...base,
    visualFrameId: frame?.id,
    visualLayerId: layer.id,
    anchor: layerAnchor(layer) ?? base.anchor,
    statePath: layerStatePath(layer) ?? base.statePath,
    resolution
  }) as ResolvedActionVisualTarget;
}

function missing(actionEntryId: string, stateSnapshotId: string | undefined, issues: string[]): ResolvedActionVisualTarget {
  return compactResolved({ actionEntryId, stateSnapshotId, resolution: "missing", issues }) as ResolvedActionVisualTarget;
}

function selectFrame(frames: StateVisualFrame[], visualFrameId: string | undefined): StateVisualFrame | undefined {
  if (visualFrameId) return frames.find((frame) => frame.id === visualFrameId);
  const defaultFrame = frames.find((frame) => frame.id);
  return defaultFrame;
}

function findLayer(frames: StateVisualFrame[], preferredFrame: StateVisualFrame | undefined, visualLayerId: string | undefined): StateVisualLayer | undefined {
  if (!visualLayerId) return undefined;
  return preferredFrame?.layers.find((layer) => layer.id === visualLayerId)
    ?? frames.flatMap((frame) => frame.layers).find((layer) => layer.id === visualLayerId);
}

function findLayerByStatePath(frames: StateVisualFrame[], statePath: string): { frame: StateVisualFrame; layer: StateVisualLayer } | undefined {
  for (const frame of frames) {
    const layer = frame.layers.find((item) => statePathKey(layerStatePath(item)) === statePath);
    if (layer) return { frame, layer };
  }
  return undefined;
}

function findLayerByEntity(frames: StateVisualFrame[], entityId: string, entityKind: string | undefined): { frame: StateVisualFrame; layer: StateVisualLayer } | undefined {
  for (const frame of frames) {
    const layer = frame.layers.find((item) => {
      const layerEntity = layerEntityIdentity(item);
      return layerEntity.entityId === entityId && (!entityKind || !layerEntity.entityKind || layerEntity.entityKind === entityKind);
    });
    if (layer) return { frame, layer };
  }
  return undefined;
}

function findStateValue(snapshot: StateSnapshot, statePath: StatePath): StateValue | undefined {
  return snapshot.namespaces[statePath.namespace]?.values[statePath.path];
}

function layerStatePath(layer: StateVisualLayer): StatePath | undefined {
  if (layer.kind !== "region" && layer.kind !== "element") return undefined;
  if (layer.statePath) {
    const [namespace, ...pathParts] = layer.statePath.split(".");
    return namespace && pathParts.length ? { namespace, path: pathParts.join(".") } : undefined;
  }
  const metadata = objectMetadata(layer.metadata);
  const raw = stringMetadata(metadata.statePath) ?? stringMetadata(metadata.factPath);
  if (!raw) return undefined;
  const [namespace, ...pathParts] = raw.split(".");
  return namespace && pathParts.length ? { namespace, path: pathParts.join(".") } : undefined;
}

function layerAnchor(layer: StateVisualLayer): EvidenceAnchor | undefined {
  if (layer.kind === "image") return compactAnchor({ type: "bounds", bounds: layer.bounds, boundsKind: layer.boundsKind });
  if (layer.anchor) return layer.anchor;
  if ("bounds" in layer && layer.bounds) return compactAnchor({ type: "bounds", bounds: layer.bounds, boundsKind: layer.boundsKind });
  return undefined;
}

function layerEntityIdentity(layer: StateVisualLayer): { entityId?: string; entityKind?: string } {
  const anchor = "anchor" in layer ? layer.anchor : undefined;
  if (anchor?.type === "entity") return compactIdentity({ entityId: anchor.entityId, entityKind: anchor.entityKind });
  const metadata = objectMetadata(layer.metadata);
  return compactIdentity({ entityId: stringMetadata(metadata.entityId), entityKind: stringMetadata(metadata.entityKind) });
}

function statePathKey(value: StatePath | undefined): string {
  return value ? `${value.namespace}.${value.path}` : "";
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactResolved(value: Record<string, unknown>): ResolvedActionVisualTarget {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as ResolvedActionVisualTarget;
}

function compactAnchor(value: { type: "bounds"; bounds: NonNullable<Extract<EvidenceAnchor, { type: "bounds" }>["bounds"]>; boundsKind?: Extract<EvidenceAnchor, { type: "bounds" }>["boundsKind"] }): EvidenceAnchor {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as unknown as EvidenceAnchor;
}

function compactIdentity(value: { entityId?: string | undefined; entityKind?: string | undefined }): { entityId?: string; entityKind?: string } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { entityId?: string; entityKind?: string };
}
