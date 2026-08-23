"use client";

import { AlertCircle, ImageIcon, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { EvidenceAnchor, NodeStatePhase, StateVisualLayer } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../types";
import { buildNodeStateViewModel, type BuildNodeStateViewModelInput, type NodeStateViewModel, type StateFactViewModel, type StateOverlayViewModel, type StateVisualTone } from "../state/view-model";

export type StateViewMode = "visual" | "structured" | "diff" | "compare" | "raw";
type StateVisualSurfaceMode = "screenshot" | "document";
type StateBoundsKind = "screenshot" | "document";
type StateRenderKind = "screenshot-bbox" | "direct-rendered";
type StateBounds = { x: number; y: number; width: number; height: number };
type StateSize = Pick<StateBounds, "width" | "height">;
type StateVisualMetrics = { surface: StateVisualSurfaceMode; coordinate: StateSize; image: StateSize; aspect: StateSize; scroll: { x: number; y: number }; viewport?: StateBounds | undefined };
type DirectRenderedTextCandidate = { id: string; bounds: StateBounds; content: string; area: number };
const stateCanvasZoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export function AutomationStateView(props: { input: BuildNodeStateViewModelInput; loading?: { recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; phase?: NodeStatePhase } | null | undefined; setSelection(selection: AutomationSelection): void }) {
  const initialSelection = stateSelection(props.input.selection);
  const [sourceId, setSourceId] = useState<string | undefined>(initialSelection.sourceId);
  const [phase, setPhase] = useState<NodeStatePhase>(initialSelection.phase ?? "input");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | undefined>(initialSelection.evidenceId);
  const [selectedFactPath, setSelectedFactPath] = useState<string | undefined>(initialSelection.factPath);
  const selectionKey = stateSelectionKey(props.input.selection);

  useEffect(() => {
    const nextSelection = stateSelection(props.input.selection);
    setSourceId(nextSelection.sourceId);
    setPhase(nextSelection.phase ?? "input");
    setSelectedEvidenceId(nextSelection.evidenceId);
    setSelectedFactPath(nextSelection.factPath);
  }, [selectionKey, props.input.selection]);

  const viewState = compactStateViewState({
    sourceId,
    stateSnapshotId: initialSelection.stateSnapshotId,
    phase,
    selectedEvidenceId,
    selectedFactPath
  });
  const model = useMemo(() => buildNodeStateViewModel({
    ...props.input,
    viewState
  }), [props.input, viewState]);
  const resolvedSourceId = model.activeSource?.id ?? sourceId;

  function selectEvidence(id: string) {
    const evidence = model.evidence.find((item) => item.id === id);
    setSelectedEvidenceId(id);
    if (evidence?.factPath) setSelectedFactPath(evidence.factPath);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ evidenceId: id, factPath: evidence?.factPath, sourceId: resolvedSourceId, phase })));
  }

  function selectFact(path: string) {
    setSelectedEvidenceId(undefined);
    setSelectedFactPath(path);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ factPath: path, sourceId: resolvedSourceId, phase })));
  }

  return (
    <section className="automation-state-view">
      {model.emptyState ? <div className="automation-state-empty"><AlertCircle size={16} aria-hidden /><strong>{model.emptyState.title}</strong><span>{model.emptyState.message}</span></div> : null}
      <div className="automation-state-workspace">
        <main className="automation-state-primary">
          <StateVisualCanvas model={model} selectedFactPath={selectedFactPath} onSelectEvidence={selectEvidence} onSelectFact={selectFact} />
          {props.loading ? <div className="automation-state-loading" role="status" aria-live="polite">
            <div>
              <span className="automation-state-loading-spinner" aria-hidden />
              <strong>Opening state</strong>
              <small>{props.loading.timelineEntryId ? `Loading state for ${props.loading.timelineEntryId}` : "Loading state data"}</small>
            </div>
          </div> : null}
        </main>
      </div>
    </section>
  );
}

