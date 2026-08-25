"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useState } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { AutomationDockTab, AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";
import { groupByNamespace } from "./view-utils";
import { graphToTaskFlow } from "../model/project-artifacts";
import { AutomationPolicyCanvas } from "./GraphEditorViews";
export function AutomationRecordingWorkspace(props: { recordings: any[]; selectedRecording: any; selectedTimeline: any; setSelection(selection: AutomationSelection): void }) {
  const entries = props.selectedTimeline?.timeline ?? props.selectedRecording?.timeline ?? [];
  const checkpoints = entries.filter((entry: any) => entry.type === "state_checkpoint").length;
  const deltas = entries.filter((entry: any) => entry.type === "state_delta").reduce((total: number, entry: any) => total + (entry.deltas?.length ?? 0), 0);
  return (
    <section className="automation-recording-stage">
      <header><strong>{props.selectedRecording?.recordingId ?? "No recording"}</strong><span>{entries.length} entries | {checkpoints} checkpoints | {deltas} deltas</span></header>
      <div className="context-chip-row">
        <span>Environment {props.selectedRecording?.environment?.label ?? "-"}</span>
        <span>Notes {props.selectedRecording?.notes?.length ?? 0}</span>
        <span>Started {props.selectedRecording?.startedAt ? new Date(props.selectedRecording.startedAt).toLocaleTimeString() : "-"}</span>
      </div>
      <div className="automation-state-list">
        {props.recordings.map((recording) => (
          <button className={recording.recordingId === props.selectedRecording?.recordingId ? "selected" : ""} key={recording.recordingId} onClick={() => props.setSelection({ kind: "recording", id: recording.recordingId })} type="button">
            <strong>{recording.recordingId}</strong>
            <span>{recording.environment?.label ?? "Environment"} | {recording.timeline?.length ?? 0} raw entries</span>
          </button>
        ))}
      </div>
      <div className="automation-track-stack">
        {["note", "action", "state_delta", "state_checkpoint"].map((type) => (
          <div className="automation-track" key={type}>
            <strong>{type.replace("_", " ")}</strong>
            <div>
              {entries.filter((entry: any) => entry.type === type).map((entry: any) => (
                <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} style={{ left: `${Math.min(92, Math.max(0, (entry.monotonicOffsetMs ?? 0) / 18))}%` }} type="button">
                  <span>{timelineEntrySummary(entry)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AutomationSignalWorkspace(props: { domains: any[]; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const namespaces = groupByNamespace(props.signals);
  return (
    <section className="automation-signal-board">
      <div className="automation-domain-contracts">
        <header><strong>Recording Domains</strong><span>{props.domains.length} registered</span></header>
        {props.domains.map((domain) => (
          <article key={domain.domainId}>
            <strong>{domain.label ?? domain.domainId}</strong>
            <span>{domain.domainId}</span>
            <small>{domain.eventTypes?.length ?? 0} event types | {domain.stateReducers?.length ?? 0} reducers | {domain.observationExtractors?.length ?? 0} extractors</small>
          </article>
        ))}
        {!props.domains.length ? <span>No recording domain contracts are registered by the host repo yet.</span> : null}
      </div>
      {Object.entries(namespaces).map(([namespace, namespaceSignals]) => (
        <div className="automation-state-namespace" key={namespace}>
          <strong>{namespace}</strong>
          {namespaceSignals.map((signal) => (
            <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
              <span>{signal.registryId}</span>
              <strong>{signal.path}</strong>
              <small>{signal.type} | {signal.comparator?.kind ?? "exact"} | {signal.volatility}</small>
            </button>
          ))}
        </div>
      ))}
      {!props.signals.length ? <span>No signal registries loaded.</span> : null}
    </section>
  );
}

export function AutomationRuntimeWorkspace(props: { projectId: string | null; flow?: any; pipelineArtifacts: any; timelines: any[]; models: any[]; policies: any[]; runtimeSessions: any[] }) {
  const api = useProgramApi("automation-studio");
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  const [inputText, setInputText] = useState("{}");
  const [maxSteps, setMaxSteps] = useState("50");
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<any | null>(null);
  const runFlow = async (mode: AutomationRuntimeRunMode) => {
    setRunningMode(mode);
    setRunError("");
    const payload = buildAutomationRuntimeRunPayload({
      projectId: props.projectId,
      flowId: props.flow?.flowId,
      mode,
      inputText,
      maxSteps
    });
    if (!payload.ok) {
      setRunError(payload.error);
      setRunningMode(null);
      return;
    }
    const result = await api.post<{ runtimeSession?: any; runSummary?: any; createdAdaptationIds?: string[]; interventionCount?: number; terminalReason?: string; durableBehaviorChanged?: boolean }>("run-runtime-session", payload.payload);
    setRunningMode(null);
    if (!result.ok || !result.payload?.runtimeSession) {
      setRunError(result.error ?? "Runtime session could not be started.");
      return;
    }
    setLastRun(result.payload);
  };
  return (
    <section className="automation-runtime-stage">
      <SummaryStrip items={[
        ["Runs", props.runtimeSessions.length],
        ["Timelines", props.timelines.length],
        ["Models", props.models.length],
        ["Adaptations", props.pipelineArtifacts?.policyProposals?.length ?? 0],
        ["Runnable Nodes", props.policies.reduce((total, policy) => total + (policy.nodes?.length ?? 0), 0)]
      ]} />
      <RuntimeRunControlPanel
        disabled={!props.projectId || !props.flow?.flowId || Boolean(runningMode)}
        flow={props.flow}
        inputText={inputText}
        maxSteps={maxSteps}
        runningMode={runningMode}
        onInputText={setInputText}
        onMaxSteps={setMaxSteps}
        onRun={runFlow}
      />
      {runError ? <p className="automation-runtime-message">{runError}</p> : null}
      {lastRun ? <RuntimePostRunSummary result={lastRun} /> : null}
      <RuntimeDebugInnerView focusRunId={lastRun?.runtimeSession?.runId} projectId={props.projectId} initialSessions={orderedSessions} />
    </section>
  );
}

type AutomationRuntimeRunMode = "default" | "manual_approval" | "deterministic";

export function buildAutomationRuntimeRunPayload(input: {
  projectId: string | null;
  flowId?: string;
  mode: AutomationRuntimeRunMode;
  inputText: string;
  maxSteps: string;
}): { ok: true; payload: any } | { ok: false; error: string } {
  if (!input.projectId || !input.flowId) return { ok: false, error: "Select a Flow before running." };
  let parsedInputs: any = {};
  try {
    parsedInputs = input.inputText.trim() ? JSON.parse(input.inputText) : {};
  } catch {
    return { ok: false, error: "Inputs must be valid JSON." };
  }
  if (!parsedInputs || typeof parsedInputs !== "object" || Array.isArray(parsedInputs)) return { ok: false, error: "Inputs must be a JSON object." };
  const maxSteps = input.maxSteps.trim() ? Number(input.maxSteps) : undefined;
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps <= 0)) return { ok: false, error: "Max steps must be a positive whole number." };
  return {
    ok: true,
    payload: {
      projectId: input.projectId,
      flowId: input.flowId,
      inputs: parsedInputs,
      adaptiveMode: input.mode,
      ...(maxSteps !== undefined ? { maxSteps } : {})
    }
  };
}

function RuntimeRunControlPanel(props: {
  disabled: boolean;
  flow: any;
  inputText: string;
  maxSteps: string;
  runningMode: string | null;
  onInputText(value: string): void;
  onMaxSteps(value: string): void;
  onRun(mode: AutomationRuntimeRunMode): void;
}) {
  const [selectedMode, setSelectedMode] = useState<AutomationRuntimeRunMode>("default");
  const runModes: Array<{ mode: AutomationRuntimeRunMode; label: string }> = [
    { mode: "default", label: "Fully adaptive" },
    { mode: "manual_approval", label: "Require manual approval" },
    { mode: "deterministic", label: "No LLM intervention" }
  ];
  const warnings = [
    props.flow?.metadata?.trainingMode === "continuous_adaptive" ? "Continuous adaptive mode can create runtime adaptations." : "",
    props.flow?.metadata?.adaptationPolicySettings?.preset === "autonomous" ? "Autonomous policy can promote eligible validated adaptations." : ""
  ].filter(Boolean);
  const declaredInputs = runtimeFlowDeclaredInputs(props.flow);
  return (
    <section className="automation-runtime-run-panel">
      <header>
        <div>
          <strong>Run This Flow</strong>
          <span>{props.flow?.name ?? props.flow?.flowId ?? "Select a Flow"}</span>
        </div>
      </header>
      {warnings.length ? <div className="automation-runtime-message">{warnings.join(" ")}</div> : null}
      <div className="automation-runtime-run-command">
        <label>
          <span>Mode</span>
          <select value={selectedMode} onChange={(event) => setSelectedMode(event.target.value as AutomationRuntimeRunMode)}>
            {runModes.map((mode) => <option key={mode.mode} value={mode.mode}>{mode.label}</option>)}
          </select>
          <small>{runtimeModeDescription(selectedMode)}</small>
        </label>
        <button className="button button-primary" disabled={props.disabled} onClick={() => props.onRun(selectedMode)} type="button">
          {props.runningMode ? "Running..." : "Run"}
        </button>
      </div>
      {declaredInputs.length ? <div className="automation-runtime-input-fields">
        <header><strong>Run Inputs</strong><span>Values passed into this run</span></header>
        <div>
          {declaredInputs.map((inputName) => (
            <label key={inputName}>
              <span>{inputName}</span>
              <input value={runtimeRunInputValues(props.inputText)[inputName] ?? ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, inputName, event.target.value))} />
            </label>
          ))}
        </div>
      </div> : <div className="automation-runtime-input-preview">
        <strong>No run inputs declared</strong>
        <span>This Flow will run with its saved defaults.</span>
      </div>}
      <div className="automation-runtime-advanced-grid">
        <label><span>Step limit</span><input min={1} type="number" value={props.maxSteps} onChange={(event) => props.onMaxSteps(event.target.value)} /></label>
      </div>
    </section>
  );
}

function runtimeModeDescription(mode: AutomationRuntimeRunMode): string {
  if (mode === "manual_approval") return "Use LLM assistance, but keep generated adaptations queued for review.";
  if (mode === "deterministic") return "Run without LLM intervention or adaptation creation.";
  return "Use this Flow's adaptive policy and auto-apply safe validated adaptations.";
}

function runtimeFlowDeclaredInputs(flow: any): string[] {
  const candidates = [
    flow?.interface?.inputs,
    flow?.inputs,
    flow?.metadata?.inputs,
    flow?.metadata?.inputSchema?.properties
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map((item) => typeof item === "string" ? item : item?.name ?? item?.id).filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8);
    if (candidate && typeof candidate === "object") return Object.keys(candidate).slice(0, 8);
  }
  return [];
}

function runtimeRunInputValues(inputText: string): Record<string, string> {
  try {
    const parsed = inputText.trim() ? JSON.parse(inputText) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  } catch {
    return {};
  }
}

function updateRuntimeRunInputText(inputText: string, key: string, value: string): string {
  let parsed: Record<string, any> = {};
  try {
    const current = inputText.trim() ? JSON.parse(inputText) : {};
    if (current && typeof current === "object" && !Array.isArray(current)) parsed = current;
  } catch {
    parsed = {};
  }
  return JSON.stringify({ ...parsed, [key]: value }, null, 2);
}

export function RuntimePostRunSummary(props: { result: any }) {
  const session = props.result.runtimeSession ?? {};
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Last Run</strong><span>{session.runId ?? "-"}</span></header>
      <SummaryStrip items={[
        ["Status", session.status ?? "-"],
        ["Actions", props.result.runSummary?.actionAttemptCount ?? session.trace?.attempts?.length ?? 0],
        ["Recovery", props.result.runSummary?.metadata?.recoveryAttemptCount ?? 0],
        ["Interventions", props.result.interventionCount ?? 0],
        ["Adaptations", props.result.createdAdaptationIds?.length ?? 0],
        ["Durable", props.result.durableBehaviorChanged ? "yes" : "no"]
      ]} />
      <DataTable columns={["Field", "Value"]} rows={[
        ["Terminal reason", props.result.terminalReason ?? session.trace?.message ?? session.status ?? "-"],
        ["Run detail", props.result.runDetailLink?.runId ?? session.runId ?? "-"],
        ["Adaptations", props.result.createdAdaptationIds?.length ? props.result.createdAdaptationIds.map((adaptationId: string) => <a className="automation-runtime-row-action" href={adaptationReviewHref(props.result.runSummary?.flowId ?? session.flowId, adaptationId)} key={adaptationId}>{adaptationId}</a>) : "-"]
      ]} empty="No run result." />
    </section>
  );
}

export function AutomationRunsWorkspace(props: { projectId: string | null; pipelineArtifacts: any; runtimeSessions: any[] }) {
  const replays = props.pipelineArtifacts?.replayResults ?? [];
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Runs</strong><span>Replay and runtime validation history</span></div>
      </header>
      <SummaryStrip items={[["Runtime Runs", props.runtimeSessions.length], ["Replay Runs", replays.length], ["Failures", props.runtimeSessions.filter((session) => session.status === "failed").length + replays.filter((replay: any) => replay.status === "failed").length], ["Validated", replays.filter((replay: any) => replay.status === "matched").length]]} />
      <RuntimeDebugInnerView projectId={props.projectId} initialSessions={orderedSessions} />
      <DataTable columns={["Replay", "Status", "Recording", "Proposal", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
        replay.replayId,
        <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />,
        replay.recordingId,
        replay.policyId,
        `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`,
        replay.timingWarnings?.length ?? 0
      ])} empty="No replay validations generated yet." />
    </section>
  );
}

const SUBFLOW_PAGE_SIZE = 25;

export function AutomationSubflowsWorkspace(props: { projectId: string | null; flow: any; nativeNodeDefinitions: any[]; recordings: any[]; selectedNode: any; selectedTimeline: any; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId ?? "";
  const [subflows, setSubflows] = useState<any[]>([]);
  const [selectedSubflow, setSelectedSubflow] = useState<any | null>(null);
  const [selectedGraph, setSelectedGraph] = useState<any | null>(null);
  const [selectedGraphDraft, setSelectedGraphDraft] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [graphDirty, setGraphDirty] = useState(false);
  const [router, setRouter] = useState<any | null>(null);
  const [page, setPage] = useState({ limit: SUBFLOW_PAGE_SIZE, offset: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setSelectedSubflow(null);
    setSelectedGraph(null);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    setRouter(null);
    if (!props.projectId || !flowId) return;
    void loadSubflows(0);
    void loadRouter();
  }, [props.projectId, flowId]);
  const loadRouter = async () => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId });
    if (result.ok) setRouter(result.payload?.router ?? null);
  };
  const loadSubflows = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    const result = await api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-subflows", { projectId: props.projectId, flowId, limit: SUBFLOW_PAGE_SIZE, offset });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Subflows could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setSubflows(result.payload?.subflows ?? resultPage?.subflows ?? []);
    setPage({ limit: resultPage?.limit ?? SUBFLOW_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.subflows?.length ?? 0 });
  };
  const openSubflow = async (subflowId: string) => {
    if (!props.projectId || !flowId) return;
    setError("");
    const result = await api.post<{ subflow?: any }>("get-flow-subflow", { projectId: props.projectId, flowId, subflowId });
    if (!result.ok || !result.payload?.subflow) {
      setError(result.error ?? "Subflow detail could not be loaded.");
      return;
    }
    setSelectedSubflow(result.payload.subflow);
    await loadSubflowGraph(result.payload.subflow.graphFlowId ?? flowId);
  };
  const loadSubflowGraph = async (graphFlowId: string) => {
    if (!props.projectId || !graphFlowId) return;
    setLoadingGraph(true);
    setSelectedGraph(null);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    const result = await api.post<{ flow?: any }>("get-flow", { projectId: props.projectId, flowId: graphFlowId });
    setLoadingGraph(false);
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Subflow graph could not be loaded.");
      return;
    }
    setSelectedGraph(result.payload.flow);
  };
  const mutateSubflow = async (endpoint: string, payload: Record<string, unknown>) => {
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    const result = await api.post<{ subflow?: any }>(endpoint, { ...payload, authorizationPin });
    if (!result.ok) {
      setError(result.error ?? "Subflow change failed.");
      return;
    }
    if (result.payload?.subflow) setSelectedSubflow(result.payload.subflow);
    await loadSubflows(page.offset);
  };
  const createSubflow = async () => {
    if (!props.projectId || !flowId) return;
    const name = window.prompt("Subflow name");
    if (!name?.trim()) return;
    await mutateSubflow("create-flow-subflow", { projectId: props.projectId, flowId, name: name.trim(), role: "utility" });
  };
  const renameSubflow = async () => {
    if (!props.projectId || !flowId || !selectedSubflow?.subflowId) return;
    const name = window.prompt("Subflow name", selectedSubflow.name ?? "");
    if (!name?.trim()) return;
    await mutateSubflow("rename-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow.subflowId, name: name.trim() });
  };
  const saveSelectedSubflowGraph = async (graph: { nodes: any[]; edges: any[] }) => {
    if (!props.projectId || !selectedGraph) return false;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return false;
    const serializedGraph = graphToTaskFlow({
      task: { taskId: selectedGraph.flowId, name: selectedGraph.name } as any,
      existingFlow: { ...selectedGraph, ownerKind: "flow", ownerId: selectedGraph.flowId } as any,
      graph
    });
    const { regions: _regions, regionHandoffs: _regionHandoffs, ...flowWithoutEditorRegions } = selectedGraph;
    const result = await api.post<{ flow?: any }>("save-flow", {
      projectId: props.projectId,
      authorizationPin,
      flow: { ...flowWithoutEditorRegions, nodes: serializedGraph.nodes, edges: serializedGraph.edges }
    });
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Subflow graph could not be saved.");
      return false;
    }
    setSelectedGraph(result.payload.flow);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    return true;
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  const routerReferences = selectedSubflow ? routerReferencesForSubflow(router, selectedSubflow.subflowId) : [];
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Subflows</strong><span>{props.flow?.name ?? "Select a Flow"}</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId} onClick={createSubflow} type="button">Create</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Flow Subflows</strong><span>{loading ? "Loading..." : `${page.total ? page.offset + 1 : 0}-${Math.min(page.total, page.offset + subflows.length)} of ${page.total}`}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={loading || page.offset <= 0} onClick={() => loadSubflows(previousOffset)} type="button">Previous</button>
              <button disabled={loading || nextOffset >= page.total} onClick={() => loadSubflows(nextOffset)} type="button">Next</button>
            </div>
          </header>
          <DataTable columns={["Name", "Role", "Status", "Updated", "Stability", ""]} rows={subflows.map((subflow) => [
            <strong key={`${subflow.subflowId}:name`}>{subflow.name ?? subflow.subflowId}</strong>,
            subflow.role ?? "-",
            <StatusBadge key={`${subflow.subflowId}:status`} value={subflow.status ?? "active"} />,
            formatRuntimeTimestamp(subflow.updatedAt),
            `${subflow.stability?.successCount ?? 0}/${subflow.stability?.runCount ?? 0}`,
            <button className="automation-runtime-row-action" key={`${subflow.subflowId}:open`} onClick={() => openSubflow(subflow.subflowId)} type="button">Open</button>
          ])} empty={flowId ? "No subflows are defined for this Flow." : "Select a Flow to manage subflows."} />
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>{selectedSubflow?.name ?? "Subflow Detail"}</strong><span>{selectedSubflow?.subflowId ?? "Open a row to inspect details."}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={!selectedSubflow} onClick={renameSubflow} type="button">Rename</button>
              <button disabled={!selectedSubflow} onClick={() => mutateSubflow("disable-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow?.subflowId })} type="button">Disable</button>
              <button disabled={!selectedSubflow} onClick={() => mutateSubflow("archive-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow?.subflowId })} type="button">Archive</button>
            </div>
          </header>
          {selectedSubflow ? (
            <>
              <SummaryStrip items={[["Role", selectedSubflow.role ?? "-"], ["Status", selectedSubflow.status ?? "-"], ["Graph", selectedSubflow.graphFlowId ?? flowId], ["Instructions", selectedSubflow.localInstructionIds?.length ?? 0]]} />
              <DataTable columns={["Router Reference", "Status", "Order", "Condition"]} rows={routerReferences.map((reference) => [
                reference.name,
                <StatusBadge key={`${reference.id}:status`} value={reference.status} />,
                reference.order,
                reference.condition
              ])} empty="No router rules or fallback currently target this subflow." />
              <DataTable columns={["Mapping", "Source", "Target", "Required"]} rows={[...(selectedSubflow.inputMapping ?? []).map((item: any) => ["Input", item.flowInputId, item.subflowInputId, item.required ? "Yes" : "No"]), ...(selectedSubflow.outputMapping ?? []).map((item: any) => ["Output", item.subflowOutputId, item.flowOutputId, item.required ? "Yes" : "No"])]} empty="No input or output mappings configured." />
              <section className="automation-runtime-log-section">
                <header><strong>Graph</strong><span>{loadingGraph ? "Loading graph..." : graphDirty ? "Unsaved subflow graph changes" : selectedGraph?.flowId ?? "No graph loaded"}</span></header>
                {selectedGraph ? (
                  <div style={{ minHeight: 520 }}>
                    <AutomationPolicyCanvas
                      active
                      editable={selectedGraph?.source?.mode !== "code"}
                      entries={[]}
                      nativeNodeDefinitions={props.nativeNodeDefinitions}
                      onDirtyChange={setGraphDirty}
                      onGraphDraftChange={setSelectedGraphDraft}
                      onSaveGraph={saveSelectedSubflowGraph}
                      policy={null}
                      recordings={props.recordings}
                      selectedNode={props.selectedNode}
                      selectedTimeline={props.selectedTimeline}
                      setSelection={props.setSelection}
                      signals={props.signals}
                      taskGraph={selectedGraph}
                      taskGraphDraft={selectedGraphDraft}
                    />
                  </div>
                ) : <p className="automation-runtime-empty">{loadingGraph ? "Loading subflow graph..." : "No graph Flow is linked to this subflow."}</p>}
              </section>
              <JsonToggle label="Show Subflow JSON" value={selectedSubflow} />
            </>
          ) : <p className="automation-runtime-empty">No subflow selected.</p>}
        </section>
      </div>
    </section>
  );
}
export function AutomationProblemsWorkspace(props: { problems: any[] }) {
  return <DataTable columns={["Severity", "Artifact", "Message"]} rows={props.problems.map((problem) => [<StatusBadge key={problem.id} value={problem.severity} />, problem.artifactId ?? problem.artifactKind ?? "-", problem.message])} empty="No validation, runtime, or fixture problems are currently reported." />;
}

const RUNTIME_RUN_PAGE_SIZE = 25;
const RUNTIME_ACTION_PAGE_SIZE = 50;
const ADAPTATION_PAGE_SIZE = 25;
const ADAPTATION_STATUSES = ["proposed", "testing", "validated", "applied", "rejected", "disabled", "reverted", "superseded"];
const WORKBENCH_PAGE_SIZE = 25;

export function AutomationRouterWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [router, setRouter] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    void api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId }).then((result) => {
      setLoading(false);
      if (!result.ok) setError(result.error ?? "Router could not be loaded.");
      else setRouter(result.payload?.router ?? null);
    });
  }, [props.projectId, flowId]);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Router</strong><span>{loading ? "Loading..." : router?.name ?? "Deterministic Flow routing"}</span></div></header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <SummaryStrip items={[["Rules", router?.rules?.length ?? 0], ["Status", router?.status ?? "-"], ["Fallback", routerFallbackLabel(router)], ["Flow", flowId ?? "-"]]} />
      <section className="automation-runtime-log-section">
        <header><strong>Route Rules</strong><span>order-first</span></header>
        <DataTable columns={["Order", "Rule", "Status", "Target", "Condition"]} rows={(router?.rules ?? []).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0)).map((rule: any) => [
          rule.order ?? "-",
          rule.name ?? rule.ruleId,
          <StatusBadge key={`${rule.ruleId}:status`} value={rule.status ?? "active"} />,
          rule.target?.kind === "subflow" ? rule.target.subflowId : "-",
          rule.condition ? compactConditionLabel(rule.condition) : "Always"
        ])} empty={flowId ? "No router rules are defined for this Flow." : "Select a Flow to inspect routing."} />
      </section>
      <JsonToggle label="Show Router JSON" value={router ?? {}} />
    </section>
  );
}

