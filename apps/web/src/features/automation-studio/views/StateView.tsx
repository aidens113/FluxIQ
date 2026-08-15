"use client";

import { AlertCircle, Braces, GitCompare, ImageIcon, ListChecks } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MutableRefObject } from "react";
import type { EvidenceAnchor, NodeStatePhase, StateVisualLayer } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../types";
import { buildNodeStateViewModel, type BuildNodeStateViewModelInput, type NodeEvidenceBindingViewModel, type NodeStateViewModel, type StateFactViewModel, type StateOverlayViewModel, type StateVisualTone } from "../state/view-model";

export type StateViewMode = "visual" | "structured" | "diff" | "compare" | "raw";

export function AutomationStateView(props: { input: BuildNodeStateViewModelInput; setSelection(selection: AutomationSelection): void }) {
  const initialSelection = stateSelection(props.input.selection);
  const [sourceId, setSourceId] = useState<string | undefined>(initialSelection.sourceId);
  const [phase, setPhase] = useState<NodeStatePhase>(initialSelection.phase ?? "input");
  const [mode, setMode] = useState<StateViewMode>("visual");
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
    phase,
    selectedEvidenceId,
    selectedFactPath
  });
  const model = useMemo(() => buildNodeStateViewModel({
    ...props.input,
    viewState
  }), [props.input, viewState]);
  const activeMode = mode;

  function selectEvidence(id: string) {
    const evidence = model.evidence.find((item) => item.id === id);
    setSelectedEvidenceId(id);
    if (evidence?.factPath) setSelectedFactPath(evidence.factPath);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ evidenceId: id, factPath: evidence?.factPath, sourceId, phase })));
  }

  function selectFact(path: string) {
    setSelectedEvidenceId(undefined);
    setSelectedFactPath(path);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ factPath: path, sourceId, phase })));
  }

  return (
    <section className="automation-state-view">
      <header className="automation-state-view-header">
        <div>
          <strong>{model.title}</strong>
          <span>{model.subtitle}</span>
        </div>
        <div className="automation-state-summary" aria-label="State summary">
          <span>{model.summary.facts} facts</span>
          <span>{model.summary.evidence} evidence</span>
          <span>{model.summary.strong} strong</span>
          <span>{model.summary.weak} weak</span>
          <span>{model.summary.negative} negative</span>
          {model.runtimeComparison ? <span>{model.summary.mismatches ?? 0} mismatches</span> : null}
        </div>
      </header>
      <StateViewToolbar
        model={model}
        mode={activeMode}
        onModeChange={setMode}
        onPhaseChange={(nextPhase) => {
          setPhase(nextPhase);
          props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ sourceId, phase: nextPhase, evidenceId: selectedEvidenceId, factPath: selectedFactPath })));
        }}
      />
      {model.emptyState ? <div className="automation-state-empty"><AlertCircle size={16} aria-hidden /><strong>{model.emptyState.title}</strong><span>{model.emptyState.message}</span></div> : null}
      <div className="automation-state-workspace">
        <main className="automation-state-primary">
          {activeMode === "visual" ? <StateVisualCanvas model={model} selectedFactPath={selectedFactPath} onSelectEvidence={selectEvidence} onSelectFact={selectFact} /> : null}
          {activeMode === "structured" ? <StateStructuredPanel rows={model.structuredRows} onSelectFact={selectFact} /> : null}
          {activeMode === "diff" ? <StateDiffPanel model={model} /> : null}
          {activeMode === "compare" ? <StateComparePanel model={model} onSelectEvidence={selectEvidence} onSelectFact={selectFact} /> : null}
          {activeMode === "raw" ? <StateRawPanel model={model} /> : null}
        </main>
        <aside className="automation-state-side">
          <StateEvidenceList evidence={model.evidence} facts={model.facts} selectedEvidenceId={selectedEvidenceId} selectedFactPath={selectedFactPath} onSelectEvidence={selectEvidence} onSelectFact={selectFact} />
        </aside>
      </div>
    </section>
  );
}