function StateVisualCanvas(props: { model: NodeStateViewModel; selectedFactPath: string | undefined; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const frame = props.model.visualFrame;
  const activeSurface = visualCanvasSurface(props.model);
  const [zoom, setZoom] = useState(1);

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
  const visibleLayers = frame ? visualLayersForSurface(frame, activeSurface) : [];
  const hasImageLayer = visibleLayers.some((layer) => layer.kind === "image");
  const layerPaths = new Set(visibleLayers.map(layerStatePath).filter((path): path is string => Boolean(path)));
  const factLayers = factBoundsForSurface(props.model.facts, activeSurface, metrics, hasImageLayer).filter((fact) => !layerPaths.has(fact.fact.fullPath));
  const directTextCandidates = directRenderedTextCandidates(visibleLayers, factLayers, props.model.facts, metrics);
  return (
    <div className="automation-state-canvas-shell">
      <div className="automation-state-canvas-scroll">
        <div className={`automation-state-canvas surface-${activeSurface}`} style={{ aspectRatio: `${metrics.aspect.width} / ${metrics.aspect.height}`, width: `${zoom * 100}%` }}>
          {activeSurface === "document" && metrics.viewport && !hasImageLayer ? <StateViewportRect metrics={metrics} /> : null}
          {visibleLayers.map((layer, index) => <StateVisualLayerView directTextCandidates={directTextCandidates} facts={props.model.facts} key={stateVisualChildKey("layer", layer.id, index)} layer={layer} metrics={metrics} selectedBounds={selectedBounds} selectedFactPath={props.selectedFactPath} onSelectFact={props.onSelectFact} />)}
          {factLayers.map(({ fact, bounds, directRendered }, index) => <StateFactBoundsLayer bounds={bounds} directRendered={directRendered} directTextCandidates={directTextCandidates} fact={fact} key={stateVisualChildKey("fact", fact.id, index)} metrics={metrics} selected={fact.fullPath === props.selectedFactPath || boundsEqual(bounds, selectedBounds)} onSelectFact={props.onSelectFact} />)}
          {props.model.overlays.map((overlay, index) => <StateOverlay key={stateVisualChildKey("overlay", overlay.id, index)} metrics={metrics} overlay={overlay} onSelectEvidence={props.onSelectEvidence} onSelectFact={props.onSelectFact} />)}
        </div>
      </div>
      <StateCanvasZoomControls zoom={zoom} onZoomChange={setZoom} />
    </div>
  );
}

function StateCanvasZoomControls(props: { zoom: number; onZoomChange(zoom: number): void }) {
  const zoomIndex = nearestZoomIndex(props.zoom);
  return (
    <div className="automation-state-zoom-controls" aria-label="Canvas zoom controls">
      <button disabled={zoomIndex <= 0} onClick={() => props.onZoomChange(stateCanvasZoomLevels[Math.max(0, zoomIndex - 1)]!)} title="Zoom out" type="button"><ZoomOut size={14} aria-hidden /></button>
      <span aria-label="Canvas zoom">{Math.round(props.zoom * 100)}%</span>
      <button disabled={zoomIndex >= stateCanvasZoomLevels.length - 1} onClick={() => props.onZoomChange(stateCanvasZoomLevels[Math.min(stateCanvasZoomLevels.length - 1, zoomIndex + 1)]!)} title="Zoom in" type="button"><ZoomIn size={14} aria-hidden /></button>
      <button disabled={props.zoom === 1} onClick={() => props.onZoomChange(1)} title="Reset zoom" type="button"><RotateCcw size={14} aria-hidden /></button>
    </div>
  );
}

function StateVisualLayerView(props: { layer: StateVisualLayer; facts: StateFactViewModel[]; metrics: StateVisualMetrics; selectedFactPath: string | undefined; selectedBounds: StateBounds | null; directTextCandidates: DirectRenderedTextCandidate[]; onSelectFact(path: string): void }) {
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

function StateFactBoundsLayer(props: { fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean; metrics: StateVisualMetrics; selected: boolean; directTextCandidates: DirectRenderedTextCandidate[]; onSelectFact(path: string): void }) {
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

function StateViewportRect(props: { metrics: StateVisualMetrics }) {
  const viewport = props.metrics.viewport;
  if (!viewport) return null;
  return <div aria-label="Current viewport" className="automation-state-viewport-rect" style={{ ...layerBoundsStyle(viewport, props.metrics), zIndex: 30 }} title="Current viewport" />;
}

function StateImageLayer(props: { contentRef: string; imageSrc: string; opacity: number; style: CSSProperties }) {
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

function StateOverlay(props: { overlay: StateOverlayViewModel; metrics: StateVisualMetrics; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
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

function visualFrameMetrics(frame: NodeStateViewModel["visualFrame"], facts: StateFactViewModel[] = [], surface: StateVisualSurfaceMode): StateVisualMetrics {
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

function layerStatePath(layer: StateVisualLayer): string | undefined {
  if (layer.kind !== "region" && layer.kind !== "element") return undefined;
  const statePath = typeof layer.statePath === "string" && layer.statePath.trim() ? layer.statePath.trim() : undefined;
  if (statePath) return statePath;
  const metadata = objectMetadata(layer.metadata);
  return stringMetadata(metadata.statePath) ?? stringMetadata(metadata.factPath);
}

function handleStateLayerKeyDown(event: KeyboardEvent<HTMLButtonElement>, action: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function StateStructuredPanel(props: { rows: NodeStateViewModel["structuredRows"]; onSelectFact(path: string): void }) {
  return (
    <div className="automation-state-table-wrap">
      <table className="automation-state-table">
        <thead><tr><th>Namespace</th><th>Path</th><th>Value</th><th>Confidence</th><th>Source</th></tr></thead>
        <tbody>
          {props.rows.map((row) => <tr key={row.id} onClick={() => props.onSelectFact(`${row.namespace}.${row.path}`)}><td>{row.namespace}</td><td>{row.label}</td><td>{row.value}</td><td>{row.confidence ?? "-"}</td><td>{row.source ?? row.type ?? "-"}</td></tr>)}
          {!props.rows.length ? <tr><td colSpan={5}>No structured state facts are available.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function StateDiffPanel(props: { model: NodeStateViewModel }) {
  return (
    <div className="automation-state-diff-list">
      {props.model.diffRows.map((row) => <div key={row.id}><strong>{row.path}</strong><span>{row.change}</span><code>{row.before} {"->"} {row.after}</code>{row.confidence ? <small>{row.confidence}</small> : null}</div>)}
      {!props.model.diffRows.length ? <div><strong>No diff rows</strong><span>This source has no before/after state deltas yet.</span></div> : null}
    </div>
  );
}

function StateComparePanel(props: { model: NodeStateViewModel; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const comparison = props.model.runtimeComparison;
  if (!comparison) return <div className="automation-state-compare-list"><div><strong>No runtime comparison</strong><span>Select runtime actual output to compare expected facts with the current state.</span></div></div>;
  return (
    <div className="automation-state-compare-list">
      <header>
        <strong>Expected vs Actual</strong>
        <span>{comparison.matches.length} matched | {comparison.mismatches.length} failed | {comparison.irrelevant.length} irrelevant</span>
      </header>
      {comparison.rows.map((row) => (
        <button className={`status-${row.status}`} key={row.id} onClick={() => row.evidenceId ? props.onSelectEvidence(row.evidenceId) : props.onSelectFact(row.factPath)} type="button">
          <strong>{row.label}</strong>
          <span>{row.status === "mismatch" ? "Mismatch" : row.status === "match" ? "Match" : "Irrelevant"}</span>
          <code>{row.expected} {"->"} {row.actual}</code>
          {row.severity || row.score !== undefined ? <small>{row.severity ?? `score ${row.score?.toFixed(2)}`}</small> : null}
        </button>
      ))}
      {!comparison.rows.length ? <div><strong>No comparable facts</strong><span>The runtime source has no expected or actual facts to compare.</span></div> : null}
    </div>
  );
}

function StateRawPanel(props: { model: NodeStateViewModel }) {
  const [expanded, setExpanded] = useState(false);
  if (!expanded) {
    return (
      <div className="automation-state-raw-placeholder">
        <button type="button" onClick={() => setExpanded(true)}>Show raw JSON</button>
      </div>
    );
  }
  return <pre className="automation-state-raw">{JSON.stringify(props.model.raw, null, 2)}</pre>;
}

function stateSelection(selection: AutomationSelection | null): { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string; stateRef?: string } {
  if (selection?.kind !== "state") return {};
  return compactStateSelection({
    sourceId: selection.sourceId,
    phase: selection.phase,
    evidenceId: selection.evidenceId,
    factPath: selection.factPath,
    recordingId: selection.recordingId,
    proposalId: selection.proposalId,
    timelineEntryId: selection.timelineEntryId,
    stateSnapshotId: selection.stateSnapshotId,
    stateRef: selection.stateRef
  });
}

function stateSelectionKey(selection: AutomationSelection | null): string {
  if (selection?.kind !== "state") return `${selection?.kind ?? "none"}:${selection?.id ?? ""}`;
  return [
    selection.kind,
    selection.id,
    selection.nodeId ?? "",
    selection.sourceId ?? "",
    selection.phase ?? "",
    selection.evidenceId ?? "",
    selection.factPath ?? "",
    selection.recordingId ?? "",
    selection.proposalId ?? "",
    selection.timelineEntryId ?? "",
    selection.stateSnapshotId ?? "",
    selection.stateRef ?? ""
  ].join("|");
}

function stateAutomationSelection(model: NodeStateViewModel, input: BuildNodeStateViewModelInput, next: { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string }): AutomationSelection {
  const nodeId = inputNodeId(input) ?? (model.activeSource?.kind === "learned" ? model.activeSource.nodeId : undefined);
  const sourceId = next.sourceId ?? model.activeSource?.id;
  const recordingId = inputSelectionRecordingId(input) ?? (model.activeSource?.kind === "observed" ? model.activeSource.recordingId : undefined);
  const proposalId = inputSelectionProposalId(input);
  return {
    kind: "state",
    id: `state:${nodeId ?? model.activeSource?.id ?? "workspace"}`,
    ...(nodeId ? { nodeId } : {}),
    ...(sourceId ? { sourceId } : {}),
    phase: next.phase ?? model.activePhase,
    ...(next.evidenceId ? { evidenceId: next.evidenceId } : {}),
    ...(next.factPath ? { factPath: next.factPath } : {}),
    ...(recordingId ? { recordingId } : {}),
    ...(proposalId ? { proposalId } : {}),
    ...(input.selection?.kind === "state" && input.selection.timelineEntryId ? { timelineEntryId: input.selection.timelineEntryId } : {}),
    ...(input.selection?.kind === "state" && input.selection.stateSnapshotId ? { stateSnapshotId: input.selection.stateSnapshotId } : {}),
    ...(input.selection?.kind === "state" && input.selection.stateRef ? { stateRef: input.selection.stateRef } : {})
  };
}

function inputSelectionProposalId(input: BuildNodeStateViewModelInput): string | undefined {
  if (input.selection?.kind === "proposal") return input.selection.id;
  if (input.selection?.kind === "proposal-step" || input.selection?.kind === "state") return input.selection.proposalId;
  if (input.selection?.kind === "editor-node") return stringMetadata(objectMetadata(input.selection.node.metadata).proposalId);
  return stringMetadata(objectMetadata(input.selectedProposal).proposalId);
}

function inputSelectionRecordingId(input: BuildNodeStateViewModelInput): string | undefined {
  if (input.selection?.kind === "recording") return input.selection.id;
  if (input.selection?.kind === "proposal" || input.selection?.kind === "proposal-step" || input.selection?.kind === "state") return input.selection.recordingId;
  if (input.selection?.kind === "editor-node") return stringMetadata(objectMetadata(input.selection.node.metadata).recordingId);
  return stringMetadata(objectMetadata(input.selectedRecording).recordingId)
    ?? stringMetadata(objectMetadata(input.selectedProposal).recordingId)
    ?? stringMetadata(objectMetadata(objectMetadata(input.selectedProposal).metadata).recordingId);
}

function inputNodeId(input: BuildNodeStateViewModelInput): string | undefined {
  const selected = input.selection;
  if (selected?.kind === "node" || selected?.kind === "editor-node") return selected.id;
  if (selected?.kind === "state") return selected.nodeId;
  const node = input.selectedNode;
  if (node && typeof node === "object" && !Array.isArray(node) && typeof (node as { id?: unknown }).id === "string") return (node as { id: string }).id;
  return undefined;
}

function stateLayerImageSrc(contentRef: string): string {
  if (contentRef.startsWith("/api/")) return contentRef;
  const match = /^automation-object:\/\/project\/([^/]+)\/([a-f0-9]{64})$/i.exec(contentRef.trim());
  return match ? `/api/programs/automation-studio/state-assets/${encodeURIComponent(decodeURIComponent(match[1]!))}/${match[2]!.toLowerCase()}` : "";
}

function visualCanvasSurface(model: NodeStateViewModel): StateVisualSurfaceMode | null {
  if (hasDocumentSurface(model)) return "document";
  if (hasScreenshotSurface(model.visualFrame)) return "screenshot";
  return null;
}

function hasScreenshotSurface(frame: NodeStateViewModel["visualFrame"]): boolean {
  return Boolean(frame?.layers.some((layer) => layer.kind === "image" || layerBoundsKind(layer, "screenshot") === "screenshot"));
}

function hasDocumentSurface(model: NodeStateViewModel): boolean {
  if (model.visualFrame?.layers.some((layer) => layer.kind !== "image" && (layerBoundsKind(layer, "screenshot") === "document" || layerRenderKind(layer) === "direct-rendered"))) return true;
  if (model.facts.some((fact) => anchorBounds(fact.anchor) && anchorBoundsKind(fact.anchor, "screenshot") === "document")) return true;
  const metadata = objectMetadata(model.visualFrame?.metadata);
  return Boolean(firstPositiveNumber(metadata.documentWidth) && firstPositiveNumber(metadata.documentHeight));
}

function visualLayersForSurface(frame: NonNullable<NodeStateViewModel["visualFrame"]>, surface: StateVisualSurfaceMode): StateVisualLayer[] {
  return frame.layers.filter((layer) => {
    if (layer.kind === "image") return true;
    const renderKind = layerRenderKind(layer);
    const boundsKind = layerBoundsKind(layer, surface);
    if (surface === "screenshot") return boundsKind === "screenshot" && renderKind !== "direct-rendered" && layerVisibleOnViewport(layer) !== false;
    return boundsKind === "document" || boundsKind === "screenshot" || renderKind === "direct-rendered";
  });
}

function factBoundsForSurface(facts: StateFactViewModel[], surface: StateVisualSurfaceMode, metrics: StateVisualMetrics, hasImageLayer: boolean): Array<{ fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean }> {
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

function selectedVisualBounds(model: NodeStateViewModel, selectedFactPath: string | undefined, metrics: StateVisualMetrics): StateBounds | null {
  if (!selectedFactPath) return null;
  const selectedOverlay = model.overlays.find((overlay) => overlay.selected || overlay.factPath === selectedFactPath);
  const overlayBounds = boundsForSurface(anchorBounds(selectedOverlay?.anchor), anchorBoundsKind(selectedOverlay?.anchor, metrics.surface), metrics);
  if (overlayBounds) return overlayBounds;
  const anchor = model.facts.find((fact) => fact.fullPath === selectedFactPath)?.anchor;
  return boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics);
}

function layerBounds(layer: StateVisualLayer): StateBounds | null {
  if ("bounds" in layer && layer.bounds) return layer.bounds;
  if ("anchor" in layer) return anchorBounds(layer.anchor);
  return null;
}

function imageLayerBoundsForSurface(layer: StateVisualLayer, metrics: StateVisualMetrics): StateBounds | null {
  const bounds = layerBounds(layer) ?? { x: 0, y: 0, width: metrics.image.width, height: metrics.image.height };
  return boundsForSurface(bounds, layerBoundsKind(layer, "screenshot"), metrics);
}

function layerBoundsKind(layer: StateVisualLayer, fallback: StateBoundsKind): StateBoundsKind {
  const explicit = "boundsKind" in layer ? boundsKindValue(layer.boundsKind) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? boundsKindValue(metadata.boundsKind) ?? fallback;
}

function layerRenderKind(layer: StateVisualLayer): StateRenderKind | undefined {
  const explicit = "renderKind" in layer ? renderKindValue(layer.renderKind) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? renderKindValue(metadata.renderKind);
}

function layerVisibleOnViewport(layer: StateVisualLayer): boolean | undefined {
  const explicit = "isVisibleOnViewport" in layer ? booleanValue(layer.isVisibleOnViewport) : undefined;
  const metadata = objectMetadata(layer.metadata);
  return explicit ?? booleanValue(metadata.isVisibleOnViewport);
}

function anchorBounds(anchor: EvidenceAnchor | undefined): StateBounds | null {
  if (!anchor) return null;
  if (anchor.type === "bounds") return anchor.bounds;
  if (anchor.type === "point") return { x: anchor.x - 6, y: anchor.y - 6, width: 12, height: 12 };
  return null;
}

function anchorBoundsKind(anchor: EvidenceAnchor | undefined, fallback: StateBoundsKind): StateBoundsKind {
  if (!anchor) return fallback;
  const explicit = anchor.type === "bounds" ? boundsKindValue(anchor.boundsKind) : undefined;
  const metadata = objectMetadata(anchor.metadata);
  return explicit ?? boundsKindValue(metadata.boundsKind) ?? fallback;
}

function factRenderKind(fact: StateFactViewModel): StateRenderKind | undefined {
  const anchorMetadata = objectMetadata(fact.anchor?.metadata);
  const rawMetadata = objectMetadata(fact.rawValue);
  return renderKindValue(anchorMetadata.renderKind) ?? renderKindValue(rawMetadata.renderKind);
}

function boundsForSurface(bounds: StateBounds | null, boundsKind: StateBoundsKind, metrics: StateVisualMetrics): StateBounds | null {
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

function boundsIntersectsViewport(bounds: StateBounds, boundsKind: StateBoundsKind, metrics: StateVisualMetrics): boolean {
  const surfaceBounds = boundsForSurface(bounds, boundsKind, metrics);
  if (!surfaceBounds) return false;
  return surfaceBounds.x + surfaceBounds.width > 0
    && surfaceBounds.y + surfaceBounds.height > 0
    && surfaceBounds.x < metrics.coordinate.width
    && surfaceBounds.y < metrics.coordinate.height;
}

function documentBoundsIntersectViewport(bounds: StateBounds, metrics: StateVisualMetrics): boolean {
  const viewport = metrics.viewport;
  if (!viewport) return false;
  return bounds.x + bounds.width > viewport.x
    && bounds.y + bounds.height > viewport.y
    && bounds.x < viewport.x + viewport.width
    && bounds.y < viewport.y + viewport.height;
}

function anchorStyle(anchor: EvidenceAnchor, metrics: StateVisualMetrics): CSSProperties | null {
  return layerBoundsStyle(boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics), metrics);
}

function visualLayerStyle(layer: StateVisualLayer, bounds: StateBounds | null, metrics: StateVisualMetrics, selected: boolean): CSSProperties {
  const space = metrics.coordinate;
  const style = layerBoundsStyle(bounds, { ...metrics, coordinate: space });
  if (layer.kind === "region" || layer.kind === "element") return { ...style, zIndex: bboxZIndex(bounds, space.width, space.height, selected) };
  if (layer.kind === "text") return { ...style, zIndex: 20 };
  if (layer.kind === "image") return { ...style, zIndex: 1 };
  return style;
}

function overlayStyle(anchor: EvidenceAnchor, metrics: StateVisualMetrics, selected: boolean): CSSProperties | null {
  const bounds = boundsForSurface(anchorBounds(anchor), anchorBoundsKind(anchor, metrics.surface), metrics);
  const space = metrics.coordinate;
  const style = anchorStyle(anchor, { ...metrics, coordinate: space });
  return style ? { ...style, zIndex: bboxZIndex(bounds, space.width, space.height, selected) } : null;
}

function layerBoundsStyle(bounds: StateBounds | null, metrics: Pick<StateVisualMetrics, "coordinate">): CSSProperties {
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

function directRenderedTextStyle(style: CSSProperties, bounds: StateBounds | null, content: string): CSSProperties {
  const fit = fittedTextStyle(bounds, content);
  return {
    ...style,
    "--state-direct-fit-width": fit.fitWidth,
    "--state-direct-fit-height": fit.fitHeight,
    "--state-direct-line-height": fit.lineHeight.toFixed(2),
    "--state-direct-padding-x": `${fit.paddingX}px`
  } as CSSProperties;
}

function fittedTextStyle(bounds: StateBounds | null, content: string): { fitWidth: string; fitHeight: string; lineHeight: number; paddingX: number } {
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

function offsetBounds(bounds: StateBounds | null, offset: { x: number; y: number }): StateBounds | null {
  if (!bounds || (!offset.x && !offset.y)) return bounds;
  return { ...bounds, x: bounds.x + offset.x, y: bounds.y + offset.y };
}

function bboxZIndex(bounds: StateBounds | null, frameWidth: number, frameHeight: number, selected: boolean): number {
  if (!bounds) return selected ? 101 : 100;
  const clipped = clipBounds(bounds, frameWidth, frameHeight);
  const frameArea = Math.max(1, frameWidth * frameHeight);
  const areaRatio = clampNumber((clipped.width * clipped.height) / frameArea, 0, 1);
  const inverseAreaRank = Math.round((1 - areaRatio) * 1_000_000);
  return 100 + (inverseAreaRank * 2) + (selected ? 1 : 0);
}

function clipBounds(bounds: StateBounds, frameWidth: number, frameHeight: number): StateBounds {
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function nearestZoomIndex(zoom: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  stateCanvasZoomLevels.forEach((level, index) => {
    const distance = Math.abs(level - zoom);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function boundsEqual(left: StateBounds | null, right: StateBounds | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.width - right.width) < 0.5
    && Math.abs(left.height - right.height) < 0.5;
}

function visualToneForLayer(layer: StateVisualLayer): StateVisualTone {
  const metadata = objectMetadata(layer.metadata);
  return visualToneFromMetadata({
    tagName: stringMetadata(metadata.tagName),
    role: stringMetadata(metadata.role),
    type: stringMetadata(metadata.type),
    statePath: "statePath" in layer ? layer.statePath : undefined,
    disabled: metadata.disabled === true || metadata.disabled === "true" || metadata["aria-disabled"] === "true"
  });
}

function visualToneFromFact(fact: StateFactViewModel): StateVisualTone {
  const metadata = objectMetadata(fact.rawValue);
  return visualToneFromMetadata({
    tagName: stringMetadata(metadata.tagName),
    role: stringMetadata(metadata.role),
    type: stringMetadata(metadata.type),
    statePath: fact.fullPath,
    disabled: metadata.disabled === true || metadata.disabled === "true" || metadata["aria-disabled"] === "true"
  });
}

function directRenderedTextCandidates(layers: StateVisualLayer[], factLayers: Array<{ fact: StateFactViewModel; bounds: StateBounds; directRendered: boolean }>, facts: StateFactViewModel[], metrics: StateVisualMetrics): DirectRenderedTextCandidate[] {
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

function directRenderedTextCandidate(id: string, bounds: StateBounds, content: string): DirectRenderedTextCandidate {
  return { id, bounds, content, area: Math.max(0, bounds.width) * Math.max(0, bounds.height) };
}

function directRenderedLayerCandidateId(layer: StateVisualLayer): string {
  return `layer:${layer.id}:${layerStatePath(layer) ?? ""}`;
}

function directRenderedFactCandidateId(fact: StateFactViewModel): string {
  return `fact:${fact.fullPath}`;
}

function shouldRenderDirectText(id: string, bounds: StateBounds | null, content: string, candidates: DirectRenderedTextCandidate[]): boolean {
  if (!bounds) return true;
  const area = Math.max(0, bounds.width) * Math.max(0, bounds.height);
  return !candidates.some((candidate) =>
    candidate.id !== id
    && candidate.area < area
    && boundsContains(bounds, candidate.bounds)
    && directTextOverlaps(content, candidate.content)
  );
}

function boundsContains(parent: StateBounds, child: StateBounds): boolean {
  const tolerance = 1;
  return child.x >= parent.x - tolerance
    && child.y >= parent.y - tolerance
    && child.x + child.width <= parent.x + parent.width + tolerance
    && child.y + child.height <= parent.y + parent.height + tolerance;
}

function directTextOverlaps(parent: string, child: string): boolean {
  const left = normalizeDirectText(parent);
  const right = normalizeDirectText(child);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeDirectText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function directRenderedLayerContent(layer: StateVisualLayer, facts: StateFactViewModel[]): string | undefined {
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

function directRenderedFactContent(fact: StateFactViewModel): string {
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

function firstDisplayString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    if (text) return text;
  }
  return undefined;
}

function visualToneFromMetadata(input: { tagName?: string | undefined; role?: string | undefined; type?: string | undefined; statePath?: string | undefined; disabled?: boolean | undefined }): StateVisualTone {
  if (input.disabled) return "disabled";
  const tag = input.tagName?.toLowerCase();
  const role = input.role?.toLowerCase();
  const type = input.type?.toLowerCase();
  const path = input.statePath?.toLowerCase() ?? "";
  if (tag === "a" || role === "link" || path.endsWith(".href") || path.includes(".url")) return "link";
  if (tag === "img" || tag === "picture" || tag === "video" || tag === "canvas" || role === "img" || path.includes(".image") || path.includes(".media")) return "media";
  if (tag === "nav" || role === "navigation" || role === "menubar" || role === "menu" || role === "tablist" || role === "tab" || path.includes(".nav") || path.includes(".menu") || path.includes(".tab")) return "navigation";
  if (tag === "ul" || tag === "ol" || tag === "li" || tag === "table" || tag === "tr" || tag === "td" || tag === "th" || role === "list" || role === "listitem" || role === "grid" || role === "row" || role === "cell" || role === "option" || path.includes(".list") || path.includes(".row") || path.includes(".cell") || path.includes(".option")) return "list";
  if (role === "status" || role === "alert" || role === "progressbar" || tag === "progress" || tag === "meter" || path.includes(".status") || path.includes(".alert") || path.includes(".error") || path.includes(".warning")) return "status";
  if (tag === "input" || tag === "textarea" || tag === "select" || role === "textbox" || role === "combobox" || role === "searchbox" || type === "text" || type === "search" || type === "email" || type === "password" || type === "number" || path.includes(".value") || path.includes(".input")) return "input";
  if (tag === "button" || role === "button" || role === "switch" || role === "checkbox" || role === "radio" || tag === "summary" || path.includes(".button") || path.includes(".control") || path.includes(".action")) return "control";
  if (path.includes(".text") || path.includes(".label") || path.includes(".title") || tag === "label" || tag === "span" || tag === "p" || tag === "strong" || tag === "em" || tag === "h1" || tag === "h2" || tag === "h3" || role === "heading") return "text";
  if (path.includes(".selected") || path.includes(".focus") || role === "dialog") return "selected";
  if (path.includes(".bounds") || path.includes(".visible") || tag === "section" || tag === "article" || tag === "main" || tag === "header" || tag === "footer" || tag === "aside") return "region";
  return "unknown";
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function viewportBoundsFromFacts(facts: StateFactViewModel[]): StateBounds | undefined {
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

function viewportBoundsFromFrame(frame: NodeStateViewModel["visualFrame"]): StateBounds | undefined {
  if (!frame) return undefined;
  const metadata = objectMetadata(frame.metadata);
  const image = imageBoundsFromFrame(frame);
  const width = firstPositiveNumber(metadata.viewportWidth, image?.width, frame.coordinateSpace.width);
  const height = firstPositiveNumber(metadata.viewportHeight, image?.height, frame.coordinateSpace.height);
  if (!width || !height) return undefined;
  return { x: 0, y: 0, width, height };
}

function imageBoundsFromFrame(frame: NodeStateViewModel["visualFrame"]): StateSize | undefined {
  const imageLayer = frame?.layers.find((layer) => layer.kind === "image");
  const bounds = imageLayer ? layerBounds(imageLayer) : null;
  const width = firstPositiveNumber(bounds?.width);
  const height = firstPositiveNumber(bounds?.height);
  return width && height ? { width, height } : undefined;
}

function documentSizeFromFrame(frame: NodeStateViewModel["visualFrame"], facts: StateFactViewModel[], viewport: StateBounds | undefined): StateSize {
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

function maxAnchorBounds(facts: StateFactViewModel[]): StateSize | undefined {
  const bounds = facts.map((fact) => anchorBounds(fact.anchor)).filter((item): item is StateBounds => Boolean(item));
  if (!bounds.length) return undefined;
  return {
    width: Math.max(...bounds.map((item) => item.x + item.width)),
    height: Math.max(...bounds.map((item) => item.y + item.height))
  };
}

function frameBoundsKind(frame: NodeStateViewModel["visualFrame"]): StateBoundsKind | undefined {
  const metadata = objectMetadata(frame?.metadata);
  const frameKind = stringMetadata(metadata.frameKind)?.toLowerCase();
  const screenCoordinateSpace = stringMetadata(metadata.screenCoordinateSpace)?.toLowerCase();
  if (frameKind?.includes("document") || screenCoordinateSpace === "document") return "document";
  if (frameKind?.includes("screenshot") || frameKind?.includes("viewport") || screenCoordinateSpace === "viewport") return "screenshot";
  return undefined;
}

function boundsKindValue(value: unknown): StateBoundsKind | undefined {
  return value === "screenshot" || value === "document" ? value : undefined;
}

function renderKindValue(value: unknown): StateRenderKind | undefined {
  return value === "screenshot-bbox" || value === "direct-rendered" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function firstPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function stateVisualChildKey(kind: string, id: string, index: number): string {
  return `${kind}:${id}:${index}`;
}

function compactStateViewState(value: { sourceId?: string | undefined; stateSnapshotId?: string | undefined; phase?: NodeStatePhase | undefined; selectedEvidenceId?: string | undefined; selectedFactPath?: string | undefined }): NonNullable<BuildNodeStateViewModelInput["viewState"]> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as NonNullable<BuildNodeStateViewModelInput["viewState"]>;
}

function compactStateSelection(value: { sourceId?: string | undefined; phase?: NodeStatePhase | undefined; evidenceId?: string | undefined; factPath?: string | undefined; recordingId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined; stateRef?: string | undefined }) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string; stateRef?: string };
}
