import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { EvidenceAnchor, StateVisualLayer } from "fluxiq/automation-studio";
import type { NodeStateViewModel, StateFactViewModel, StateOverlayViewModel } from "./model/types";
import type { DirectRenderedTextCandidate, StateBounds, StateVisualMetrics, StateVisualSurfaceMode } from "./state-visual-types";
import { anchorBounds, anchorBoundsKind, bboxZIndex, boundsEqual, boundsForSurface, boundsIntersectsViewport, documentBoundsIntersectViewport, factRenderKind, firstPositiveNumber, layerBounds, layerBoundsKind, layerBoundsStyle, layerRenderKind, layerVisibleOnViewport, overlayStyle, visualFrameMetrics, visualLayerStyle } from "./state-geometry";
import { directRenderedFactCandidateId, directRenderedFactContent, directRenderedLayerCandidateId, directRenderedLayerContent, directRenderedTextCandidates, directRenderedTextStyle, shouldRenderDirectText } from "./state-text-layout";
import { layerStatePath, objectMetadata, stringMetadata, visualToneForLayer, visualToneFromFact } from "./state-visual-classification";
import { StateStructuredPanel } from "./StateStructuredPanel";
import { boundedStateItems, stateLayerImageSrc } from "./state-canvas-model";
import { StateCanvasSurfaceControls, StateCanvasZoomControls } from "./StateSurfaceControls";

const stateVisualItemLimit = 200;

export function StateVisualCanvas(props: { model: NodeStateViewModel; selectedFactPath: string | undefined; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const frame = props.model.visualFrame;
  const surfaces = visualCanvasSurfaces(props.model);
  const [surface, setSurface] = useState<StateVisualSurfaceMode | null>(() => visualCanvasSurface(props.model));
  const activeSurface = surface && surfaces.includes(surface) ? surface : surfaces[0] ?? null;
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    setSurface(visualCanvasSurface(props.model));
    setZoom(1);
  }, [props.model.activeSource?.id, props.model.activePhase]);

  if (!activeSurface) {
    return (
      <div className="automation-state-visual-fallback">
        <div><ImageIcon size={16} aria-hidden /><strong>No visual frame exists</strong><span>This state source has structured facts, but no importer-provided visual reconstruction.</span></div>
        <StateStructuredPanel rows={props.model.structuredRows} onSelectFact={props.onSelectFact} />
      </div>
    );
  }
  const metrics = visualFrameMetrics(frame, props.model.facts, activeSurface);
  const selectedBounds = selectedVisualBounds(props.model, props.selectedFactPath, metrics);
  const allVisibleLayers = frame ? visualLayersForSurface(frame, activeSurface) : [];
  const hasImageLayer = allVisibleLayers.some((layer) => layer.kind === "image");
  const visibleLayers = boundedStateItems(allVisibleLayers, (layer) => layer.kind === "image" || layerStatePath(layer) === props.selectedFactPath, stateVisualItemLimit);
  const layerPaths = new Set(allVisibleLayers.map(layerStatePath).filter((path): path is string => Boolean(path)));
  const allFactLayers = factBoundsForSurface(props.model.facts, activeSurface, metrics, hasImageLayer).filter((fact) => !layerPaths.has(fact.fact.fullPath));
  const factLayers = boundedStateItems(allFactLayers, (item) => item.fact.fullPath === props.selectedFactPath, stateVisualItemLimit);
  const overlays = boundedStateItems(props.model.overlays, (overlay) => overlay.selected === true || overlay.factPath === props.selectedFactPath, stateVisualItemLimit);
  const hiddenVisualItems = allVisibleLayers.length + allFactLayers.length + props.model.overlays.length - visibleLayers.length - factLayers.length - overlays.length;
  const directTextCandidates = directRenderedTextCandidates(visibleLayers, factLayers, props.model.facts, metrics);
  return (
    <div className="automation-state-canvas-shell">
      <div className="automation-state-canvas-scroll">
        <div className={`automation-state-canvas surface-${activeSurface}`} style={{ aspectRatio: `${metrics.aspect.width} / ${metrics.aspect.height}`, width: `${zoom * 100}%` }}>
          {activeSurface === "document" && metrics.viewport && !hasImageLayer ? <StateViewportRect metrics={metrics} /> : null}
          {visibleLayers.map((layer, index) => <StateVisualLayerView directTextCandidates={directTextCandidates} facts={props.model.facts} key={stateVisualChildKey("layer", layer.id, index)} layer={layer} metrics={metrics} selectedBounds={selectedBounds} selectedFactPath={props.selectedFactPath} onSelectFact={props.onSelectFact} />)}
          {factLayers.map(({ fact, bounds, directRendered }, index) => <StateFactBoundsLayer bounds={bounds} directRendered={directRendered} directTextCandidates={directTextCandidates} fact={fact} key={stateVisualChildKey("fact", fact.id, index)} metrics={metrics} selected={fact.fullPath === props.selectedFactPath || boundsEqual(bounds, selectedBounds)} onSelectFact={props.onSelectFact} />)}
          {overlays.map((overlay, index) => <StateOverlay key={stateVisualChildKey("overlay", overlay.id, index)} metrics={metrics} overlay={overlay} onSelectEvidence={props.onSelectEvidence} onSelectFact={props.onSelectFact} />)}
        </div>
      </div>
      {hiddenVisualItems > 0 ? <span className="automation-state-visual-limit" role="status">Showing {visibleLayers.length + factLayers.length + overlays.length} visual items. {hiddenVisualItems} more remain available in Structured state.</span> : null}
      {surfaces.length > 1 ? <StateCanvasSurfaceControls surface={activeSurface} onSurface={setSurface} /> : null}
      <StateCanvasZoomControls zoom={zoom} onZoomChange={setZoom} />
    </div>
  );
}

