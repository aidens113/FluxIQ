import type { EvidenceAnchor, StateBounds, StateCoordinateSpace, StatePath, StatePresentationMetadata, StateSnapshot, StateVisualFrame, StateVisualLayer } from "../index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

export function validateStateSnapshot(snapshot: StateSnapshot): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (snapshot.id !== undefined && !snapshot.id.trim()) {
    addIssue(issues, "error", "state.snapshot_empty_id", "State snapshot id cannot be empty when provided.", "id");
  }
  if (!Number.isFinite(snapshot.timestamp)) {
    addIssue(issues, "error", "state.snapshot_invalid_timestamp", "State snapshot timestamp must be finite.", "timestamp");
  }
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    const namespacePath = `namespaces.${namespace}`;
    if (!namespace.trim()) addIssue(issues, "error", "state.namespace_empty_id", "State namespace id cannot be empty.", namespacePath);
    for (const [valuePath, value] of Object.entries(stateNamespace.values)) {
      if (!valuePath.trim()) addIssue(issues, "error", "state.value_empty_path", "State value path cannot be empty.", `${namespacePath}.values`);
      if (!Number.isFinite(value.observedAt)) addIssue(issues, "error", "state.value_invalid_observed_at", "State value observedAt must be finite.", `${namespacePath}.values.${valuePath}.observedAt`);
      if (value.confidence !== undefined && (value.confidence < 0 || value.confidence > 1)) addIssue(issues, "error", "state.value_invalid_confidence", "State value confidence must be between 0 and 1.", `${namespacePath}.values.${valuePath}.confidence`);
      if (value.presentation) validateStatePresentationMetadata(value.presentation, issues, `${namespacePath}.values.${valuePath}.presentation`);
    }
  }
  const frames = snapshot.presentation?.visualFrames ?? [];
  const frameIds = new Set<string>();
  for (const [index, frame] of frames.entries()) {
    const path = `presentation.visualFrames.${index}`;
    validateStateVisualFrame(frame, issues, path);
    if (frameIds.has(frame.id)) addIssue(issues, "error", "state.visual_frame_duplicate_id", `Duplicate state visual frame id "${frame.id}".`, `${path}.id`);
    frameIds.add(frame.id);
  }
  if (snapshot.presentation?.defaultFrameId && !frameIds.has(snapshot.presentation.defaultFrameId)) {
    addIssue(issues, "error", "state.visual_frame_missing_default", `Default visual frame "${snapshot.presentation.defaultFrameId}" is not present.`, "presentation.defaultFrameId");
  }
  return result(issues);
}

