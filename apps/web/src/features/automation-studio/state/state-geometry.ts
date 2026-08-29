import type { CSSProperties } from "react";
import type { EvidenceAnchor, StateVisualLayer } from "fluxiq/automation-studio";
import type { NodeStateViewModel, StateFactViewModel } from "./model/types";
import type { StateBounds, StateBoundsKind, StateRenderKind, StateSize, StateVisualMetrics, StateVisualSurfaceMode } from "./state-visual-types";
import { objectMetadata, stringMetadata } from "./state-visual-classification";

export function visualFrameMetrics(frame: NodeStateViewModel["visualFrame"], facts: StateFactViewModel[] = [], surface: StateVisualSurfaceMode): StateVisualMetrics {
  const metadata = objectMetadata(frame?.metadata);
  const viewport = viewportBoundsFromFacts(facts) ?? viewportBoundsFromFrame(frame);
  const scroll = { x: nonNegativeNumber(metadata.scrollX), y: nonNegativeNumber(metadata.scrollY) };
  const frameSize = frame ? { width: Math.max(1, frame.coordinateSpace.width), height: Math.max(1, frame.coordinateSpace.height) } : { width: 1, height: 1 };
  const image = imageBoundsFromFrame(frame) ?? frameSize;
  const documentSize = documentSizeFromFrame(frame, facts, viewport);
  const coordinate = surface === "document"
    ? documentSize
    : { width: viewport?.width ?? image.width, height: viewport?.height ?? image.height };
  return {
    surface,
    coordinate,
    image,
    aspect: coordinate,
    scroll,
    ...(viewport ? { viewport: surface === "document" ? { ...viewport, x: scroll.x, y: scroll.y } : { ...viewport, x: 0, y: 0 } } : {})
  };
}

export function layerBounds(layer: StateVisualLayer): StateBounds | null {
  if ("bounds" in layer && layer.bounds) return layer.bounds;
  if ("anchor" in layer) return anchorBounds(layer.anchor);
  return null;
}

export function layerBoundsKind(layer: StateVisualLayer, fallback: StateBoundsKind): StateBoundsKind {
  const explicit = "boundsKind" in layer ? boundsKindValue(layer.boundsKind) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? boundsKindValue(metadata.boundsKind) ?? fallback;
}

export function layerRenderKind(layer: StateVisualLayer): StateRenderKind | undefined {
  const explicit = "renderKind" in layer ? renderKindValue(layer.renderKind) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? renderKindValue(metadata.renderKind);
}

export function layerVisibleOnViewport(layer: StateVisualLayer): boolean | undefined {
  const explicit = "isVisibleOnViewport" in layer ? booleanValue(layer.isVisibleOnViewport) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? booleanValue(metadata.isVisibleOnViewport);
}

export function anchorBounds(anchor: EvidenceAnchor | undefined): StateBounds | null {
  if (!anchor) return null;
  if (anchor.type === "bounds") return anchor.bounds;
  if (anchor.type === "point") return { x: anchor.x - 6, y: anchor.y - 6, width: 12, height: 12 };
  return null;
}

export function anchorBoundsKind(anchor: EvidenceAnchor | undefined, fallback: StateBoundsKind): StateBoundsKind {
  if (!anchor) return fallback;
  const explicit = anchor.type === "bounds" ? boundsKindValue(anchor.boundsKind) : undefined;
  const metadata = objectMetadata(anchor.metadata);
  return explicit ?? boundsKindValue(metadata.boundsKind) ?? fallback;
}

export function factRenderKind(fact: StateFactViewModel): StateRenderKind | undefined {
  const anchorMetadata = objectMetadata(fact.anchor?.metadata);
  const rawMetadata = objectMetadata(fact.rawValue);
  return renderKindValue(anchorMetadata.renderKind) ?? renderKindValue(rawMetadata.renderKind);
}

export function boundsForSurface(bounds: StateBounds | null, boundsKind: StateBoundsKind, metrics: StateVisualMetrics): StateBounds | null {
  if (!bounds) return null;
  if (boundsKind === metrics.surface) return bounds;
  if (boundsKind === "document" && metrics.surface === "screenshot") {
    return { ...bounds, x: bounds.x - metrics.scroll.x, y: bounds.y - metrics.scroll.y };
  }
  if (boundsKind === "screenshot" && metrics.surface === "document") {
    return { ...bounds, x: bounds.x + metrics.scroll.x, y: bounds.y + metrics.scroll.y };
  }
  return bounds;
}