function StateViewToolbar(props: { model: NodeStateViewModel; mode: StateViewMode; onPhaseChange(phase: NodeStatePhase): void; onModeChange(mode: StateViewMode): void }) {
  const modes: Array<{ id: StateViewMode; label: string; icon: typeof ImageIcon }> = [
    { id: "visual", label: "Visual", icon: ImageIcon },
    { id: "structured", label: "Structured", icon: ListChecks },
    { id: "diff", label: "Diff", icon: GitCompare },
    { id: "compare", label: "Compare", icon: GitCompare },
    { id: "raw", label: "Raw", icon: Braces }
  ];
  return (
    <div className="automation-state-toolbar">
      <div className="automation-state-control">
        <span>Phase</span>
        <div className="segmented-control">
          {props.model.phases.map((phase) => <button className={props.model.activePhase === phase.id ? "selected" : ""} disabled={!phase.available} key={phase.id} onClick={() => props.onPhaseChange(phase.id)} type="button">{phase.label}</button>)}
        </div>
      </div>
      <div className="automation-state-control">
        <span>View</span>
        <div className="segmented-control">
          {modes.filter((mode) => mode.id !== "compare" || props.model.runtimeComparison).map((mode) => {
            const Icon = mode.icon;
            return <button className={props.mode === mode.id ? "selected" : ""} key={mode.id} onClick={() => props.onModeChange(mode.id)} title={mode.label} type="button"><Icon size={14} aria-hidden />{mode.label}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

function StateVisualCanvas(props: { model: NodeStateViewModel; selectedFactPath: string | undefined; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const frame = props.model.visualFrame;
  if (!frame) {
    return (
      <div className="automation-state-visual-fallback">
        <div><ImageIcon size={16} aria-hidden /><strong>No visual frame exists</strong><span>This state source has structured facts, but no importer-provided visual reconstruction.</span></div>
        <StateStructuredPanel rows={props.model.structuredRows} onSelectFact={props.onSelectFact} />
      </div>
    );
  }
  const width = Math.max(1, frame.coordinateSpace.width);
  const height = Math.max(1, frame.coordinateSpace.height);
  return (
    <div className="automation-state-canvas-shell">
      <div className="automation-state-canvas" style={{ aspectRatio: `${width} / ${height}` }}>
        {frame.layers.map((layer, index) => <StateVisualLayerView height={height} key={stateVisualChildKey("layer", layer.id, index)} layer={layer} selectedFactPath={props.selectedFactPath} width={width} onSelectFact={props.onSelectFact} />)}
        {props.model.overlays.map((overlay, index) => <StateOverlay height={height} key={stateVisualChildKey("overlay", overlay.id, index)} overlay={overlay} width={width} onSelectEvidence={props.onSelectEvidence} onSelectFact={props.onSelectFact} />)}
      </div>
    </div>
  );
}

function StateVisualLayerView(props: { layer: StateVisualLayer; width: number; height: number; selectedFactPath: string | undefined; onSelectFact(path: string): void }) {
  const bounds = layerBounds(props.layer);
  const style = visualLayerStyle(props.layer, bounds, props.width, props.height, layerStatePath(props.layer) === props.selectedFactPath);
  if (props.layer.kind === "image") {
    const imageSrc = stateLayerImageSrc(props.layer.contentRef);
    return imageSrc
      ? <StateImageLayer contentRef={props.layer.contentRef} imageSrc={imageSrc} opacity={props.layer.opacity ?? 1} style={style} />
      : <div className="automation-state-layer automation-state-layer-placeholder" style={style}><ImageIcon size={16} aria-hidden /><span>{props.layer.contentRef}</span></div>;
  }
  if (props.layer.kind === "text") return <div className={`automation-state-layer automation-state-layer-text tone-${props.layer.style?.tone ?? "default"} size-${props.layer.style?.size ?? "sm"}`} style={style}>{props.layer.content}</div>;
  if (props.layer.kind === "region" || props.layer.kind === "element") {
    const statePath = layerStatePath(props.layer);
    const className = `automation-state-layer automation-state-layer-${props.layer.kind} visual-${visualToneForLayer(props.layer)}${statePath && statePath === props.selectedFactPath ? " selected" : ""}${statePath ? " interactive" : ""}`;
    if (statePath) {
      return (
        <button
          aria-label={props.layer.label ?? statePath}
          className={className}
          onClick={() => props.onSelectFact(statePath)}
          onKeyDown={(event) => handleStateLayerKeyDown(event, () => props.onSelectFact(statePath))}
          style={style}
          title={props.layer.label ?? statePath}
          type="button"
        />
      );
    }
    return <div aria-label={props.layer.label} className={className} style={style} title={props.layer.label} />;
  }
  return null;
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

function StateOverlay(props: { overlay: StateOverlayViewModel; width: number; height: number; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const style = overlayStyle(props.overlay.anchor, props.width, props.height, props.overlay.selected === true);
  if (!style) return null;
  const label = props.overlay.confidence === undefined ? props.overlay.label : `${props.overlay.label} (${Math.round(props.overlay.confidence * 100)}%)`;
  return (
    <button
      aria-label={label}
      className={`automation-state-overlay tone-${props.overlay.tone} visual-${props.overlay.visualTone ?? "unknown"}${props.overlay.selected ? " selected" : ""}`}
      onClick={() => props.overlay.evidenceId ? props.onSelectEvidence(props.overlay.evidenceId) : props.overlay.factPath ? props.onSelectFact(props.overlay.factPath) : undefined}
      style={style}
      title={label}
      type="button"
    />
  );
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

function StateEvidenceList(props: { evidence: NodeEvidenceBindingViewModel[]; facts: StateFactViewModel[]; selectedEvidenceId: string | undefined; selectedFactPath: string | undefined; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const listRef = useRef<HTMLElement | null>(null);
  const evidenceRefs = useRef(new Map<string, HTMLButtonElement>());
  const factRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeEvidenceId = props.selectedEvidenceId ?? props.evidence.find((item) => item.factPath === props.selectedFactPath)?.id;

  useEffect(() => {
    const target = props.selectedFactPath ? factRefs.current.get(props.selectedFactPath) : activeEvidenceId ? evidenceRefs.current.get(activeEvidenceId) : undefined;
    if (target) scrollStateListItemIntoView(listRef.current, target);
  }, [activeEvidenceId, props.selectedFactPath]);

  return (
    <section className="automation-state-evidence-list" ref={listRef}>
      <header><strong>Evidence / Facts</strong><span>{props.evidence.length || props.facts.length}</span></header>
      {props.evidence.map((evidence) => (
        <button className={evidence.id === activeEvidenceId ? "selected" : evidence.factPath === props.selectedFactPath ? "related" : ""} key={evidence.id} onClick={() => props.onSelectEvidence(evidence.id)} ref={stateListButtonRef(evidenceRefs, evidence.id)} type="button">
          <strong>{evidence.label}</strong>
          <span>{evidence.comparator}{evidence.expectedValue ? ` -> ${evidence.expectedValue}` : ""}</span>
          <small>{evidence.role} | weight {formatOptional(evidence.weight)} | confidence {formatOptional(evidence.confidence)}</small>
        </button>
      ))}
      {props.evidence.length && props.facts.length ? <header className="automation-state-list-subheader"><strong>Elements</strong><span>{props.facts.length}</span></header> : null}
      {props.facts.map((fact) => (
        <button className={props.selectedFactPath === fact.fullPath ? "selected" : ""} key={fact.id} onClick={() => props.onSelectFact(fact.fullPath)} ref={stateListButtonRef(factRefs, fact.fullPath)} type="button">
          <strong>{fact.label}</strong>
          <span>{fact.fullPath}</span>
          <small>{fact.value}</small>
        </button>
      ))}
      {!props.evidence.length && !props.facts.length ? <span className="automation-state-muted">No evidence or facts are attached to this state source.</span> : null}
    </section>
  );
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
  return <pre className="automation-state-raw">{JSON.stringify(props.model.raw, null, 2)}</pre>;
}

function stateSelection(selection: AutomationSelection | null): { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string } {
  if (selection?.kind !== "state") return {};
  return compactStateSelection({
    sourceId: selection.sourceId,
    phase: selection.phase,
    evidenceId: selection.evidenceId,
    factPath: selection.factPath,
    recordingId: selection.recordingId,
    proposalId: selection.proposalId,
    timelineEntryId: selection.timelineEntryId
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
    selection.timelineEntryId ?? ""
  ].join("|");
}

function stateAutomationSelection(model: NodeStateViewModel, input: BuildNodeStateViewModelInput, next: { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string }): AutomationSelection {
  const nodeId = inputNodeId(input) ?? (model.activeSource?.kind === "learned" ? model.activeSource.nodeId : undefined);
  const sourceId = next.sourceId ?? model.activeSource?.id;
  return {
    kind: "state",
    id: `state:${nodeId ?? model.activeSource?.id ?? "workspace"}`,
    ...(nodeId ? { nodeId } : {}),
    ...(sourceId ? { sourceId } : {}),
    phase: next.phase ?? model.activePhase,
    ...(next.evidenceId ? { evidenceId: next.evidenceId } : {}),
    ...(next.factPath ? { factPath: next.factPath } : {}),
    ...(input.selection?.kind === "state" && input.selection.recordingId ? { recordingId: input.selection.recordingId } : {}),
    ...(input.selection?.kind === "state" && input.selection.proposalId ? { proposalId: input.selection.proposalId } : {}),
    ...(input.selection?.kind === "state" && input.selection.timelineEntryId ? { timelineEntryId: input.selection.timelineEntryId } : {})
  };
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

function layerBounds(layer: StateVisualLayer): { x: number; y: number; width: number; height: number } | null {
  if ("bounds" in layer && layer.bounds) return layer.bounds;
  if ("anchor" in layer) return anchorBounds(layer.anchor);
  return null;
}

function anchorBounds(anchor: EvidenceAnchor | undefined): { x: number; y: number; width: number; height: number } | null {
  if (!anchor) return null;
  if (anchor.type === "bounds") return anchor.bounds;
  if (anchor.type === "point") return { x: anchor.x - 6, y: anchor.y - 6, width: 12, height: 12 };
  return null;
}

function anchorStyle(anchor: EvidenceAnchor, width: number, height: number): CSSProperties | null {
  return layerBoundsStyle(anchorBounds(anchor), width, height);
}

function visualLayerStyle(layer: StateVisualLayer, bounds: { x: number; y: number; width: number; height: number } | null, width: number, height: number, selected: boolean): CSSProperties {
  const style = layerBoundsStyle(bounds, width, height);
  if (layer.kind === "region" || layer.kind === "element") return { ...style, zIndex: bboxZIndex(bounds, width, height, selected) };
  if (layer.kind === "text") return { ...style, zIndex: 20 };
  if (layer.kind === "image") return { ...style, zIndex: 1 };
  return style;
}

function overlayStyle(anchor: EvidenceAnchor, width: number, height: number, selected: boolean): CSSProperties | null {
  const bounds = anchorBounds(anchor);
  const style = anchorStyle(anchor, width, height);
  return style ? { ...style, zIndex: bboxZIndex(bounds, width, height, selected) } : null;
}

function layerBoundsStyle(bounds: { x: number; y: number; width: number; height: number } | null, width: number, height: number): CSSProperties {
  if (!bounds) return { left: "2%", top: "2%", maxWidth: "96%" };
  const clipped = clipBounds(bounds, width, height);
  return {
    left: `${(clipped.x / width) * 100}%`,
    top: `${(clipped.y / height) * 100}%`,
    width: `${(clipped.width / width) * 100}%`,
    height: `${(clipped.height / height) * 100}%`
  };
}

function bboxZIndex(bounds: { x: number; y: number; width: number; height: number } | null, frameWidth: number, frameHeight: number, selected: boolean): number {
  if (!bounds) return selected ? 101 : 100;
  const clipped = clipBounds(bounds, frameWidth, frameHeight);
  const frameArea = Math.max(1, frameWidth * frameHeight);
  const areaRatio = clampNumber((clipped.width * clipped.height) / frameArea, 0, 1);
  const inverseAreaRank = Math.round((1 - areaRatio) * 1_000_000);
  return 100 + (inverseAreaRank * 2) + (selected ? 1 : 0);
}

function clipBounds(bounds: { x: number; y: number; width: number; height: number }, frameWidth: number, frameHeight: number): { x: number; y: number; width: number; height: number } {
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

function visualToneFromMetadata(input: { tagName?: string | undefined; role?: string | undefined; type?: string | undefined; statePath?: string | undefined; disabled?: boolean | undefined }): StateVisualTone {
  if (input.disabled) return "disabled";
  const tag = input.tagName?.toLowerCase();
  const role = input.role?.toLowerCase();
  const type = input.type?.toLowerCase();
  const path = input.statePath?.toLowerCase() ?? "";
  if (tag === "a" || role === "link" || path.endsWith(".href")) return "link";
  if (tag === "input" || tag === "textarea" || tag === "select" || role === "textbox" || role === "combobox" || type === "text" || type === "search" || path.includes(".value")) return "input";
  if (tag === "button" || role === "button" || role === "menuitem" || role === "tab" || role === "switch" || role === "checkbox" || role === "radio") return "control";
  if (path.includes(".text") || path.includes(".label") || tag === "label") return "text";
  if (path.includes(".bounds") || path.includes(".visible")) return "region";
  return "unknown";
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatOptional(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(2);
}

function stateVisualChildKey(kind: string, id: string, index: number): string {
  return `${kind}:${id}:${index}`;
}

function stateListButtonRef(refs: MutableRefObject<Map<string, HTMLButtonElement>>, id: string) {
  return (element: HTMLButtonElement | null) => {
    if (element) refs.current.set(id, element);
    else refs.current.delete(id);
  };
}

function scrollStateListItemIntoView(container: HTMLElement | null, target: HTMLElement): void {
  if (!container) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = targetRect.top - containerRect.top + container.scrollTop;
  const targetCenter = targetTop - (container.clientHeight / 2) + (target.clientHeight / 2);
  container.scrollTo({ top: Math.max(0, targetCenter), behavior: "smooth" });
}

function compactStateViewState(value: { sourceId?: string | undefined; phase?: NodeStatePhase | undefined; selectedEvidenceId?: string | undefined; selectedFactPath?: string | undefined }): NonNullable<BuildNodeStateViewModelInput["viewState"]> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as NonNullable<BuildNodeStateViewModelInput["viewState"]>;
}

function compactStateSelection(value: { sourceId?: string | undefined; phase?: NodeStatePhase | undefined; evidenceId?: string | undefined; factPath?: string | undefined; recordingId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined }) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string };
}