export function StateVisualLayerView(props: { layer: StateVisualLayer; facts: StateFactViewModel[]; metrics: StateVisualMetrics; selectedFactPath: string | undefined; selectedBounds: StateBounds | null; directTextCandidates: DirectRenderedTextCandidate[]; onSelectFact(path: string): void }) {
  const bounds = props.layer.kind === "image"
    ? imageLayerBoundsForSurface(props.layer, props.metrics)
    : boundsForSurface(layerBounds(props.layer), layerBoundsKind(props.layer, props.metrics.surface), props.metrics);
  const statePath = layerStatePath(props.layer);
  const selected = (statePath !== undefined && statePath === props.selectedFactPath) || boundsEqual(bounds, props.selectedBounds);
  const style = visualLayerStyle(props.layer, bounds, props.metrics, selected);
  if (props.layer.kind === "image") {
    const imageSrc = stateLayerImageSrc(props.layer.contentRef);
    return imageSrc
      ? <StateImageLayer contentRef={props.layer.contentRef} imageSrc={imageSrc} opacity={props.layer.opacity ?? 1} style={style} />
      : <div className="automation-state-layer automation-state-layer-placeholder" style={style}><ImageIcon size={16} aria-hidden /><span>{props.layer.contentRef}</span></div>;
  }
  if (props.layer.kind === "text") return <div className={`automation-state-layer automation-state-layer-text tone-${props.layer.style?.tone ?? "default"} size-${props.layer.style?.size ?? "sm"}`} style={style}>{props.layer.content}</div>;
  if (props.layer.kind === "region" || props.layer.kind === "element") {
    const directRendered = layerRenderKind(props.layer) === "direct-rendered";
    const rawContent = directRendered ? directRenderedLayerContent(props.layer, props.facts) : undefined;
    const content = rawContent && shouldRenderDirectText(directRenderedLayerCandidateId(props.layer), bounds, rawContent, props.directTextCandidates) ? rawContent : undefined;
    const className = `automation-state-layer automation-state-layer-${props.layer.kind} visual-${visualToneForLayer(props.layer)}${directRendered ? " direct-rendered" : ""}${selected ? " selected" : ""}${statePath ? " interactive" : ""}`;
    const directStyle = content ? directRenderedTextStyle(style, bounds, content) : style;
    if (statePath) {
      return (
        <button
          aria-label={props.layer.label ?? statePath}
          className={className}
          onClick={() => props.onSelectFact(statePath)}
          onKeyDown={(event) => handleStateLayerKeyDown(event, () => props.onSelectFact(statePath))}
          style={directStyle}
          title={props.layer.label ?? statePath}
          type="button"
        >
          {content ? <span>{content}</span> : null}
        </button>
      );
    }
    return <div aria-label={props.layer.label} className={className} style={directStyle} title={props.layer.label}>{content ? <span>{content}</span> : null}</div>;
  }
  return null;
}