export function boundsIntersectsViewport(bounds: StateBounds, boundsKind: StateBoundsKind, metrics: StateVisualMetrics): boolean {
  const surfaceBounds = boundsForSurface(bounds, boundsKind, metrics);
  if (!surfaceBounds) return false;
  return surfaceBounds.x + surfaceBounds.width > 0
    && surfaceBounds.y + surfaceBounds.height > 0
    && surfaceBounds.x < metrics.coordinate.width
    && surfaceBounds.y < metrics.coordinate.height;
}

export function documentBoundsIntersectViewport(bounds: StateBounds, metrics: StateVisualMetrics): boolean {
  const viewport = metrics.viewport;
  if (!viewport) return false;
  return bounds.x + bounds.width > viewport.x
    && bounds.y + bounds.height > viewport.y
    && bounds.x < viewport.x + viewport.width
    && bounds.y < viewport.y + viewport.height;
}

export function anchorStyle(anchor: EvidenceAnchor, metrics: StateVisualMetrics): CSSProperties | null {
  return layerBoundsStyle(boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics), metrics);
}

export function visualLayerStyle(layer: StateVisualLayer, bounds: StateBounds | null, metrics: StateVisualMetrics, selected: boolean): CSSProperties {
  const space = metrics.coordinate;
  const style = layerBoundsStyle(bounds, { ...metrics, coordinate: space });
  if (layer.kind === "region" || layer.kind === "element") return { ...style, zIndex: bboxZIndex(bounds, space.width, space.height, selected) };
  if (layer.kind === "text") return { ...style, zIndex: 20 };
  if (layer.kind === "image") return { ...style, zIndex: 1 };
  return style;
}

export function overlayStyle(anchor: EvidenceAnchor, metrics: StateVisualMetrics, selected: boolean): CSSProperties | null {
  const bounds = boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics);
  const space = metrics.coordinate;
  const style = anchorStyle(anchor, { ...metrics, coordinate: space });
  return style ? { ...style, zIndex: bboxZIndex(bounds, space.width, space.height, selected) } : null;
}

export function layerBoundsStyle(bounds: StateBounds | null, metrics: Pick<StateVisualMetrics, "coordinate">): CSSProperties {
  if (!bounds) return { left: "2%", top: "2%", maxWidth: "96%" };
  const width = metrics.coordinate.width;
  const height = metrics.coordinate.height;
  const clipped = clipBounds(bounds, width, height);
  return {
    left: `${(clipped.x / width) * 100}%`,
    top: `${(clipped.y / height) * 100}%`,
    width: `${(clipped.width / width) * 100}%`,
    height: `${(clipped.height / height) * 100}%`
  };
}

export function offsetBounds(bounds: StateBounds | null, offset: { x: number; y: number }): StateBounds | null {
  if (!bounds || (!offset.x && !offset.y)) return bounds;
  return { ...bounds, x: bounds.x + offset.x, y: bounds.y + offset.y };
}

export function bboxZIndex(bounds: StateBounds | null, frameWidth: number, frameHeight: number, selected: boolean): number {
  if (!bounds) return selected ? 101 : 100;
  const clipped = clipBounds(bounds, frameWidth, frameHeight);
  const frameArea = Math.max(1, frameWidth * frameHeight);
  const areaRatio = clampNumber((clipped.width * clipped.height) / frameArea, 0, 1);
  const inverseAreaRank = Math.round((1 - areaRatio) * 1_000_000);
  return 100 + (inverseAreaRank * 2) + (selected ? 1 : 0);
}

export function clipBounds(bounds: StateBounds, frameWidth: number, frameHeight: number): StateBounds {
  const left = clampNumber(bounds.x, 0, frameWidth);
  const top = clampNumber(bounds.y, 0, frameHeight);
  const right = clampNumber(bounds.x + Math.max(0, bounds.width), 0, frameWidth);
  const bottom = clampNumber(bounds.y + Math.max(0, bounds.height), 0, frameHeight);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function boundsEqual(left: StateBounds | null, right: StateBounds | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.width - right.width) < 0.5
    && Math.abs(left.height - right.height) < 0.5;
}

