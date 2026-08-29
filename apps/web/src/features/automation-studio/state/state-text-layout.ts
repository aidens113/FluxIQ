import type { CSSProperties } from "react";
import type { StateVisualLayer } from "fluxiq/automation-studio";
import type { StateFactViewModel } from "./model/types";
import type { DirectRenderedTextCandidate, StateBounds, StateVisualMetrics } from "./state-visual-types";
import { boundsForSurface, clampNumber, layerBounds, layerBoundsKind, layerRenderKind } from "./state-geometry";
import { layerStatePath, objectMetadata } from "./state-visual-classification";

export function directRenderedTextStyle(style: CSSProperties, bounds: StateBounds | null, content: string): CSSProperties {
  const fit = fittedTextStyle(bounds, content);
  return {
    ...style,
    "--state-direct-fit-width": fit.fitWidth,
    "--state-direct-fit-height": fit.fitHeight,
    "--state-direct-line-height": fit.lineHeight.toFixed(2),
    "--state-direct-padding-x": `${fit.paddingX}px`
  } as CSSProperties;
}

export function fittedTextStyle(bounds: StateBounds | null, content: string): { fitWidth: string; fitHeight: string; lineHeight: number; paddingX: number } {
  if (!bounds) return { fitWidth: "10px", fitHeight: "80cqh", lineHeight: 1.15, paddingX: 4 };
  const textLength = Math.max(1, content.trim().length);
  const lineHeight = bounds.height < 14 ? 1 : 1.12;
  const fitPercent = clampNumber(Math.sqrt(10000 / (textLength * 0.62 * lineHeight)), 3, 36);
  return {
    fitWidth: `${fitPercent.toFixed(3)}cqw`,
    fitHeight: bounds.height < 12 ? "72cqh" : bounds.height < 28 ? "48cqh" : "34cqh",
    lineHeight,
    paddingX: bounds.width < 16 ? 1 : bounds.width < 32 ? 2 : 5
  };
}

export function directRenderedTextCandidates(layers: StateVisualLayer[], factLayers: Array<{ fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean }>, facts: StateFactViewModel[], metrics: StateVisualMetrics): DirectRenderedTextCandidate[] {
  const layerCandidates = layers.flatMap((layer): DirectRenderedTextCandidate[] => {
    if (layer.kind !== "region" && layer.kind !== "element") return [];
    if (layerRenderKind(layer) !== "direct-rendered") return [];
    const bounds = boundsForSurface(layerBounds(layer), layerBoundsKind(layer, metrics.surface), metrics);
    const content = directRenderedLayerContent(layer, facts);
    return bounds && content ? [directRenderedTextCandidate(directRenderedLayerCandidateId(layer), bounds, content)] : [];
  });
  const factCandidates = factLayers.flatMap(({ fact, bounds, directRendered }): DirectRenderedTextCandidate[] => {
    if (!directRendered) return [];
    const content = directRenderedFactContent(fact);
    return content ? [directRenderedTextCandidate(directRenderedFactCandidateId(fact), bounds, content)] : [];
  });
  return [...layerCandidates, ...factCandidates];
}

export function directRenderedTextCandidate(id: string, bounds: StateBounds, content: string): DirectRenderedTextCandidate {
  return { id, bounds, content, area: Math.max(0, bounds.width) * Math.max(0, bounds.height) };
}

export function directRenderedLayerCandidateId(layer: StateVisualLayer): string {
  return `layer:${layer.id}:${layerStatePath(layer) ?? ""}`;
}

export function directRenderedFactCandidateId(fact: StateFactViewModel): string {
  return `fact:${fact.fullPath}`;
}

export function shouldRenderDirectText(id: string, bounds: StateBounds | null, content: string, candidates: DirectRenderedTextCandidate[]): boolean {
  if (!bounds) return true;
  const area = Math.max(0, bounds.width) * Math.max(0, bounds.height);
  return !candidates.some((candidate) =>
    candidate.id !== id
    && candidate.area < area
    && boundsContains(bounds, candidate.bounds)
    && directTextOverlaps(content, candidate.content)
  );
}

export function boundsContains(parent: StateBounds, child: StateBounds): boolean {
  const tolerance = 1;
  return child.x >= parent.x - tolerance
    && child.y >= parent.y - tolerance
    && child.x + child.width <= parent.x + parent.width + tolerance
    && child.y + child.height <= parent.y + parent.height + tolerance;
}

export function directTextOverlaps(parent: string, child: string): boolean {
  const left = normalizeDirectText(parent);
  const right = normalizeDirectText(child);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function normalizeDirectText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function directRenderedLayerContent(layer: StateVisualLayer, facts: StateFactViewModel[]): string | undefined {
  if (layer.kind !== "region" && layer.kind !== "element") return undefined;
  const metadata = objectMetadata(layer.metadata);
  const fact = layerStatePath(layer) ? facts.find((item) => item.fullPath === layerStatePath(layer)) : undefined;
  return firstDisplayString(
    metadata.text,
    metadata.content,
    metadata.value,
    metadata.label,
    metadata.name,
    metadata.ariaLabel,
    metadata["aria-label"],
    metadata.title,
    metadata.placeholder,
    fact ? directRenderedFactContent(fact) : undefined,
    layer.label
  );
}

export function directRenderedFactContent(fact: StateFactViewModel): string {
  const raw = objectMetadata(fact.rawValue);
  return firstDisplayString(
    raw.text,
    raw.content,
    raw.value,
    raw.label,
    raw.name,
    raw.ariaLabel,
    raw["aria-label"],
    raw.title,
    raw.placeholder,
    typeof fact.rawValue === "string" || typeof fact.rawValue === "number" ? fact.rawValue : undefined,
    fact.label
  ) ?? fact.label;
}

export function firstDisplayString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    if (text) return text;
  }
  return undefined;
}