export function StateFactBoundsLayer(props: { fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean; metrics: StateVisualMetrics; selected: boolean; directTextCandidates: DirectRenderedTextCandidate[]; onSelectFact(path: string): void }) {
  const rawContent = props.directRendered ? directRenderedFactContent(props.fact) : undefined;
  const content = rawContent && shouldRenderDirectText(directRenderedFactCandidateId(props.fact), props.bounds, rawContent, props.directTextCandidates) ? rawContent : undefined;
  const style = {
    ...layerBoundsStyle(props.bounds, props.metrics),
    zIndex: bboxZIndex(props.bounds, props.metrics.coordinate.width, props.metrics.coordinate.height, props.selected)
  };
  const fittedStyle = content ? directRenderedTextStyle(style, props.bounds, content) : style;
  return (
    <button
      aria-label={props.fact.label}
      className={`automation-state-layer automation-state-layer-element visual-${visualToneFromFact(props.fact)}${props.directRendered ? " direct-rendered" : ""}${props.selected ? " selected" : ""} interactive`}
      onClick={() => props.onSelectFact(props.fact.fullPath)}
      onKeyDown={(event) => handleStateLayerKeyDown(event, () => props.onSelectFact(props.fact.fullPath))}
      style={fittedStyle}
      title={props.fact.label}
      type="button"
    >
      {content ? <span>{content}</span> : null}
    </button>
  );
}

export function StateViewportRect(props: { metrics: StateVisualMetrics }) {
  const viewport = props.metrics.viewport;
  if (!viewport) return null;
  return <div aria-label="Current viewport" className="automation-state-viewport-rect" style={{ ...layerBoundsStyle(viewport, props.metrics), zIndex: 30 }} title="Current viewport" />;
}

export function StateImageLayer(props: { contentRef: string; imageSrc: string; opacity: number; style: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="automation-state-layer automation-state-layer-placeholder" style={props.style}>
        <ImageIcon size={16} aria-hidden />
        <span>Image failed to load: {props.imageSrc || props.contentRef}</span>
      </div>
    );
  }
  return <img alt="" className="automation-state-layer automation-state-layer-image" onError={() => setFailed(true)} src={props.imageSrc} style={{ ...props.style, opacity: props.opacity }} />;
}