export function validateStateVisualFrame(frame: StateVisualFrame): AutomationStudioValidationResult;
export function validateStateVisualFrame(frame: StateVisualFrame, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateStateVisualFrame(frame: StateVisualFrame, issues?: AutomationStudioValidationIssue[], path = "visualFrame"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (!frame.id.trim()) addIssue(localIssues, "error", "state.visual_frame_missing_id", "State visual frame must have an id.", `${path}.id`);
  if (frame.rendererId !== undefined && !frame.rendererId.trim()) addIssue(localIssues, "error", "state.visual_frame_empty_renderer", "State visual frame rendererId cannot be empty.", `${path}.rendererId`);
  validateStateCoordinateSpace(frame.coordinateSpace, localIssues, `${path}.coordinateSpace`);
  const layerIds = new Set<string>();
  for (const [index, layer] of frame.layers.entries()) {
    const layerPath = `${path}.layers.${index}`;
    validateStateVisualLayer(layer, localIssues, layerPath);
    if (layerIds.has(layer.id)) addIssue(localIssues, "error", "state.visual_layer_duplicate_id", `Duplicate state visual layer id "${layer.id}".`, `${layerPath}.id`);
    layerIds.add(layer.id);
  }
  if (frame.presentation) validateStatePresentationMetadata(frame.presentation, localIssues, `${path}.presentation`);
  if (!issues) return result(localIssues);
}

export function validateEvidenceAnchor(anchor: EvidenceAnchor): AutomationStudioValidationResult;
export function validateEvidenceAnchor(anchor: EvidenceAnchor, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateEvidenceAnchor(anchor: EvidenceAnchor, issues?: AutomationStudioValidationIssue[], path = "anchor"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (anchor.type === "point") {
    validateFiniteCoordinate(anchor.x, localIssues, `${path}.x`);
    validateFiniteCoordinate(anchor.y, localIssues, `${path}.y`);
  } else if (anchor.type === "bounds") {
    validateStateBounds(anchor.bounds, localIssues, `${path}.bounds`);
    validateOptionalStateBoundsKind(anchor.boundsKind, localIssues, `${path}.boundsKind`);
  } else if (anchor.type === "element" && !anchor.elementId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_element", "Element anchor must have an elementId.", `${path}.elementId`);
  } else if (anchor.type === "entity" && !anchor.entityId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_entity", "Entity anchor must have an entityId.", `${path}.entityId`);
  } else if (anchor.type === "region" && !anchor.regionId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_region", "Region anchor must have a regionId.", `${path}.regionId`);
  } else if (anchor.type === "path") {
    if (anchor.points.length < 2) addIssue(localIssues, "error", "state.anchor_path_too_short", "Path anchor must have at least two points.", `${path}.points`);
    anchor.points.forEach((point, index) => {
      validateFiniteCoordinate(point.x, localIssues, `${path}.points.${index}.x`);
      validateFiniteCoordinate(point.y, localIssues, `${path}.points.${index}.y`);
    });
  }
  if ("rendererId" in anchor && anchor.rendererId !== undefined && !anchor.rendererId.trim()) {
    addIssue(localIssues, "error", "state.anchor_empty_renderer", "Anchor rendererId cannot be empty.", `${path}.rendererId`);
  }
  if (!issues) return result(localIssues);
}

export function validateStatePath(statePath: StatePath, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!statePath.namespace.trim()) addIssue(issues, "error", "state.path_missing_namespace", "State path namespace cannot be empty.", `${path}.namespace`);
  if (!statePath.path.trim()) addIssue(issues, "error", "state.path_missing_path", "State path path cannot be empty.", `${path}.path`);
}

function validateStateCoordinateSpace(space: StateCoordinateSpace, issues: AutomationStudioValidationIssue[], path: string): void {
  validatePositiveFinite(space.width, issues, `${path}.width`, "State coordinate space width must be a positive finite number.");
  validatePositiveFinite(space.height, issues, `${path}.height`, "State coordinate space height must be a positive finite number.");
  if (space.scale !== undefined) validatePositiveFinite(space.scale, issues, `${path}.scale`, "State coordinate space scale must be a positive finite number.");
}

function validateStateVisualLayer(layer: StateVisualLayer, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!layer.id.trim()) addIssue(issues, "error", "state.visual_layer_missing_id", "State visual layer must have an id.", `${path}.id`);
  validateOptionalStateBoundsKind(layer.boundsKind, issues, `${path}.boundsKind`);
  if ("renderKind" in layer) validateOptionalStateRenderKind(layer.renderKind, issues, `${path}.renderKind`);
  if ("isVisibleOnViewport" in layer && layer.isVisibleOnViewport !== undefined && typeof layer.isVisibleOnViewport !== "boolean") {
    addIssue(issues, "error", "state.visual_layer_invalid_viewport_visibility", "State visual layer isVisibleOnViewport must be boolean.", `${path}.isVisibleOnViewport`);
  }
  if (layer.kind === "image") {
    if (!isAllowedStateContentRef(layer.contentRef)) {
      addIssue(issues, "error", "state.visual_layer_unsafe_content_ref", "Image layer contentRef must be an Automation Studio object or API reference.", `${path}.contentRef`);
    }
    validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
      addIssue(issues, "error", "state.visual_layer_invalid_opacity", "Image layer opacity must be between 0 and 1.", `${path}.opacity`);
    }
    return;
  }
  if (layer.kind === "text") {
    if (layer.bounds) validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
    return;
  }
  if (layer.kind === "region") {
    validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
    return;
  }
  if (layer.kind === "element") {
    if (layer.bounds) validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
  }
}

function validateStatePresentationMetadata(presentation: StatePresentationMetadata, issues: AutomationStudioValidationIssue[], path: string): void {
  if (presentation.order !== undefined && !Number.isFinite(presentation.order)) {
    addIssue(issues, "error", "state.presentation_invalid_order", "State presentation order must be finite.", `${path}.order`);
  }
  if (presentation.anchor) validateEvidenceAnchor(presentation.anchor, issues, `${path}.anchor`);
}

function validateStateBounds(bounds: StateBounds, issues: AutomationStudioValidationIssue[], path: string): void {
  validateFiniteCoordinate(bounds.x, issues, `${path}.x`);
  validateFiniteCoordinate(bounds.y, issues, `${path}.y`);
  validatePositiveFinite(bounds.width, issues, `${path}.width`, "State bounds width must be a positive finite number.");
  validatePositiveFinite(bounds.height, issues, `${path}.height`, "State bounds height must be a positive finite number.");
}

function validateOptionalStateBoundsKind(value: unknown, issues: AutomationStudioValidationIssue[], path: string): void {
  if (value === undefined || value === "screenshot" || value === "document") return;
  addIssue(issues, "error", "state.invalid_bounds_kind", "State boundsKind must be screenshot or document.", path);
}

function validateOptionalStateRenderKind(value: unknown, issues: AutomationStudioValidationIssue[], path: string): void {
  if (value === undefined || value === "screenshot-bbox" || value === "direct-rendered") return;
  addIssue(issues, "error", "state.invalid_render_kind", "State renderKind must be screenshot-bbox or direct-rendered.", path);
}

function validateFiniteCoordinate(value: number, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!Number.isFinite(value)) addIssue(issues, "error", "state.coordinate_not_finite", "State coordinates must be finite numbers.", path);
}

function validatePositiveFinite(value: number, issues: AutomationStudioValidationIssue[], path: string, message: string): void {
  if (!Number.isFinite(value) || value <= 0) addIssue(issues, "error", "state.dimension_not_positive", message, path);
}

function isAllowedStateContentRef(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("automation-object://")
    || trimmed.startsWith("fluxiq-object://")
    || trimmed.startsWith("object://")
    || trimmed.startsWith("/api/");
}
