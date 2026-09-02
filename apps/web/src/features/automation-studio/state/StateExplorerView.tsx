"use client";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../shared/selection-contracts";
import { buildNodeStateInputSignature, buildNodeStateViewModel, buildNodeStateViewStateSignature } from "./model";
import type { BuildNodeStateViewModelInput } from "./model/types";
import type { StateViewMode } from "./state-visual-types";
import { compactStateSelection, compactStateViewState, stateAutomationSelection, stateSelection, stateSelectionKey } from "./state-view-selection";
import { StateComparePanel } from "./StateComparePanel";
import { StateDiffPanel } from "./StateDiffPanel";
import { StateEvidenceInspector } from "./StateEvidencePanel";
import { StateRawPanel } from "./StateRawPanel";
import { StateStructuredPanel } from "./StateStructuredPanel";
import { StateVisualCanvas } from "./StateVisualCanvas";

export function StateExplorerView(props: { input: BuildNodeStateViewModelInput; loading?: { recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; phase?: NodeStatePhase } | null | undefined; setSelection(selection: AutomationSelection): void }) {
  const selectionKey = stateSelectionKey(props.input.selection);
  const initialSelection = useMemo(() => stateSelection(props.input.selection), [selectionKey]);
  const inputSignature = buildNodeStateInputSignature(props.input);
  const [sourceId, setSourceId] = useState<string | undefined>(initialSelection.sourceId);
  const [phase, setPhase] = useState<NodeStatePhase>(initialSelection.phase ?? "input");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | undefined>(initialSelection.evidenceId);
  const [selectedFactPath, setSelectedFactPath] = useState<string | undefined>(initialSelection.factPath);
  const [mode, setMode] = useState<StateViewMode>("visual");

  useEffect(() => {
    setSourceId(initialSelection.sourceId);
    setPhase(initialSelection.phase ?? "input");
    setSelectedEvidenceId(initialSelection.evidenceId);
    setSelectedFactPath(initialSelection.factPath);
  }, [selectionKey, initialSelection.sourceId, initialSelection.phase, initialSelection.evidenceId, initialSelection.factPath]);

  const viewState = useMemo(() => compactStateViewState({
    sourceId,
    stateSnapshotId: initialSelection.stateSnapshotId,
    phase,
    selectedEvidenceId,
    selectedFactPath
  }), [sourceId, initialSelection.stateSnapshotId, phase, selectedEvidenceId, selectedFactPath]);
  const viewStateSignature = buildNodeStateViewStateSignature(viewState);
  const model = useMemo(() => buildNodeStateViewModel({
    ...props.input,
    viewState
  }), [inputSignature, viewStateSignature]);
  const resolvedSourceId = model.activeSource?.id ?? sourceId;
  const viewModes: Array<{ id: StateViewMode; label: string; available: boolean; unavailableReason?: string }> = [
    { id: "visual", label: "Visual", available: true },
    { id: "structured", label: "Structured", available: true },
    { id: "diff", label: "Diff", available: model.diffRows.length > 0, unavailableReason: "No before/after deltas are available for this source" },
    { id: "compare", label: "Compare", available: Boolean(model.runtimeComparison), unavailableReason: "Expected-vs-actual comparison requires runtime actual output" },
    { id: "raw", label: "Raw", available: true }
  ];
  useEffect(() => {
    if (mode === "diff" && !model.diffRows.length) setMode("visual");
    if (mode === "compare" && !model.runtimeComparison) setMode("visual");
  }, [mode, model.activeSource?.id, model.activePhase, model.diffRows.length, model.runtimeComparison]);

  function selectEvidence(id: string) {
    const evidence = model.evidence.find((item) => item.id === id);
    setSelectedEvidenceId(id);
    if (evidence?.factPath) setSelectedFactPath(evidence.factPath);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ evidenceId: id, factPath: evidence?.factPath, sourceId: resolvedSourceId, phase })));
  }

  function selectSource(nextSourceId: string) {
    const nextSource = model.sources.find((source) => source.id === nextSourceId);
    const nextPhase = phase === "actual_output" && nextSource?.kind !== "runtime" ? "input" : phase;
    setSourceId(nextSourceId);
    setPhase(nextPhase);
    setSelectedEvidenceId(undefined);
    setSelectedFactPath(undefined);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ sourceId: nextSourceId, phase: nextPhase })));
  }

  function selectPhase(nextPhase: NodeStatePhase) {
    setPhase(nextPhase);
    setSelectedEvidenceId(undefined);
    setSelectedFactPath(undefined);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ sourceId: resolvedSourceId, phase: nextPhase })));
  }
  function selectFact(path: string) {
    setSelectedEvidenceId(undefined);
    setSelectedFactPath(path);
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ factPath: path, sourceId: resolvedSourceId, phase })));
  }
  function retryState() {
    props.setSelection(stateAutomationSelection(model, props.input, compactStateSelection({ sourceId: resolvedSourceId, phase })));
  }

  return (
    <section className="automation-state-view">
      <header className="automation-state-view-header">
        <div><strong>{model.title}</strong><span>{model.subtitle}</span></div>
        <div className="automation-state-summary" aria-label="State summary">
          <span>{model.summary.facts} facts</span>
          <span>{model.summary.evidence} evidence</span>
          <span>{model.summary.strong} strong</span>
          <span>{model.summary.weak} weak</span>
          {model.summary.mismatches !== undefined ? <span>{model.summary.mismatches} mismatches</span> : null}
        </div>
      </header>
      <div className="automation-state-toolbar">
        <label className="automation-state-control">
          <span>Source</span>
          <select aria-label="State source" disabled={Boolean(props.loading) || !model.sources.length} onChange={(event) => selectSource(event.target.value)} value={resolvedSourceId ?? ""}>
            {!model.sources.length ? <option value="">No state sources</option> : null}
            {model.sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
          </select>
        </label>
        <div className="automation-state-control">
          <span>View</span>
          <div className="segmented-control" aria-label="State view" role="group">
            {viewModes.map((item) => <button aria-pressed={mode === item.id} disabled={!item.available} key={item.id} onClick={() => setMode(item.id)} title={item.available ? item.label : item.unavailableReason} type="button">{item.label}</button>)}
          </div>
        </div>        <div className="automation-state-control">
          <span>Phase</span>
          <div className="segmented-control" aria-label="State phase" role="group">
            {model.phases.map((item) => <button aria-pressed={model.activePhase === item.id} disabled={Boolean(props.loading) || !item.available} key={item.id} onClick={() => selectPhase(item.id)} title={!item.available ? `${item.label} is unavailable for this source` : item.label} type="button">{item.label}</button>)}
          </div>
        </div>
      </div>
      {model.emptyState ? <div className="automation-state-empty"><AlertCircle size={16} aria-hidden /><strong>{model.emptyState.title}</strong><span>{model.emptyState.message}</span>{model.emptyState.title === "Requested state is not loaded" && !props.loading ? <button className="button" onClick={retryState} type="button">Retry state loading</button> : null}</div> : null}
      <div className="automation-state-workspace">
        <section className="automation-state-primary">
          {mode === "visual" ? <StateVisualCanvas model={model} selectedFactPath={selectedFactPath} onSelectEvidence={selectEvidence} onSelectFact={selectFact} /> : null}
          {mode === "structured" ? <StateStructuredPanel rows={model.structuredRows} onSelectFact={selectFact} /> : null}
          {mode === "diff" ? <StateDiffPanel model={model} /> : null}
          {mode === "compare" ? <StateComparePanel model={model} onSelectEvidence={selectEvidence} onSelectFact={selectFact} /> : null}
          {mode === "raw" ? <StateRawPanel model={model} /> : null}
          {props.loading ? <div className="automation-state-loading" role="status" aria-live="polite">
            <div>
              <span className="automation-state-loading-spinner" aria-hidden />
              <strong>Opening state</strong>
              <small>{props.loading.timelineEntryId ? `Loading state for ${props.loading.timelineEntryId}` : "Loading state data"}</small>
            </div>
          </div> : null}
        </section>
        <StateEvidenceInspector model={model} selectedEvidenceId={selectedEvidenceId} selectedFactPath={selectedFactPath} onSelectEvidence={selectEvidence} onSelectFact={selectFact} />
      </div>
    </section>
  );
}