export function AutomationInstructionsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [instructions, setInstructions] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: WORKBENCH_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedInstruction, setSelectedInstruction] = useState<any | null>(null);
  const [draftInstruction, setDraftInstruction] = useState({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
  const [error, setError] = useState("");
  useEffect(() => {
    setSelectedInstruction(null);
    setDraftInstruction({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
    if (!props.projectId || !flowId) return;
    void loadInstructions(0);
  }, [props.projectId, flowId]);
  const loadInstructions = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ instructions?: any[]; page?: { instructions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-instructions", { projectId: props.projectId, flowId, limit: WORKBENCH_PAGE_SIZE, offset });
    if (!result.ok) { setError(result.error ?? "Instructions could not be loaded."); return; }
    const resultPage = result.payload?.page;
    setInstructions(result.payload?.instructions ?? resultPage?.instructions ?? []);
    setPage({ limit: resultPage?.limit ?? WORKBENCH_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.instructions?.length ?? 0 });
  };
  const openInstructionSet = async (instructionId: string) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ instructions?: any[] }>("get-flow-instruction-set", { projectId: props.projectId, flowId });
    if (!result.ok) { setError(result.error ?? "Instruction detail could not be loaded."); return; }
    const instruction = (result.payload?.instructions ?? []).find((item) => item.instructionId === instructionId) ?? null;
    setSelectedInstruction(instruction);
    setDraftInstruction(instructionDraftFromInstruction(instruction));
  };
  const createInstruction = () => {
    setSelectedInstruction(null);
    setDraftInstruction({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
  };
  const saveInstruction = async () => {
    if (!props.projectId || !flowId) return;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    setError("");
    const result = await api.post<{ instruction?: any }>("save-flow-instruction", {
      projectId: props.projectId,
      flowId,
      authorizationPin,
      ...(draftInstruction.instructionId ? { instructionId: draftInstruction.instructionId } : {}),
      title: draftInstruction.title,
      body: draftInstruction.body,
      scopeKind: draftInstruction.scopeKind,
      priority: draftInstruction.priority,
      requirement: draftInstruction.requirement,
      status: draftInstruction.status
    });
    if (!result.ok || !result.payload?.instruction) {
      setError(result.error ?? "Instruction could not be saved.");
      return;
    }
    setSelectedInstruction(result.payload.instruction);
    setDraftInstruction(instructionDraftFromInstruction(result.payload.instruction));
    await loadInstructions(page.offset);
  };
  const diagnostics = instructionDiagnostics(selectedInstruction ? [selectedInstruction] : instructions);
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Instructions</strong><span>Scoped prompt guidance and precedence</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId} onClick={createInstruction} type="button">New</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-instructions-workspace">
        <section className="automation-instruction-list-pane">
          <header>
            <div><strong>Instruction Library</strong><span>{page.total ? `${page.offset + 1}-${Math.min(page.total, page.offset + instructions.length)} of ${page.total}` : "0 instructions"}</span></div>
          </header>
          <div className="automation-instruction-list">
            {instructions.map((instruction) => {
              const selected = selectedInstruction?.instructionId === instruction.instructionId;
              return (
                <button className={selected ? "selected" : ""} key={instruction.instructionId} onClick={() => openInstructionSet(instruction.instructionId)} type="button">
                  <span className="automation-instruction-title">{instruction.title ?? instruction.instructionId}</span>
                  <span className="automation-instruction-meta">{instruction.scopeKind ?? instruction.scope?.kind ?? "flow"} | priority {instruction.priority ?? 0}</span>
                  <span className="automation-instruction-footer">
                    <StatusBadge value={instruction.status ?? "active"} />
                    <small>{instruction.requirement ?? "advisory"}</small>
                  </span>
                </button>
              );
            })}
            {!instructions.length ? <p className="automation-runtime-empty">{flowId ? "No scoped instructions are defined." : "Select a Flow to review instructions."}</p> : null}
          </div>
        </section>
        <section className="automation-instruction-editor-pane">
          <header>
            <div><strong>Instruction Editor</strong><span>{selectedInstruction?.instructionId ?? "New instruction"}</span></div>
            <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId || !draftInstruction.title.trim() || !draftInstruction.body.trim()} onClick={saveInstruction} type="button">Save</button>
          </header>
          <div className="automation-instruction-editor-card">
            <label><span>Title</span><input value={draftInstruction.title} onChange={(event) => setDraftInstruction((current) => ({ ...current, title: event.target.value }))} placeholder="Instruction title" /></label>
            <label><span>Scope</span><select value={draftInstruction.scopeKind} onChange={(event) => setDraftInstruction((current) => ({ ...current, scopeKind: event.target.value }))}>
              <option value="flow">Flow</option>
              <option value="router">Router</option>
              <option value="subflow">Subflow</option>
              <option value="node">Node</option>
              <option value="on_error">On Error</option>
              <option value="adaptation_review">Adaptation Review</option>
            </select></label>
            <label><span>Requirement</span><select value={draftInstruction.requirement} onChange={(event) => setDraftInstruction((current) => ({ ...current, requirement: event.target.value }))}>
              <option value="advisory">Advisory</option>
              <option value="required">Required</option>
            </select></label>
            <label><span>Status</span><select value={draftInstruction.status} onChange={(event) => setDraftInstruction((current) => ({ ...current, status: event.target.value }))}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </select></label>
            <label><span>Priority</span><input type="number" value={draftInstruction.priority} onChange={(event) => setDraftInstruction((current) => ({ ...current, priority: Number(event.target.value) }))} /></label>
            <label className="automation-instruction-body-field"><span>Body</span><textarea rows={9} value={draftInstruction.body} onChange={(event) => setDraftInstruction((current) => ({ ...current, body: event.target.value }))} placeholder="Tell FluxIQ what to prefer, avoid, require, or clarify for this Flow." /></label>
          </div>
          <section className="automation-instruction-diagnostics">
            <header><strong>Diagnostics</strong><span>{diagnostics.length ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}` : "Clean"}</span></header>
            {diagnostics.length ? diagnostics.map((diagnostic) => <article key={diagnostic.code}><strong>{diagnostic.code}</strong><span>{diagnostic.message}</span></article>) : <p>No instruction conflicts detected.</p>}
          </section>
          {selectedInstruction ? <JsonToggle label="Show Instruction JSON" value={selectedInstruction} /> : null}
        </section>
      </div>
    </section>
  );
}

export function AutomationChangeProposalsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [proposals, setProposals] = useState<any[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    void api.post<{ changeProposals?: any[]; page?: { changeProposals?: any[] } }>("list-flow-change-proposals", { projectId: props.projectId, flowId, limit: WORKBENCH_PAGE_SIZE, offset: 0 }).then((result) => {
      if (!result.ok) setError(result.error ?? "Change proposals could not be loaded.");
      else setProposals(result.payload?.changeProposals ?? result.payload?.page?.changeProposals ?? []);
    });
  }, [props.projectId, flowId]);
  const openProposal = async (proposalId: string) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ changeProposal?: any }>("get-flow-change-proposal", { projectId: props.projectId, flowId, proposalId });
    if (!result.ok) { setError(result.error ?? "Change proposal detail could not be loaded."); return; }
    setSelectedProposal(result.payload?.changeProposal ?? null);
  };
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Change Proposals</strong><span>Approval gates for generated edits</span></div></header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <DataTable columns={["Proposal", "Mode", "Status", "Risk", "Patches", ""]} rows={proposals.map((proposal) => [
            proposal.proposalId,
            proposal.mode ?? "-",
            <StatusBadge key={`${proposal.proposalId}:status`} value={proposal.status ?? "pending"} />,
            proposal.riskLevel ?? "-",
            proposal.patchCount ?? proposal.patches?.length ?? 0,
            <button className="automation-runtime-row-action" key={`${proposal.proposalId}:open`} onClick={() => openProposal(proposal.proposalId)} type="button">Open</button>
          ])} empty={flowId ? "No change proposals are waiting for this Flow." : "Select a Flow to review change proposals."} />
        </section>
        <section className="automation-runtime-log-page">
          <header><div><strong>Diff Preview</strong><span>{selectedProposal?.proposalId ?? "No proposal selected"}</span></div>{selectedProposal ? <StatusBadge value={selectedProposal.status ?? "pending"} /> : null}</header>
          <DataTable columns={["Kind", "Target", "Summary", "Before", "After"]} rows={(selectedProposal?.patches ?? []).map((patch: any, index: number) => [
            patch.kind ?? "-",
            patch.targetId ?? "-",
            patch.summary ?? "-",
            <JsonToggle key={`${index}:before`} label="Before JSON" value={patch.before ?? {}} />,
            <JsonToggle key={`${index}:after`} label="After JSON" value={patch.after ?? {}} />
          ])} empty="Select a proposal to inspect its patch diff." />
          {selectedProposal ? <JsonToggle label="Show Proposal JSON" value={selectedProposal} /> : null}
        </section>
      </div>
    </section>
  );
}

type FlowSettingsDraft = {
  name: string;
  description: string;
  visibility: "private" | "public";
  trainingMode: "normal" | "train_for_runs" | "train_until_stable" | "continuous_adaptive";
  trainForRunCount: string;
  minimumStabilityScore: string;
  proposalApprovalMode: "auto" | "manual" | "mixed";
  requireFirstManualReviewBeforeAutoPromotion: boolean;
  adaptationPreset: "locked" | "observe" | "adaptive" | "autonomous";
  adaptationProposalMode: "auto" | "manual" | "mixed";
  manualReviewForStructuralChanges: boolean;
  allowLlmIntervention: boolean;
  allowRuntimeRecovery: boolean;
  allowAdaptationCreation: boolean;
  allowPromotion: boolean;
  allowCreateRecoveryPaths: boolean;
  allowModifySubflows: boolean;
  allowCreateSubflows: boolean;
  allowModifyRouter: boolean;
  allowModifyExpectations: boolean;
  allowModifyActionTargets: boolean;
  allowDeleteOrDisableBehavior: boolean;
  requireApprovalForDestructiveChanges: boolean;
  maxInterventionsPerRun: string;
  maxTokensPerRun: string;
  maxCostUsdPerTrainingWindow: string;
  maxAdaptationInterventionsPerRun: string;
  maxAdaptationCostUsdPerRun: string;
  budgetExhaustedBehavior: "ask" | "stop";
  llmProvider: string;
  adaptationPolicyId: string;
};

export function AutomationFlowSettingsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const [savedFlow, setSavedFlow] = useState<any | null>(null);
  const flow = savedFlow?.flowId && savedFlow.flowId === props.flow?.flowId ? savedFlow : props.flow;
  const metadata = flowSettingsMetadata(flow);
  const [draft, setDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSavedFlow(null);
    setDraft(flowSettingsDraftFromFlow(props.flow));
    setMessage("");
    setError("");
  }, [props.flow?.flowId]);
  const updateDraft = <K extends keyof FlowSettingsDraft>(key: K, value: FlowSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const saveSettings = async () => {
    if (!props.projectId || !flow?.flowId) return;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    setSaving(true);
    setMessage("");
    setError("");
    const result = await api.post<{ flow?: any }>("save-flow", {
      projectId: props.projectId,
      authorizationPin,
      flow: buildFlowSettingsSavePayload(flow, draft)
    });
    setSaving(false);
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Flow settings could not be saved.");
      return;
    }
    setSavedFlow(result.payload.flow);
    setDraft(flowSettingsDraftFromFlow(result.payload.flow));
    setMessage("Settings saved.");
  };
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace">
      <header>
        <div><strong>Settings</strong><span>{flow?.name ?? "Select a Flow"} | training, approval, LLM, and safety gates</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flow?.flowId || saving} onClick={() => void saveSettings()} type="button">{saving ? "Saving..." : "Save Settings"}</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      {message ? <p className="automation-settings-success">{message}</p> : null}
      <div className="automation-flow-settings-grid">
        <section className="automation-settings-panel">
          <header><strong>Flow Identity</strong><span>Name, description, and catalog visibility</span></header>
          <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Flow name" /></label>
          <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this Flow is responsible for." /></label>
          <label><span>Visibility</span><select value={draft.visibility} onChange={(event) => updateDraft("visibility", event.target.value as FlowSettingsDraft["visibility"])}><option value="private">Private</option><option value="public">Public composite candidate</option></select></label>
        </section>
        <section className="automation-settings-panel">
          <header><strong>Training Mode</strong><span>How much help the runtime may ask from the LLM</span></header>
          <label><span>Mode</span><select value={draft.trainingMode} onChange={(event) => updateDraft("trainingMode", event.target.value as FlowSettingsDraft["trainingMode"])}><option value="normal">No LLM intervention</option><option value="train_for_runs">Train for fixed runs</option><option value="train_until_stable">Train until stable</option><option value="continuous_adaptive">Continuous adaptive</option></select></label>
          <div className="automation-settings-inline-fields">
            <label><span>Train runs</span><input min={0} type="number" value={draft.trainForRunCount} onChange={(event) => updateDraft("trainForRunCount", event.target.value)} /></label>
            <label><span>Stability target</span><input max={1} min={0} step={0.01} type="number" value={draft.minimumStabilityScore} onChange={(event) => updateDraft("minimumStabilityScore", event.target.value)} /></label>
          </div>
          <label><span>Adaptation approval</span><select value={draft.proposalApprovalMode} onChange={(event) => updateDraft("proposalApprovalMode", event.target.value as FlowSettingsDraft["proposalApprovalMode"])}><option value="auto">Auto-apply safe edits</option><option value="manual">Manual approval only</option><option value="mixed">Manual for risky edits</option></select></label>
        </section>
        <section className="automation-settings-panel">
          <header><strong>Runtime Safety</strong><span>Deterministic gates before learned changes become behavior</span></header>
          <SettingsToggle checked={draft.allowRuntimeRecovery} label="Allow runtime recovery" onChange={(checked) => updateDraft("allowRuntimeRecovery", checked)} />
          <SettingsToggle checked={draft.allowLlmIntervention} label="Allow LLM intervention" onChange={(checked) => updateDraft("allowLlmIntervention", checked)} />
          <SettingsToggle checked={draft.allowAdaptationCreation} label="Create adaptations" onChange={(checked) => updateDraft("allowAdaptationCreation", checked)} />
          <SettingsToggle checked={draft.allowPromotion} label="Auto-apply low-risk fixes" onChange={(checked) => updateDraft("allowPromotion", checked)} />
          <SettingsToggle checked={draft.requireFirstManualReviewBeforeAutoPromotion} label="Require first manual review" onChange={(checked) => updateDraft("requireFirstManualReviewBeforeAutoPromotion", checked)} />
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide">
          <header><strong>Adaptations</strong><span>What the runtime may learn, propose, edit, and promote</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Policy preset</span><select value={draft.adaptationPreset} onChange={(event) => updateDraft("adaptationPreset", event.target.value as FlowSettingsDraft["adaptationPreset"])}><option value="locked">Locked</option><option value="observe">Observe only</option><option value="adaptive">Adaptive</option><option value="autonomous">Autonomous</option></select></label>
            <label><span>Adaptation approval mode</span><select value={draft.adaptationProposalMode} onChange={(event) => updateDraft("adaptationProposalMode", event.target.value as FlowSettingsDraft["adaptationProposalMode"])}><option value="auto">Auto-apply safe validated changes</option><option value="manual">Manual approval only</option><option value="mixed">Manual for risky changes</option></select></label>
          </div>
          <div className="automation-settings-toggle-grid">
            <SettingsToggle checked={draft.manualReviewForStructuralChanges} label="Manual review for structural changes" onChange={(checked) => updateDraft("manualReviewForStructuralChanges", checked)} />
            <SettingsToggle checked={draft.allowCreateRecoveryPaths} label="Create recovery paths" onChange={(checked) => updateDraft("allowCreateRecoveryPaths", checked)} />
            <SettingsToggle checked={draft.allowModifyRouter} label="Modify router rules" onChange={(checked) => updateDraft("allowModifyRouter", checked)} />
            <SettingsToggle checked={draft.allowModifySubflows} label="Modify subflows" onChange={(checked) => updateDraft("allowModifySubflows", checked)} />
            <SettingsToggle checked={draft.allowCreateSubflows} label="Create subflows" onChange={(checked) => updateDraft("allowCreateSubflows", checked)} />
            <SettingsToggle checked={draft.allowModifyExpectations} label="Modify expectations" onChange={(checked) => updateDraft("allowModifyExpectations", checked)} />
            <SettingsToggle checked={draft.allowModifyActionTargets} label="Modify action targets" onChange={(checked) => updateDraft("allowModifyActionTargets", checked)} />
            <SettingsToggle checked={draft.allowDeleteOrDisableBehavior} label="Delete or disable behavior" onChange={(checked) => updateDraft("allowDeleteOrDisableBehavior", checked)} />
            <SettingsToggle checked={draft.requireApprovalForDestructiveChanges} label="Require approval for destructive changes" onChange={(checked) => updateDraft("requireApprovalForDestructiveChanges", checked)} />
          </div>
          <div className="automation-settings-inline-fields">
            <label><span>Adaptation interventions/run</span><input min={0} type="number" value={draft.maxAdaptationInterventionsPerRun} onChange={(event) => updateDraft("maxAdaptationInterventionsPerRun", event.target.value)} /></label>
            <label><span>Adaptation cost/run</span><input min={0} step={0.01} type="number" value={draft.maxAdaptationCostUsdPerRun} onChange={(event) => updateDraft("maxAdaptationCostUsdPerRun", event.target.value)} /></label>
          </div>
        </section>
        <section className="automation-settings-panel">
          <header><strong>LLM Budget</strong><span>Caps for intervention frequency, token use, and spend</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Max interventions/run</span><input min={0} type="number" value={draft.maxInterventionsPerRun} onChange={(event) => updateDraft("maxInterventionsPerRun", event.target.value)} /></label>
            <label><span>Max tokens/run</span><input min={0} type="number" value={draft.maxTokensPerRun} onChange={(event) => updateDraft("maxTokensPerRun", event.target.value)} /></label>
          </div>
          <label><span>Max cost/training window</span><input min={0} step={0.01} type="number" value={draft.maxCostUsdPerTrainingWindow} onChange={(event) => updateDraft("maxCostUsdPerTrainingWindow", event.target.value)} /></label>
          <label><span>When exhausted</span><select value={draft.budgetExhaustedBehavior} onChange={(event) => updateDraft("budgetExhaustedBehavior", event.target.value as FlowSettingsDraft["budgetExhaustedBehavior"])}><option value="ask">Ask before continuing</option><option value="stop">Stop training</option></select></label>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide">
          <header><strong>Provider and Policy</strong><span>Host model boundary plus the adaptation policy used by this Flow</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>LLM provider</span><input value={draft.llmProvider} onChange={(event) => updateDraft("llmProvider", event.target.value)} placeholder="host" /></label>
            <label><span>Adaptation policy ID</span><input value={draft.adaptationPolicyId} onChange={(event) => updateDraft("adaptationPolicyId", event.target.value)} placeholder="policy/default" /></label>
          </div>
          <DataTable columns={["Setting", "Current"]} rows={[
            ["Instruction precedence", "global -> project -> Flow -> router -> subflow -> node -> on-error -> review"],
            ["Source ownership", flow?.source?.mode ?? "visual"],
            ["Publication", flow?.publication?.status ?? "draft"],
            ["Frozen scopes", metadata.frozenScopeCount ?? 0]
          ]} empty="No settings." />
        </section>
      </div>
      <JsonToggle label="Show Flow Settings JSON" value={metadata} />
    </section>
  );
}

function SettingsToggle(props: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return <label className="automation-settings-toggle"><input checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} type="checkbox" /><span>{props.label}</span></label>;
}

function flowSettingsDraftFromFlow(flow: any): FlowSettingsDraft {
  const metadata = flowSettingsMetadata(flow);
  const trainingSettings = metadata.trainingModeSettings && typeof metadata.trainingModeSettings === "object" ? metadata.trainingModeSettings : {};
  const adaptationSettings = metadata.adaptationPolicySettings && typeof metadata.adaptationPolicySettings === "object" ? metadata.adaptationPolicySettings : {};
  const budgets = trainingSettings.budgets && typeof trainingSettings.budgets === "object" ? trainingSettings.budgets : {};
  const trainingMode = flowSettingsTrainingMode(trainingSettings.mode ?? metadata.trainingMode);
  const proposalApprovalMode = flowSettingsProposalMode(trainingSettings.proposalApprovalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode);
  const adaptationProposalMode = flowSettingsProposalMode(adaptationSettings.proposalMode ?? proposalApprovalMode);
  return {
    name: String(flow?.name ?? ""),
    description: String(flow?.description ?? ""),
    visibility: flow?.visibility === "public" ? "public" : "private",
    trainingMode,
    trainForRunCount: numberInputValue(trainingSettings.trainForRunCount ?? metadata.trainForRunCount),
    minimumStabilityScore: numberInputValue(trainingSettings.minimumStabilityScore ?? metadata.minimumStabilityScore),
    proposalApprovalMode,
    requireFirstManualReviewBeforeAutoPromotion: booleanSetting(trainingSettings.requireFirstManualReviewBeforeAutoPromotion ?? metadata.requireFirstManualReviewBeforeAutoPromotion, false),
    adaptationPreset: flowSettingsAdaptationPreset(adaptationSettings.preset),
    adaptationProposalMode,
    manualReviewForStructuralChanges: booleanSetting(adaptationSettings.manualReviewForStructuralChanges ?? metadata.manualReviewForStructuralChanges, true),
    allowLlmIntervention: booleanSetting(trainingSettings.allowLlmIntervention, trainingMode !== "normal"),
    allowRuntimeRecovery: booleanSetting(trainingSettings.allowRuntimeRecovery, true),
    allowAdaptationCreation: booleanSetting(trainingSettings.allowAdaptationCreation, trainingMode !== "normal"),
    allowPromotion: booleanSetting(trainingSettings.allowPromotion, trainingMode === "continuous_adaptive"),
    allowCreateRecoveryPaths: booleanSetting(adaptationSettings.allowCreateRecoveryPaths, true),
    allowModifySubflows: booleanSetting(adaptationSettings.allowModifySubflows, true),
    allowCreateSubflows: booleanSetting(adaptationSettings.allowCreateSubflows, true),
    allowModifyRouter: booleanSetting(adaptationSettings.allowModifyRouter, true),
    allowModifyExpectations: booleanSetting(adaptationSettings.allowModifyExpectations, true),
    allowModifyActionTargets: booleanSetting(adaptationSettings.allowModifyActionTargets, true),
    allowDeleteOrDisableBehavior: booleanSetting(adaptationSettings.allowDeleteOrDisableBehavior, false),
    requireApprovalForDestructiveChanges: booleanSetting(adaptationSettings.requireApprovalForDestructiveChanges, true),
    maxInterventionsPerRun: numberInputValue(budgets.maxInterventionsPerRun ?? metadata.maxInterventionsPerRun),
    maxTokensPerRun: numberInputValue(budgets.maxTokensPerRun ?? metadata.maxTokensPerRun),
    maxCostUsdPerTrainingWindow: numberInputValue(budgets.maxCostUsdPerTrainingWindow ?? metadata.maxCostUsdPerTrainingWindow),
    maxAdaptationInterventionsPerRun: numberInputValue(adaptationSettings.maxInterventionsPerRun),
    maxAdaptationCostUsdPerRun: numberInputValue(adaptationSettings.maxEstimatedCostUsdPerRun),
    budgetExhaustedBehavior: budgets.exhaustedBehavior === "stop" || metadata.budgetExhaustedBehavior === "stop" ? "stop" : "ask",
    llmProvider: String(metadata.llmProvider ?? ""),
    adaptationPolicyId: String(metadata.adaptationPolicyId ?? "")
  };
}

function buildFlowSettingsSavePayload(flow: any, draft: FlowSettingsDraft) {
  const metadata = flowSettingsMetadata(flow);
  const { llmProvider: _oldLlmProvider, adaptationPolicyId: _oldAdaptationPolicyId, ...retainedMetadata } = metadata;
  const llmProvider = draft.llmProvider.trim();
  const adaptationPolicyId = draft.adaptationPolicyId.trim();
  const trainingModeSettings = {
    mode: draft.trainingMode,
    ...(numberOrUndefined(draft.trainForRunCount) !== undefined ? { trainForRunCount: numberOrUndefined(draft.trainForRunCount) } : {}),
    ...(numberOrUndefined(draft.minimumStabilityScore) !== undefined ? { minimumStabilityScore: numberOrUndefined(draft.minimumStabilityScore) } : {}),
    allowLlmIntervention: draft.allowLlmIntervention,
    allowRuntimeRecovery: draft.allowRuntimeRecovery,
    allowAdaptationCreation: draft.allowAdaptationCreation,
    proposalApprovalMode: draft.proposalApprovalMode,
    allowPromotion: draft.allowPromotion,
    requireFirstManualReviewBeforeAutoPromotion: draft.requireFirstManualReviewBeforeAutoPromotion,
    budgets: {
      ...(numberOrUndefined(draft.maxInterventionsPerRun) !== undefined ? { maxInterventionsPerRun: numberOrUndefined(draft.maxInterventionsPerRun) } : {}),
      ...(numberOrUndefined(draft.maxTokensPerRun) !== undefined ? { maxTokensPerRun: numberOrUndefined(draft.maxTokensPerRun) } : {}),
      ...(numberOrUndefined(draft.maxCostUsdPerTrainingWindow) !== undefined ? { maxCostUsdPerTrainingWindow: numberOrUndefined(draft.maxCostUsdPerTrainingWindow) } : {}),
      exhaustedBehavior: draft.budgetExhaustedBehavior
    }
  };
  const adaptationPolicySettings = {
    preset: draft.adaptationPreset,
    proposalMode: draft.adaptationProposalMode,
    manualReviewForStructuralChanges: draft.manualReviewForStructuralChanges,
    allowRuntimeRecovery: draft.allowRuntimeRecovery,
    allowCreateRecoveryPaths: draft.allowCreateRecoveryPaths,
    allowModifySubflows: draft.allowModifySubflows,
    allowCreateSubflows: draft.allowCreateSubflows,
    allowModifyRouter: draft.allowModifyRouter,
    allowModifyExpectations: draft.allowModifyExpectations,
    allowModifyActionTargets: draft.allowModifyActionTargets,
    allowDeleteOrDisableBehavior: draft.allowDeleteOrDisableBehavior,
    requireApprovalForDestructiveChanges: draft.requireApprovalForDestructiveChanges,
    ...(numberOrUndefined(draft.maxAdaptationInterventionsPerRun) !== undefined ? { maxInterventionsPerRun: numberOrUndefined(draft.maxAdaptationInterventionsPerRun) } : {}),
    ...(numberOrUndefined(draft.maxAdaptationCostUsdPerRun) !== undefined ? { maxEstimatedCostUsdPerRun: numberOrUndefined(draft.maxAdaptationCostUsdPerRun) } : {})
  };
  return {
    ...flow,
    name: draft.name.trim() || flow.name,
    description: draft.description.trim(),
    visibility: draft.visibility,
    metadata: {
      ...retainedMetadata,
      trainingMode: draft.trainingMode,
      proposalMode: draft.proposalApprovalMode,
      proposalApprovalMode: draft.proposalApprovalMode,
      requireFirstManualReviewBeforeAutoPromotion: draft.requireFirstManualReviewBeforeAutoPromotion,
      manualReviewForStructuralChanges: draft.manualReviewForStructuralChanges,
      trainingModeSettings,
      adaptationPolicySettings,
      budgetExhaustedBehavior: draft.budgetExhaustedBehavior,
      ...(llmProvider ? { llmProvider } : {}),
      ...(adaptationPolicyId ? { adaptationPolicyId } : {})
    }
  };
}

function flowSettingsMetadata(flow: any) {
  const existingMetadata = flow?.metadata ?? {};
  const trainingModeSettings = {
    mode: "continuous_adaptive",
    trainForRunCount: 3,
    minimumStabilityScore: 0.9,
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    requireFirstManualReviewBeforeAutoPromotion: false,
    budgets: {
      maxInterventionsPerRun: 2,
      maxTokensPerRun: 12000,
      maxCostUsdPerTrainingWindow: 5,
      exhaustedBehavior: "ask"
    }
  };
  const adaptationPolicySettings = {
    preset: "adaptive",
    proposalMode: "auto",
    manualReviewForStructuralChanges: true,
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1
  };
  const existingAdaptationSettings = existingMetadata.adaptationPolicySettings && typeof existingMetadata.adaptationPolicySettings === "object" ? existingMetadata.adaptationPolicySettings : {};
  const mergedTrainingModeSettings = {
    ...trainingModeSettings,
    ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" ? existingMetadata.trainingModeSettings : {}),
    budgets: {
      ...trainingModeSettings.budgets,
      ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" && existingMetadata.trainingModeSettings.budgets && typeof existingMetadata.trainingModeSettings.budgets === "object" ? existingMetadata.trainingModeSettings.budgets : {})
    }
  };
  return {
    trainingMode: trainingModeSettings.mode,
    proposalMode: trainingModeSettings.proposalApprovalMode,
    proposalApprovalMode: trainingModeSettings.proposalApprovalMode,
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    adaptationPolicySettings: { ...adaptationPolicySettings, ...existingAdaptationSettings },
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0,
    ...existingMetadata,
    trainingModeSettings: mergedTrainingModeSettings
  };
}

function flowSettingsTrainingMode(value: unknown): FlowSettingsDraft["trainingMode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "continuous_adaptive" ? value : "normal";
}

function flowSettingsProposalMode(value: unknown): FlowSettingsDraft["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

function flowSettingsAdaptationPreset(value: unknown): FlowSettingsDraft["adaptationPreset"] {
  return value === "locked" || value === "observe" || value === "autonomous" ? value : "adaptive";
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberInputValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function AutomationAdaptationsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [status, setStatus] = useState("proposed");
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedAdaptation, setSelectedAdaptation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    void loadAdaptations(status, 0);
  }, [props.projectId, flowId, status]);
  const loadAdaptations = async (nextStatus: string, offset: number) => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    const result = await api.post<{ adaptations?: any[]; page?: { adaptations?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-adaptations", { projectId: props.projectId, flowId, status: nextStatus, limit: ADAPTATION_PAGE_SIZE, offset });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Adaptations could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setAdaptations(result.payload?.adaptations ?? resultPage?.adaptations ?? []);
    setPage({ limit: resultPage?.limit ?? ADAPTATION_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.adaptations?.length ?? 0 });
  };
  const openAdaptation = async (adaptationId: string) => {
    if (!props.projectId || !flowId) return;
    setLoadingDetail(true);
    setError("");
    const result = await api.post<{ adaptation?: any }>("get-flow-adaptation", { projectId: props.projectId, flowId, adaptationId });
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.adaptation) {
      setError(result.error ?? "Adaptation detail could not be loaded.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
  };
  const reviewAdaptation = async (action: string) => {
    if (!props.projectId || !flowId || !selectedAdaptation) return;
    const authorizationPin = window.prompt(`Enter PIN to ${action.replace(/_/g, " ")} this adaptation`) ?? "";
    if (!authorizationPin) return;
    const reason = action === "reject" || action === "supersede" ? window.prompt("Reason") ?? "" : "";
    const result = await api.post<{ adaptation?: any }>("review-flow-adaptation", { projectId: props.projectId, flowId, adaptationId: selectedAdaptation.adaptationId, action, authorizationPin, ...(reason ? { reason } : {}) });
    if (!result.ok) {
      setError(result.error ?? "Adaptation review action failed.");
      return;
    }
    setSelectedAdaptation(result.payload?.adaptation ?? null);
    void loadAdaptations(status, page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Adaptations</strong><span>Review runtime fixes and promotion evidence</span></div></header>
      <AutomationTrainingStatusPanel status={{ mode: props.flow?.metadata?.trainingMode ?? "normal", runsCompleted: 0, stabilityScore: props.flow?.metadata?.stabilityScore ?? 0, learnedChangeCount: 0, pendingProposalCount: 0, uncertainty: [], frozenScopeCount: props.flow?.metadata?.frozenScopeCount ?? 0 }} />
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Inbox</strong><span>{loading ? "Loading..." : `${page.total ? page.offset + 1 : 0}-${Math.min(page.total, page.offset + adaptations.length)} of ${page.total}`}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={loading || page.offset <= 0} onClick={() => loadAdaptations(status, previousOffset)} type="button">Previous</button>
              <button disabled={loading || nextOffset >= page.total} onClick={() => loadAdaptations(status, nextOffset)} type="button">Next</button>
            </div>
          </header>
          <div className="automation-runtime-log-toolbar">
            <div>{ADAPTATION_STATUSES.map((item) => <button className={item === status ? "button button-primary" : "button"} key={item} onClick={() => { setStatus(item); setSelectedAdaptation(null); }} type="button">{item}</button>)}</div>
          </div>
          <DataTable columns={["Trigger", "Risk", "Updated", "Status", ""]} rows={adaptations.map((adaptation) => [
            adaptation.trigger ?? adaptation.adaptationId,
            <StatusBadge key={`${adaptation.adaptationId}:risk`} value={adaptation.riskLevel ?? "low"} />,
            formatRuntimeTimestamp(adaptation.updatedAt),
            <StatusBadge key={`${adaptation.adaptationId}:status`} value={adaptation.status ?? "proposed"} />,
            <button className="automation-runtime-row-action" key={`${adaptation.adaptationId}:open`} onClick={() => openAdaptation(adaptation.adaptationId)} type="button">Open</button>
          ])} empty={flowId ? "No adaptations in this status." : "Select a Flow to review adaptations."} />
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>Adaptation Detail</strong><span>{loadingDetail ? "Loading..." : selectedAdaptation?.adaptationId ?? "No adaptation selected"}</span></div>
            {selectedAdaptation ? <StatusBadge value={selectedAdaptation.status ?? "proposed"} /> : null}
          </header>
          {selectedAdaptation ? <>
            <SummaryStrip items={[
              ["Risk", selectedAdaptation.riskLevel ?? "-"],
              ["Author", selectedAdaptation.author ?? "-"],
              ["Validations", selectedAdaptation.validationResults?.length ?? 0],
              ["Confidence", selectedAdaptation.metadata?.confidenceScore ?? "-"],
              ["Auto Apply", selectedAdaptation.metadata?.approvalDecision?.autoApply === true ? "yes" : selectedAdaptation.metadata?.approvalDecision ? "no" : "-"]
            ]} />
            <DataTable columns={["Field", "Value"]} rows={[
              ["Trigger", selectedAdaptation.trigger ?? "-"],
              ["Diagnosis", selectedAdaptation.diagnosis ?? "-"],
              ["Source Run", selectedAdaptation.sourceRunId ?? "-"],
              ["Proposal", selectedAdaptation.proposalId ?? "-"],
              ["Approval reason", selectedAdaptation.metadata?.approvalDecision?.reason ?? "-"]
            ]} empty="No detail." />
            {selectedAdaptation.metadata?.approvalDecision ? <section className="automation-runtime-log-section">
              <header><strong>Approval Decision</strong><span>{selectedAdaptation.metadata.approvalDecision.decisionId ?? "runtime decision"}</span></header>
              <DataTable columns={["Mode", "Risk", "Validation", "Manual", "Reason"]} rows={[[
                selectedAdaptation.metadata.approvalDecision.mode ?? "-",
                selectedAdaptation.metadata.approvalDecision.risk ?? selectedAdaptation.riskLevel ?? "-",
                selectedAdaptation.metadata.approvalDecision.validationStatus ?? "-",
                selectedAdaptation.metadata.approvalDecision.requiresManualApproval ? "required" : "not required",
                selectedAdaptation.metadata.approvalDecision.reason ?? "-"
              ]]} empty="No approval decision." />
            </section> : null}
            <section className="automation-runtime-log-section">
              <header><strong>Patch Diff</strong><span>{selectedAdaptation.patch?.length ?? 0} patches</span></header>
              <DataTable columns={["Kind", "Target", "Summary", "Before", "After"]} rows={(selectedAdaptation.patch ?? []).map((patch: any, index: number) => [
                patch.kind ?? "-",
                patch.targetId ?? "-",
                patch.summary ?? "-",
                <JsonToggle key={`${index}:before`} label="Before JSON" value={patch.before ?? {}} />,
                <JsonToggle key={`${index}:after`} label="After JSON" value={patch.after ?? {}} />
              ])} empty="No patches." />
            </section>
            {selectedAdaptation.metadata?.applicationRecord?.mutations?.length ? <section className="automation-runtime-log-section">
              <header><strong>Applied Changes</strong><span>{selectedAdaptation.metadata.applicationRecord.mutations.length} durable mutations</span></header>
              <DataTable columns={["Patch", "Artifact", "Target", "Before", "After"]} rows={selectedAdaptation.metadata.applicationRecord.mutations.map((mutation: any, index: number) => [
                mutation.patchKind ?? "-",
                `${mutation.artifactKind ?? "artifact"}:${mutation.artifactId ?? "-"}`,
                `${mutation.targetKind ?? "target"}:${mutation.targetId ?? "-"}`,
                <JsonToggle key={`${index}:mutation-before`} label="Before JSON" value={mutation.before ?? {}} />,
                <JsonToggle key={`${index}:mutation-after`} label="After JSON" value={mutation.after ?? {}} />
              ])} empty="No durable application record." />
            </section> : null}
            <section className="automation-runtime-log-section">
              <header><strong>Review Actions</strong><span>PIN required</span></header>
              <div className="automation-runtime-json-actions">
                {["approve", "reject", "apply", "disable", "revert", "supersede", "request_validation", "switch_manual"].map((action) => <button className="button" key={action} onClick={() => reviewAdaptation(action)} type="button">{action.replace(/_/g, " ")}</button>)}
              </div>
            </section>
            <JsonToggle label="Show Adaptation JSON" value={selectedAdaptation} />
          </> : <p className="automation-runtime-empty">Select an adaptation to inspect its evidence, patch, validations, and promotion controls.</p>}
        </section>
      </div>
    </section>
  );
}

export function AutomationTrainingStatusPanel(props: { status: { mode: string; runsCompleted: number; stabilityScore: number; learnedChangeCount: number; pendingProposalCount: number; uncertainty: any[]; frozenScopeCount: number } }) {
  const status = props.status;
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Training Status</strong><span>{status.mode}</span></header>
      <SummaryStrip items={[
        ["Runs", status.runsCompleted],
        ["Stability", `${Math.round(status.stabilityScore * 100)}%`],
        ["Learned", status.learnedChangeCount],
        ["Pending", status.pendingProposalCount],
        ["Uncertainty", status.uncertainty.length],
        ["Frozen", status.frozenScopeCount]
      ]} />
    </section>
  );
}

function RuntimeDebugInnerView(props: { projectId: string | null; initialSessions: any[]; focusRunId?: string | null }) {
  const api = useProgramApi("automation-studio");
  const [view, setView] = useState<"list" | "log">("list");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>(() => sortRuntimeRunsForDebugView(props.initialSessions));
  const [page, setPage] = useState({ limit: RUNTIME_RUN_PAGE_SIZE, offset: 0, total: props.initialSessions.length });
  const [selectedRunDetail, setSelectedRunDetail] = useState<any | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setRuns(sortRuntimeRunsForDebugView(props.initialSessions));
    setPage((current) => ({ ...current, offset: 0, total: Math.max(current.total, props.initialSessions.length) }));
  }, [props.initialSessions]);
  useEffect(() => {
    if (!props.projectId) return;
    void loadRuns(0);
  }, [props.projectId]);
  const loadRuns = async (offset: number) => {
    if (!props.projectId) return;
    setLoadingRuns(true);
    setError("");
    const result = await api.post<{ runtimeSessions?: any[]; page?: { runs?: any[]; total?: number; limit?: number; offset?: number } }>("list-runtime-sessions", { projectId: props.projectId, summaries: true, limit: RUNTIME_RUN_PAGE_SIZE, offset });
    setLoadingRuns(false);
    if (!result.ok) {
      setError(result.error ?? "Runtime runs could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setRuns(sortRuntimeRunsForDebugView(result.payload?.runtimeSessions ?? resultPage?.runs ?? []));
    setPage({
      limit: resultPage?.limit ?? RUNTIME_RUN_PAGE_SIZE,
      offset: resultPage?.offset ?? offset,
      total: resultPage?.total ?? result.payload?.runtimeSessions?.length ?? 0
    });
  };
  const openLog = async (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRunDetail(null);
    setView("log");
    if (!props.projectId) return;
    setLoadingLog(true);
    setError("");
    const result = await api.post<{ runDetail?: any }>("get-flow-run-detail", { projectId: props.projectId, runId });
    setLoadingLog(false);
    if (!result.ok || !result.payload?.runDetail) {
      setError(result.error ?? "Runtime log could not be loaded.");
      return;
    }
    setSelectedRunDetail(result.payload.runDetail);
  };
  const closeLog = () => {
    setView("list");
    setSelectedRunId(null);
    setSelectedRunDetail(null);
  };
  useEffect(() => {
    if (props.focusRunId && props.focusRunId !== selectedRunId) void openLog(props.focusRunId);
  }, [props.focusRunId]);
  return (
    <section className="automation-runtime-debugger">
      {view === "list"
        ? <RuntimeRunListPage error={error} loading={loadingRuns} page={page} sessions={runs} onOpenLog={openLog} onPage={loadRuns} />
        : <RuntimeActionLogPage api={api} error={error} loading={loadingLog} projectId={props.projectId} runId={selectedRunId} runDetail={selectedRunDetail} onBack={closeLog} />}
    </section>
  );
}

export function routerReferencesForSubflow(router: any | null, subflowId: string): Array<{ id: string; name: string; status: string; order: string | number; condition: string }> {
  if (!router || !subflowId) return [];
  const rules = (router.rules ?? [])
    .filter((rule: any) => rule?.target?.kind === "subflow" && rule.target.subflowId === subflowId)
    .map((rule: any) => ({
      id: rule.ruleId ?? rule.name,
      name: rule.name ?? rule.ruleId ?? "Route rule",
      status: rule.status ?? "active",
      order: rule.order ?? "-",
      condition: rule.condition ? compactConditionLabel(rule.condition) : "Always"
    }));
  const fallback = router.fallback?.kind === "subflow" && router.fallback.subflowId === subflowId
    ? [{ id: `${router.routerId}:fallback`, name: "Fallback", status: router.status ?? "active", order: "fallback", condition: "No rule matched" }]
    : [];
  return [...rules, ...fallback];
}

export function runtimeAttemptsForRunDetail(runDetail: any | null): any[] {
  if (!runDetail) return [];
  if (Array.isArray(runDetail.actionAttempts)) return runDetail.actionAttempts;
  if (Array.isArray(runDetail.trace?.attempts)) return runDetail.trace.attempts;
  return [];
}

export function sortRuntimeRunsForDebugView(runs: any[]): any[] {
  return [...runs].sort((left, right) => runtimeRunSortTime(right) - runtimeRunSortTime(left) || String(right.runId ?? "").localeCompare(String(left.runId ?? "")));
}

function runtimeRunSortTime(run: any): number {
  return firstFiniteRuntimeNumber(run?.updatedAt, run?.updatedAtMs, run?.finishedAt, run?.startedAt, run?.queuedAt) ?? 0;
}

function firstFiniteRuntimeNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isRuntimeJsonRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function runtimeStoryHeadline(runDetail: any): string {
  const summary = runDetail?.summary ?? {};
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  if (metrics.deterministicSuccessAfterAdaptation === true) return "FluxIQ adapted the run, retried it, and the deterministic retry succeeded.";
  if (metrics.durableBehaviorChanged === true) return "FluxIQ created or applied a durable behavior change during this run.";
  if ((runDetail?.adaptationIds?.length ?? 0) > 0) return "FluxIQ created adaptation evidence for review.";
  if ((runDetail?.interventions?.length ?? 0) > 0) return "FluxIQ used LLM assistance and preserved the intervention trail.";
  if (summary.status === "failed") return "The run failed before a durable adaptation was applied.";
  if (summary.status === "succeeded") return "The run completed deterministically.";
  return "The run is recorded with compact action and recovery detail.";
}

function runtimeStoryStatusClass(status: unknown): string {
  const value = String(status ?? "unknown");
  if (value === "succeeded" || value === "created" || value === "applied") return "success";
  if (value === "failed" || value === "rejected") return "failed";
  if (value === "attempted" || value === "testing" || value === "running") return "active";
  return "muted";
}

function runtimeTokenLabel(tokenUsage: any): string {
  const total = tokenUsage?.totalTokens;
  if (typeof total === "number" && Number.isFinite(total)) return String(total);
  const input = tokenUsage?.inputTokens;
  const output = tokenUsage?.outputTokens;
  if (typeof input === "number" || typeof output === "number") return `${input ?? 0}/${output ?? 0}`;
  return "-";
}

function runtimeCostLabel(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? `$${value.toFixed(4)}` : "$0";
}

function compactConditionLabel(condition: any): string {
  if (!condition) return "Always";
  if (condition.signalPath) return `${condition.signalPath} ${condition.operator ?? "matches"}${condition.expected !== undefined ? ` ${String(condition.expected)}` : ""}`;
  if (condition.type && Array.isArray(condition.conditions)) return `${condition.type} (${condition.conditions.length})`;
  return "Condition";
}

function routerFallbackLabel(router: any | null): string {
  if (!router?.fallback) return "-";
  if (router.fallback.kind === "fail") return router.fallback.message ?? "Fail";
  if (router.fallback.kind === "subflow") return `Subflow ${router.fallback.subflowId}`;
  return "Fallback";
}

function instructionDraftFromInstruction(instruction: any | null) {
  return {
    instructionId: instruction?.instructionId ?? "",
    title: instruction?.title ?? "",
    body: instruction?.body ?? "",
    scopeKind: instruction?.scope?.kind ?? "flow",
    priority: Number.isFinite(Number(instruction?.priority)) ? Number(instruction.priority) : 50,
    requirement: instruction?.requirement === "required" ? "required" : "advisory",
    status: instruction?.status === "disabled" || instruction?.status === "archived" ? instruction.status : "active"
  };
}

function instructionDiagnostics(instructions: any[]): Array<{ code: string; message: string }> {
  const required = instructions.filter((instruction) => instruction.requirement === "required");
  const hasAlways = required.some((instruction) => /\balways\b/i.test(instruction.body ?? ""));
  const hasNever = required.some((instruction) => /\bnever\b/i.test(instruction.body ?? ""));
  return hasAlways && hasNever
    ? [{ code: "instruction.conflict", message: "Required instructions contain both always and never directives." }]
    : [];
}

function RuntimeRunListPage(props: { sessions: any[]; page: { limit: number; offset: number; total: number }; loading: boolean; error: string; onOpenLog(runId: string): void; onPage(offset: number): void }) {
  const nextOffset = props.page.offset + props.page.limit;
  const previousOffset = Math.max(0, props.page.offset - props.page.limit);
  const rangeStart = props.page.total ? props.page.offset + 1 : 0;
  const rangeEnd = Math.min(props.page.total, props.page.offset + props.sessions.length);
  const statusCounts = props.sessions.reduce((counts, session) => {
    const status = String(session.status ?? "queued");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  return (
    <section className="automation-runtime-list-page">
      <header>
        <div>
          <strong>Previous Runs</strong>
          <span>{props.loading ? "Loading runs..." : `${rangeStart}-${rangeEnd} of ${props.page.total} runs`}</span>
        </div>
        <div className="automation-runtime-list-summary" aria-label="Visible run status summary">
          <span>{statusCounts.succeeded ?? 0} succeeded</span>
          <span>{statusCounts.failed ?? 0} failed</span>
          <span>{statusCounts.cancelled ?? 0} cancelled</span>
        </div>
      </header>
      {props.error ? <p className="automation-runtime-message">{props.error}</p> : null}
      <div className="automation-runtime-run-list">
        <div className="automation-runtime-run-header" aria-hidden="true">
          <span>Run</span>
          <span>Target</span>
          <span>Status</span>
          <span>Started</span>
          <span>Duration</span>
          <span>Actions</span>
          <span>Effects</span>
        </div>
        {props.sessions.map((session) => (
          <article
            className="automation-runtime-run-row"
            key={session.runId ?? `${session.targetId}:${session.queuedAt}`}
            onClick={() => session.runId ? props.onOpenLog(session.runId) : undefined}
            onKeyDown={(event) => {
              if (!session.runId || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              props.onOpenLog(session.runId);
            }}
            role="button"
            tabIndex={session.runId ? 0 : -1}
          >
            <strong title={session.runId ?? "Run"}>{session.runId ?? "Run"}</strong>
            <span title={`${session.targetKind ?? "flow"}:${session.targetId ?? session.flowId ?? "-"}`}>{session.targetKind ?? "flow"}:{session.targetId ?? session.flowId ?? "-"}</span>
            <StatusBadge value={session.status ?? "queued"} />
            <span>{formatRuntimeTimestamp(session.startedAt ?? session.queuedAt)}</span>
            <span>{formatRuntimeDuration(session.startedAt, session.finishedAt)}</span>
            <span>{session.attemptCount ?? session.trace?.attempts?.length ?? 0} actions</span>
            <span>{session.effectCount ?? session.trace?.effects?.length ?? 0} effects</span>
          </article>
        ))}
        {!props.sessions.length ? <p className="automation-runtime-empty">No runtime sessions have been started for this project.</p> : null}
      </div>
      <footer className="automation-runtime-pagination-footer">
        <span>{props.loading ? "Loading..." : `${rangeStart}-${rangeEnd} of ${props.page.total}`}</span>
        <div className="automation-runtime-pagination">
          <button disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(previousOffset)} type="button">Previous</button>
          <button disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next</button>
        </div>
      </footer>
    </section>
  );
}

export function RuntimeActionLogPage(props: { api?: { post<T = any>(endpoint: string, payload?: any): Promise<{ ok: boolean; payload?: T; error?: string }> }; projectId?: string | null; runId: string | null; runDetail: any | null; loading: boolean; error: string; onBack(): void }) {
  const [attemptOffset, setAttemptOffset] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const runDetail = props.runDetail;
  const summary = runDetail?.summary ?? {};
  const trace = runDetail?.trace;
  const attempts = runtimeAttemptsForRunDetail(runDetail);
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  const nextAttemptOffset = attemptOffset + RUNTIME_ACTION_PAGE_SIZE;
  const visibleAttempts = attempts.slice(attemptOffset, nextAttemptOffset);
  useEffect(() => {
    setAttemptOffset(0);
    setExportMessage("");
  }, [props.runId]);
  const exportAudit = async () => {
    const runId = props.runId;
    if (!props.api || !props.projectId || !runId) return;
    setExportMessage("Preparing audit export...");
    const result = await props.api.post<{ audit?: any }>("export-flow-run-audit", { projectId: props.projectId, runId });
    if (!result.ok || !result.payload?.audit) {
      setExportMessage(result.error ?? "Audit export could not be prepared.");
      return;
    }
    const auditJson = JSON.stringify(result.payload.audit, null, 2);
    if (typeof window !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined") {
      const url = URL.createObjectURL(new Blob([auditJson], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fluxiq-run-audit-${runId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    setExportMessage("Audit export ready.");
  };
  if (!runDetail) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button><div><strong>Action Log</strong><span>{props.loading ? `Loading ${props.runId ?? "run"}...` : props.error || "Run not found."}</span></div></header>
      </section>
    );
  }
  return (
    <section className="automation-runtime-log-page">
      <header className="automation-runtime-log-hero">
        <div className="automation-runtime-log-title-row">
          <button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button>
          <StatusBadge value={summary.status ?? trace?.status ?? "queued"} />
        </div>
        <div>
          <strong>Action Log</strong>
          <span>{summary.runId ?? props.runId} | flow:{summary.flowId ?? "-"} | {attempts.length} actions | {formatRuntimeDuration(summary.startedAt, summary.finishedAt)}</span>
        </div>
        <div className="automation-runtime-log-actions">
          <button className="automation-runtime-row-action" disabled={!props.api || !props.projectId || !props.runId} onClick={exportAudit} type="button">Export Audit</button>
        </div>
      </header>
      {exportMessage ? <p className="automation-runtime-message">{exportMessage}</p> : null}
      {runDetail?.metadata?.terminalFailureReason ? <p className="automation-runtime-message">{runDetail.metadata.terminalFailureReason}</p> : null}
      {runDetail?.metadata?.message ? <p className="automation-runtime-message">{runDetail.metadata.message}</p> : null}
      <section className="automation-runtime-story-panel">
        <div className="automation-runtime-story-summary">
          <strong>Run Story</strong>
          <span>{runtimeStoryHeadline(runDetail)}</span>
        </div>
        <RuntimeRunStory runDetail={runDetail} />
        <RuntimeMetricsPanel summary={summary} metrics={metrics} recoveryCount={recoveryAttempts.length} interventionCount={interventions.length} adaptationCount={runDetail.adaptationIds?.length ?? 0} />
      </section>
      <div className="automation-runtime-log-toolbar">
        <span>{attempts.length ? `${attemptOffset + 1}-${Math.min(attempts.length, nextAttemptOffset)} of ${attempts.length} actions` : "No actions"}</span>
        <div>
          <button disabled={attemptOffset <= 0} onClick={() => setAttemptOffset(Math.max(0, attemptOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button>
          <button disabled={nextAttemptOffset >= attempts.length} onClick={() => setAttemptOffset(nextAttemptOffset)} type="button">Next</button>
        </div>
      </div>
      <ol className="automation-runtime-action-log">
        {visibleAttempts.map((attempt: any, index: number) => (
          <li key={runtimeAttemptKey(attempt, attemptOffset + index)}>
            <RuntimeAttemptRow attempt={attempt} index={attemptOffset + index} />
          </li>
        ))}
      </ol>
      {!attempts.length ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
      <section className="automation-runtime-log-section">
        <header><strong>Recovery Ladder</strong><span>{recoveryAttempts.length} attempts</span></header>
        <DataTable columns={["Attempt", "Selected", "Target", "Status", "Reason", "Details"]} rows={recoveryAttempts.map((attempt: any) => [
          attempt.attemptId ?? "-",
          attempt.selectedKind ?? "-",
          attempt.selectedTargetNodeId ?? attempt.selectedEdgeId ?? "-",
          <StatusBadge key={`${attempt.recoveryId}:status`} value={attempt.status ?? "unknown"} />,
          attempt.reason ?? "-",
          <JsonToggle key={`${attempt.recoveryId}:json`} label="Show Recovery JSON" value={attempt} />
        ])} empty="No recovery or reroute decisions were recorded." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>LLM Interventions</strong><span>{interventions.length} events</span></header>
        <DataTable columns={["Kind", "Provider", "Model", "Tokens", "Reason", "Details"]} rows={interventions.map((intervention: any, index: number) => [
          intervention.kind ?? "-",
          intervention.provider ?? "-",
          intervention.model ?? "-",
          runtimeTokenLabel(intervention.tokenUsage),
          intervention.reason ?? intervention.summary ?? "-",
          <JsonToggle key={`${intervention.interventionId ?? index}:json`} label="Show Intervention JSON" value={intervention} />
        ])} empty="No LLM intervention events were recorded." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Adaptations</strong><span>{runDetail.adaptationIds?.length ?? 0} created</span></header>
        <DataTable columns={["Adaptation", "Review"]} rows={(runDetail.adaptationIds ?? []).map((adaptationId: string) => [
          adaptationId,
          <a className="automation-runtime-row-action" href={adaptationReviewHref(summary.flowId, adaptationId)} key={adaptationId}>Open Adaptation</a>
        ])} empty="No adaptations were created during this run." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Runtime Effects</strong><span>{trace?.effects?.length ?? 0} effects</span></header>
        <DataTable columns={["#", "Node", "Type", "Payload"]} rows={(trace?.effects ?? []).slice(0, RUNTIME_ACTION_PAGE_SIZE).map((effect: any, index: number) => [index + 1, effect.nodeId ?? "-", effect.type ?? "-", <JsonToggle key={index} label="Show Payload JSON" value={effect.payload ?? {}} />])} empty="No runtime effects were dispatched." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Final Runtime Values</strong><span>{Object.keys(trace?.values ?? {}).length} keys</span></header>
        <JsonToggle label="Show Final Values JSON" value={trace?.values ?? {}} />
      </section>
    </section>
  );
}

function RuntimeRunStory(props: { runDetail: any }) {
  const detail = props.runDetail;
  const summary = detail?.summary ?? {};
  const attempts = runtimeAttemptsForRunDetail(detail);
  const recoveryAttempts = Array.isArray(detail?.recoveryAttempts) ? detail.recoveryAttempts : [];
  const interventions = Array.isArray(detail?.interventions) ? detail.interventions : [];
  const runtimePatchAttempts = Array.isArray(detail?.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  const adaptiveRetry = isRuntimeJsonRecord(detail?.metadata?.adaptiveRetry) ? detail.metadata.adaptiveRetry : null;
  const steps = [
    {
      label: "Deterministic Run",
      value: `${attempts.length} actions`,
      status: summary.status ?? detail?.trace?.status ?? "queued"
    },
    {
      label: "Recovery",
      value: recoveryAttempts.length ? `${recoveryAttempts.length} attempts` : "none",
      status: recoveryAttempts.some((attempt: any) => attempt.status === "succeeded") ? "succeeded" : recoveryAttempts.length ? "attempted" : "skipped"
    },
    {
      label: "LLM",
      value: interventions.length ? `${interventions.length} events` : "not used",
      status: interventions.length ? "attempted" : "skipped"
    },
    {
      label: "Patch Test",
      value: runtimePatchAttempts.length ? `${runtimePatchAttempts.length} attempts` : "none",
      status: runtimePatchAttempts.some((attempt: any) => attempt?.patchedTraceStatus === "succeeded" || attempt?.status === "succeeded") ? "succeeded" : runtimePatchAttempts.length ? "attempted" : "skipped"
    },
    {
      label: "Adaptation",
      value: detail?.adaptationIds?.length ? `${detail.adaptationIds.length} created` : "none",
      status: detail?.adaptationIds?.length ? "created" : "skipped"
    },
    {
      label: "Retry",
      value: adaptiveRetry ? String(adaptiveRetry.status ?? "attempted") : "none",
      status: adaptiveRetry?.status ?? "skipped"
    }
  ];
  return (
    <ol className="automation-runtime-story-steps" aria-label="Runtime adaptation story">
      {steps.map((step) => (
        <li className={`automation-runtime-story-step ${runtimeStoryStatusClass(step.status)}`} key={step.label}>
          <span>{step.label}</span>
          <strong>{step.value}</strong>
        </li>
      ))}
    </ol>
  );
}

function RuntimeMetricsPanel(props: { summary: any; metrics: Record<string, any>; recoveryCount: number; interventionCount: number; adaptationCount: number }) {
  return (
    <div className="automation-runtime-metrics-grid">
      <RuntimeMetric label="Status" value={String(props.summary.status ?? "queued")} />
      <RuntimeMetric label="Actions" value={String(props.summary.actionAttemptCount ?? 0)} />
      <RuntimeMetric label="Recovery" value={String(props.metrics.recoveryAttemptCount ?? props.recoveryCount)} />
      <RuntimeMetric label="LLM Calls" value={String(props.metrics.llmCallCount ?? props.interventionCount)} />
      <RuntimeMetric label="Tokens" value={String(props.metrics.tokenCount ?? props.summary.tokenUsage?.totalTokens ?? 0)} />
      <RuntimeMetric label="Cost" value={runtimeCostLabel(props.metrics.estimatedCostUsd ?? props.summary.tokenUsage?.estimatedCostUsd)} />
      <RuntimeMetric label="Adaptations" value={String(props.metrics.adaptationApplyCount ?? props.adaptationCount)} />
      <RuntimeMetric label="Durable" value={props.metrics.durableBehaviorChanged === true ? "yes" : "no"} />
    </div>
  );
}

function RuntimeMetric(props: { label: string; value: string }) {
  return (
    <div className="automation-runtime-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function RuntimeAttemptRow(props: { attempt: any; index: number }) {
  const attempt = props.attempt;
  const comparisonStatus = attempt.comparisonStatus ?? attempt.transitionComparison?.status;
  const recoverySelected = attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected;
  return (
    <article className="automation-runtime-attempt-row">
      <span className="automation-runtime-attempt-index">#{props.index + 1}</span>
      <strong title={attempt.nodeId}>{attempt.nodeId ?? "-"}</strong>
      <StatusBadge value={attempt.status ?? "unknown"} />
      <span title={attempt.definitionId ?? ""}>{attempt.definitionId ?? "-"}</span>
      <span>{attempt.route ?? "-"}</span>
      <span>{formatRuntimeTimestamp(attempt.startedAt)} | {formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)}</span>
      <span>{attempt.regionId ?? "-"}</span>
      <span>{comparisonStatus ? <StatusBadge value={comparisonStatus} /> : "-"}</span>
      <span>{recoverySelected ? `${recoverySelected.kind ?? "-"}${recoverySelected.targetNodeId ? ` -> ${recoverySelected.targetNodeId}` : ""}` : "-"}</span>
      <span title={attempt.message ?? ""}>{attempt.message ?? attempt.policyDecision?.reason ?? (attempt.compositeTarget ? `${attempt.compositeTarget.flowId}@${attempt.compositeTarget.version}` : "-")}</span>
      <JsonToggle label="Details JSON" value={runtimeAttemptDetailsJson(attempt, recoverySelected)} />
    </article>
  );
}

function runtimeAttemptDetailsJson(attempt: any, recoverySelected: any) {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    route: attempt.route,
    regionId: attempt.regionId,
    timing: { startedAt: attempt.startedAt, finishedAt: attempt.finishedAt },
    message: attempt.message,
    inputs: attempt.inputs ?? {},
    outputs: attempt.outputs ?? {},
    effects: attempt.effects ?? [],
    transitionComparison: attempt.transitionComparison,
    diffSummary: attempt.metadata?.diffSummary,
    recoverySelected,
    logs: attempt.logs ?? [],
    childTrace: attempt.childTrace,
    policyDecision: attempt.policyDecision,
    compositeTarget: attempt.compositeTarget,
    metadata: attempt.metadata ?? {}
  };
}

function JsonToggle(props: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="automation-runtime-json-toggle">
      <button onClick={() => setOpen((current) => !current)} type="button">{open ? "Hide" : props.label}</button>
      {open ? <JsonPreview value={props.value} /> : null}
    </div>
  );
}

function JsonPreview(props: { value: unknown }) {
  return <pre className="automation-runtime-json">{safeJson(props.value)}</pre>;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatRuntimeTimestamp(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toLocaleString() : "-";
}

function formatRuntimeDuration(startedAt: unknown, finishedAt: unknown): string {
  if (typeof startedAt !== "number" || typeof finishedAt !== "number") return "in progress";
  return `${Math.max(0, finishedAt - startedAt)}ms`;
}

function runtimeAttemptKey(attempt: any, index: number): string {
  return attempt.attemptId ?? `${attempt.nodeId}:${index}`;
}

export function adaptationReviewHref(flowId: string | undefined, adaptationId: string): string {
  const params = new URLSearchParams({ view: "adaptations", adaptationId });
  if (flowId) params.set("flowId", flowId);
  return `?${params.toString()}`;
}