export function viewportBoundsFromFacts(facts: StateFactViewModel[]): StateBounds | undefined {
  const value = facts.find((fact) => fact.fullPath === "web.viewport.bounds")?.rawValue;
  const bounds = objectMetadata(value);
  const width = firstPositiveNumber(bounds.width);
  const height = firstPositiveNumber(bounds.height);
  if (!width || !height) return undefined;
  return {
    x: nonNegativeNumber(bounds.x),
    y: nonNegativeNumber(bounds.y),
    width,
    height
  };
}

export function viewportBoundsFromFrame(frame: NodeStateViewModel["visualFrame"]): StateBounds | undefined {
  if (!frame) return undefined;
  const metadata = objectMetadata(frame.metadata);
  const image = imageBoundsFromFrame(frame);
  const width = firstPositiveNumber(metadata.viewportWidth, image?.width, frame.coordinateSpace.width);
  const height = firstPositiveNumber(metadata.viewportHeight, image?.height, frame.coordinateSpace.height);
  if (!width || !height) return undefined;
  return { x: 0, y: 0, width, height };
}

export function imageBoundsFromFrame(frame: NodeStateViewModel["visualFrame"]): StateSize | undefined {
  const imageLayer = frame?.layers.find((layer) => layer.kind === "image");
  const bounds = imageLayer ? layerBounds(imageLayer) : null;
  const width = firstPositiveNumber(bounds?.width);
  const height = firstPositiveNumber(bounds?.height);
  return width && height ? { width, height } : undefined;
}

export function documentSizeFromFrame(frame: NodeStateViewModel["visualFrame"], facts: StateFactViewModel[], viewport: StateBounds | undefined): StateSize {
  const metadata = objectMetadata(frame?.metadata);
  const frameWidth = firstPositiveNumber(frame?.coordinateSpace.width);
  const frameHeight = firstPositiveNumber(frame?.coordinateSpace.height);
  const documentWidth = firstPositiveNumber(metadata.documentWidth, frameBoundsKind(frame) === "document" ? frameWidth : undefined);
  const documentHeight = firstPositiveNumber(metadata.documentHeight, frameBoundsKind(frame) === "document" ? frameHeight : undefined);
  const maxFactBounds = maxAnchorBounds(facts);
  return {
    width: Math.max(1, documentWidth ?? maxFactBounds?.width ?? viewport?.width ?? frameWidth ?? 1),
    height: Math.max(1, documentHeight ?? maxFactBounds?.height ?? viewport?.height ?? frameHeight ?? 1)
  };
}

export function maxAnchorBounds(facts: StateFactViewModel[]): StateSize | undefined {
  const bounds = facts.map((fact) => anchorBounds(fact.anchor)).filter((item): item is StateBounds => Boolean(item));
  if (!bounds.length) return undefined;
  return {
    width: Math.max(...bounds.map((item) => item.x + item.width)),
    height: Math.max(...bounds.map((item) => item.y + item.height))
  };
}

export function frameBoundsKind(frame: NodeStateViewModel["visualFrame"]): StateBoundsKind | undefined {
  const metadata = objectMetadata(frame?.metadata);
  const frameKind = stringMetadata(metadata.frameKind)?.toLowerCase();
  const screenCoordinateSpace = stringMetadata(metadata.screenCoordinateSpace)?.toLowerCase();
  if (frameKind?.includes("document") || screenCoordinateSpace === "document") return "document";
  if (frameKind?.includes("screenshot") || frameKind?.includes("viewport") || screenCoordinateSpace === "viewport") return "screenshot";
  return undefined;
}

export function boundsKindValue(value: unknown): StateBoundsKind | undefined {
  return value === "screenshot" || value === "document" ? value : undefined;
}

export function renderKindValue(value: unknown): StateRenderKind | undefined {
  return value === "screenshot-bbox" || value === "direct-rendered" ? value : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function firstPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function nonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