export function StateOverlay(props: { overlay: StateOverlayViewModel; metrics: StateVisualMetrics; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const style = overlayStyle(props.overlay.anchor, props.metrics, props.overlay.selected === true);
  if (!style) return null;
  const label = props.overlay.confidence === undefined ? props.overlay.label : `${props.overlay.label} (${Math.round(props.overlay.confidence * 100)}%)`;
  const actionTarget = props.overlay.tone === "action-target";
  return (
    <button
      aria-label={label}
      className={`automation-state-overlay tone-${props.overlay.tone} visual-${props.overlay.visualTone ?? "unknown"}${props.overlay.selected ? " selected" : ""}`}
      onClick={() => props.overlay.evidenceId ? props.onSelectEvidence(props.overlay.evidenceId) : props.overlay.factPath ? props.onSelectFact(props.overlay.factPath) : undefined}
      style={style}
      title={label}
      type="button"
    >
      {actionTarget ? <>
        <span className="automation-state-overlay-tag">Interacted</span>
        <span className="automation-state-overlay-corner top-left" aria-hidden />
        <span className="automation-state-overlay-corner top-right" aria-hidden />
        <span className="automation-state-overlay-corner bottom-right" aria-hidden />
        <span className="automation-state-overlay-corner bottom-left" aria-hidden />
      </> : null}
    </button>
  );
}

export function handleStateLayerKeyDown(event: KeyboardEvent<HTMLButtonElement>, action: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

export function visualCanvasSurfaces(model: NodeStateViewModel): StateVisualSurfaceMode[] {
  return [...(hasDocumentSurface(model) ? ["document" as const] : []), ...(hasScreenshotSurface(model.visualFrame) ? ["screenshot" as const] : [])];
}

export function visualCanvasSurface(model: NodeStateViewModel): StateVisualSurfaceMode | null {
  return visualCanvasSurfaces(model)[0] ?? null;
}

export function hasScreenshotSurface(frame: NodeStateViewModel["visualFrame"]): boolean {
  return Boolean(frame?.layers.some((layer) => layer.kind === "image" || layerBoundsKind(layer, "screenshot") === "screenshot"));
}

export function hasDocumentSurface(model: NodeStateViewModel): boolean {
  if (model.visualFrame?.layers.some((layer) => layer.kind !== "image" && (layerBoundsKind(layer, "screenshot") === "document" || layerRenderKind(layer) === "direct-rendered"))) return true;
  if (model.facts.some((fact) => anchorBounds(fact.anchor) && anchorBoundsKind(fact.anchor, "screenshot") === "document")) return true;
  const metadata = objectMetadata(model.visualFrame?.metadata);
  return Boolean(firstPositiveNumber(metadata.documentWidth) && firstPositiveNumber(metadata.documentHeight));
}

export function visualLayersForSurface(frame: NonNullable<NodeStateViewModel["visualFrame"]>, surface: StateVisualSurfaceMode): StateVisualLayer[] {
  return frame.layers.filter((layer) => {
    if (layer.kind === "image") return true;
    const renderKind = layerRenderKind(layer);
    const boundsKind = layerBoundsKind(layer, surface);
    if (surface === "screenshot") return boundsKind === "screenshot" && renderKind !== "direct-rendered" && layerVisibleOnViewport(layer) !== false;
    return boundsKind === "document" || boundsKind === "screenshot" || renderKind === "direct-rendered";
  });
}

export function factBoundsForSurface(facts: StateFactViewModel[], surface: StateVisualSurfaceMode, metrics: StateVisualMetrics, hasImageLayer: boolean): Array<{ fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean }> {
  return facts.flatMap((fact) => {
    const rawBounds = anchorBounds(fact.anchor);
    if (!rawBounds) return [];
    const boundsKind = anchorBoundsKind(fact.anchor, surface);
    if (surface === "screenshot" && boundsKind !== "screenshot" && !boundsIntersectsViewport(rawBounds, boundsKind, metrics)) return [];
    const bounds = boundsForSurface(rawBounds, boundsKind, metrics);
    const outsideScreenshot = surface === "document" && boundsKind === "document" && (!hasImageLayer || !documentBoundsIntersectViewport(rawBounds, metrics));
    const directRendered = factRenderKind(fact) === "direct-rendered" || outsideScreenshot;
    return bounds ? [{ fact, bounds, directRendered }] : [];
  });
}

export function selectedVisualBounds(model: NodeStateViewModel, selectedFactPath: string | undefined, metrics: StateVisualMetrics): StateBounds | null {
  if (!selectedFactPath) return null;
  const selectedOverlay = model.overlays.find((overlay) => overlay.selected || overlay.factPath === selectedFactPath);
  const overlayBounds = boundsForSurface(anchorBounds(selectedOverlay?.anchor), anchorBoundsKind(selectedOverlay?.anchor, metrics.surface), metrics);
  if (overlayBounds) return overlayBounds;
  const anchor = model.facts.find((fact) => fact.fullPath === selectedFactPath)?.anchor;
  return boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics);
}

export function imageLayerBoundsForSurface(layer: StateVisualLayer, metrics: StateVisualMetrics): StateBounds | null {
  const bounds = layerBounds(layer) ?? { x: 0, y: 0, width: metrics.image.width, height: metrics.image.height };
  return boundsForSurface(bounds, layerBoundsKind(layer, "screenshot"), metrics);
}

export function stateVisualChildKey(kind: string, id: string, index: number): string {
  return `${kind}:${id}:${index}`;
}
