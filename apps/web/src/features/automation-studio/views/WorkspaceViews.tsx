"use client";

import { Combobox, DataTable, Field, Menu, Modal, StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, Copy, Info, ListChecks, MoreHorizontal, Search, Pencil, Plus, Power, Route, Trash2, Workflow, X } from "lucide-react";
import { useProgramApi } from "../../programs/program-api";
import type { AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";


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

export function AutomationRuntimeWorkspace(props: { projectId: string | null; flow?: any; pipelineArtifacts: any; timelines: any[]; models: any[]; policies: any[]; runtimeSessions: any[] }) {
  const api = useProgramApi("automation-studio");
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  const [inputText, setInputText] = useState("{}");
  const [maxSteps, setMaxSteps] = useState("50");
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<any | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStartedAt, setActiveRunStartedAt] = useState<number | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<AutomationRuntimeRunMode>("default");
  const [readiness, setReadiness] = useState<{ loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string }>({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" });
  useEffect(() => {
    const defaults = Object.fromEntries(runtimeFlowInputPorts(props.flow).filter((port) => port.defaultValue !== undefined).map((port) => [port.id, port.defaultValue]));
    setInputText(JSON.stringify(defaults));
    if (!props.projectId || !props.flow?.flowId) { setReadiness({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" }); return; }
    let cancelled = false;
    setReadiness((current) => ({ ...current, loading: true, error: "" }));
    void Promise.all([
      api.post<{ instructions?: any[] }>("get-flow-instruction-set", { projectId: props.projectId, flowId: props.flow.flowId }),
      api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId: props.flow.flowId }),
      api.post<{ page?: { total?: number } }>("list-flow-subflows", { projectId: props.projectId, flowId: props.flow.flowId, limit: 1, offset: 0, status: "active" })
    ]).then(([instructions, router, subflows]) => {
      if (cancelled) return;
      const error = [instructions, router, subflows].find((result) => !result.ok)?.error ?? "";
      setReadiness({ loading: false, instructions: instructions.payload?.instructions ?? [], router: router.payload?.router ?? null, subflowTotal: subflows.payload?.page?.total ?? 0, error });
    });
    return () => { cancelled = true; };
  }, [props.projectId, props.flow?.flowId]);
  const runFlow = async (mode: AutomationRuntimeRunMode) => {
    setRunningMode(mode);
    setRunError("");
    const inputErrors = runtimeTypedInputErrors(props.flow, runtimeRunInputValues(inputText));
    if (inputErrors.length) { setRunError(inputErrors[0] ?? "Run inputs are invalid."); setRunningMode(null); return; }
    const payload = buildAutomationRuntimeRunPayload({ projectId: props.projectId, flowId: props.flow?.flowId, mode, inputText, maxSteps });
    if (!payload.ok) { setRunError(payload.error); setRunningMode(null); return; }
    setLastMode(mode);
    const queued = await api.post<{ runtimeSession?: any }>("start-runtime-session", { projectId: payload.payload.projectId, flowId: payload.payload.flowId, inputs: payload.payload.inputs });
    if (!queued.ok || !queued.payload?.runtimeSession?.runId) { setRunningMode(null); setRunError(queued.error ?? "Runtime session could not be queued."); return; }
    const runId = queued.payload.runtimeSession.runId;
    window.dispatchEvent(new CustomEvent("fluxiq:runtime-runs-changed", { detail: { projectId: props.projectId, flowId: props.flow?.flowId, runId } }));
    setActiveRunId(runId);
    setActiveRunStartedAt(Date.now());
    setLiveRunId(runId);
    const result = await api.post<{ runtimeSession?: any; runSummary?: any; createdAdaptationIds?: string[]; interventionCount?: number; terminalReason?: string; durableBehaviorChanged?: boolean }>("run-runtime-session", { ...payload.payload, runId });
    setRunningMode(null);
    setActiveRunId(null);
    setActiveRunStartedAt(null);
    window.dispatchEvent(new CustomEvent("fluxiq:runtime-runs-changed", { detail: { projectId: props.projectId, flowId: props.flow?.flowId, runId } }));
    if (!result.ok || !result.payload?.runtimeSession) { setRunError(result.error ?? "Runtime session could not be completed."); return; }
    setLastRun(result.payload);
  };
  const stopRun = async () => {
    if (!props.projectId || !activeRunId) return;
    const result = await api.post("cancel-runtime-session", { projectId: props.projectId, runId: activeRunId });
    if (!result.ok) setRunError(result.error ?? "Run could not be stopped.");
    else window.dispatchEvent(new CustomEvent("fluxiq:runtime-runs-changed", { detail: { projectId: props.projectId, flowId: props.flow?.flowId, runId: activeRunId } }));
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
        readiness={readiness}
        flow={props.flow}
        inputText={inputText}
        maxSteps={maxSteps}
        runningMode={runningMode}
        onInputText={setInputText}
        onMaxSteps={setMaxSteps}
        onRun={runFlow}
        activeRunId={activeRunId}
        activeRunStartedAt={activeRunStartedAt}
        canRetry={Boolean(lastRun || runError)}
        onStop={() => void stopRun()}
        onRetry={() => void runFlow(lastMode)}
        onOpenLiveLog={() => activeRunId && setLiveRunId(activeRunId)}
      />
      {runError ? <p className="automation-runtime-message">{runError}</p> : null}
      {lastRun ? <RuntimePostRunSummary result={lastRun} /> : null}
      <RuntimeRunHistory flowId={props.flow?.flowId} focusRunId={liveRunId ?? lastRun?.runtimeSession?.runId} projectId={props.projectId} initialSessions={orderedSessions} />
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
  readiness: { loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string };
  activeRunId: string | null;
  activeRunStartedAt: number | null;
  canRetry: boolean;
  onStop(): void;
  onRetry(): void;
  onOpenLiveLog(): void;
  onInputText(value: string): void;
  onMaxSteps(value: string): void;
  onRun(mode: AutomationRuntimeRunMode): void;
}) {
  const [selectedMode, setSelectedMode] = useState<AutomationRuntimeRunMode>("default");
  const runModes: Array<{ mode: AutomationRuntimeRunMode; label: string; detail: string }> = [
    { mode: "default", label: "Fully adaptive", detail: "Use the saved policy and auto-apply safe validated adaptations." },
    { mode: "manual_approval", label: "Manual approval", detail: "Allow LLM help but queue every adaptation for review." },
    { mode: "deterministic", label: "No LLM intervention", detail: "Run only saved deterministic behavior." }
  ];
  const warnings = [
    props.flow?.metadata?.trainingMode === "continuous_adaptive" ? "Continuous adaptive mode can create runtime adaptations." : "",
    props.flow?.metadata?.adaptationPolicySettings?.preset === "autonomous" ? "Autonomous policy can promote eligible validated adaptations." : ""
  ].filter(Boolean);
  const declaredInputs = runtimeFlowInputPorts(props.flow);
  const inputValues = runtimeRunInputValues(props.inputText);
  const inputErrors = runtimeTypedInputErrors(props.flow, inputValues);
  const readinessIssues = runtimeFlowReadinessIssues(props.flow, props.readiness);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => { if (!props.activeRunStartedAt) { setElapsedSeconds(0); return; } const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - props.activeRunStartedAt!) / 1000))); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [props.activeRunStartedAt]);
  return (
    <section className="automation-runtime-run-panel">
      <header>
        <div>
          <strong>Run This Flow</strong>
          <span>{props.flow?.name ?? props.flow?.flowId ?? "Select a Flow"}</span>
        </div>
      </header>
      {warnings.length ? <div className="automation-runtime-message">{warnings.join(" ")}</div> : null}
      {props.readiness.loading ? <div className="automation-settings-inline-notice"><span aria-hidden className="automation-inline-spinner" /><span>Checking Flow readiness...</span></div> : readinessIssues.length ? <div className="automation-runtime-readiness" role="alert"><AlertTriangle size={17} aria-hidden /><div><strong>Complete setup before running</strong>{readinessIssues.map((issue) => <span key={issue.label}>{issue.label}</span>)}</div><div>{readinessIssues.map((issue) => <a className="button" href={issue.href} key={issue.href}>{issue.action}</a>)}</div></div> : <div className="automation-settings-inline-notice"><CircleCheck size={17} aria-hidden /><span>Flow is ready to run.</span></div>}
      <div className="automation-runtime-run-command">
        <fieldset className="automation-runtime-mode-control">
          <legend>Run mode</legend>
          <div>{runModes.map((mode) => <button aria-pressed={selectedMode === mode.mode} className={selectedMode === mode.mode ? "selected" : ""} disabled={Boolean(props.runningMode)} key={mode.mode} onClick={() => setSelectedMode(mode.mode)} type="button"><strong>{mode.label}</strong><span>{mode.detail}</span></button>)}</div>
          <small>{runtimeModeDescription(selectedMode)}</small>
        </fieldset>
        <button className="button button-primary" disabled={props.disabled || props.readiness.loading || readinessIssues.length > 0 || inputErrors.length > 0} onClick={() => props.onRun(selectedMode)} type="button">
          {props.runningMode ? "Running..." : "Run"}
        </button>
      </div>
      {declaredInputs.length ? <div className="automation-runtime-input-fields">
        <header><strong>Run Inputs</strong><span>Values passed into this run</span></header>
        <div>
          {declaredInputs.map((port) => {
            const value = inputValues[port.id];
            const kind = port.valueType?.kind ?? "json";
            const error = runtimeTypedInputError(port, value);
            return <label key={port.id}><span>{port.name}{port.required ? " (required)" : ""}</span>{kind === "boolean" ? <select aria-invalid={Boolean(error)} value={value === true ? "true" : value === false ? "false" : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value === "" ? undefined : event.target.value === "true"))}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select> : kind === "number" ? <input aria-invalid={Boolean(error)} type="number" value={typeof value === "number" ? value : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value === "" ? undefined : Number(event.target.value)))} /> : kind === "string" ? <input aria-invalid={Boolean(error)} value={typeof value === "string" ? value : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value))} /> : <textarea aria-invalid={Boolean(error)} rows={3} value={value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2)} onChange={(event) => { let next: any = event.target.value; try { next = JSON.parse(event.target.value); } catch {} props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, next)); }} />}{port.description ? <small>{port.description}</small> : null}{error ? <small className="automation-field-error">{error}</small> : null}</label>;
          })}
        </div>
      </div> : <div className="automation-runtime-input-preview">
        <strong>No run inputs declared</strong>
        <span>This Flow will run with its saved defaults.</span>
      </div>}
      {props.activeRunId ? <div className="automation-runtime-live-control" role="status"><span className="automation-inline-spinner" aria-hidden /><div><strong>Run in progress</strong><span>{elapsedSeconds}s elapsed | {props.activeRunId}</span></div><button className="button" onClick={props.onOpenLiveLog} type="button">Open Live Log</button><button className="button danger" onClick={props.onStop} type="button">Stop</button></div> : props.canRetry ? <div className="automation-runtime-retry-control"><span>Run the same inputs and mode again.</span><button className="button" disabled={props.disabled} onClick={props.onRetry} type="button">Retry Run</button></div> : null}
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

export function runtimeFlowInputPorts(flow: any): any[] {
  if (Array.isArray(flow?.interface?.inputs)) return flow.interface.inputs.filter((port: any) => port && typeof port.id === "string" && typeof port.name === "string").slice(0, 50);
  return [];
}

export function runtimeTypedInputError(port: any, value: unknown): string {
  if (value === undefined || value === null || value === "") return port.required && port.defaultValue === undefined ? port.name + " is required." : "";
  const kind = port.valueType?.kind ?? "json";
  if (kind === "string" && typeof value !== "string") return port.name + " must be text.";
  if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) return port.name + " must be a number.";
  if (kind === "boolean" && typeof value !== "boolean") return port.name + " must be Yes or No.";
  if (kind === "json" && typeof value === "string") { try { JSON.parse(value); } catch { return port.name + " must be valid structured data."; } }
  return "";
}

export function runtimeTypedInputErrors(flow: any, values: Record<string, any>): string[] {
  return runtimeFlowInputPorts(flow).map((port) => runtimeTypedInputError(port, values[port.id])).filter(Boolean);
}

export function runtimeFlowReadinessIssues(flow: any, context: { instructions: any[]; router: any | null; subflowTotal: number; error: string }): Array<{ label: string; action: string; href: string }> {
  const issues: Array<{ label: string; action: string; href: string }> = [];
  if (context.error) issues.push({ label: "Readiness data could not be loaded.", action: "Open Problems", href: "?view=problems" });
  if (!context.instructions.some((instruction) => instruction.status === "active")) issues.push({ label: "Add at least one active instruction.", action: "Open Instructions", href: "?view=flow-instructions" });
  const hasGraph = (flow?.nodes?.length ?? 0) > 0;
  const hasRoute = (context.router?.rules?.some((rule: any) => rule.status === "active") ?? false) || Boolean(context.router?.fallback);
  if (!hasGraph && !(context.subflowTotal > 0 && hasRoute)) {
    const needsRouter = context.subflowTotal > 0;
    issues.push({ label: "Add runnable Nodes or an active Router path.", action: needsRouter ? "Open Router" : "Open Nodes", href: needsRouter ? "?view=flow-map" : "?view=flow-editor" });
  }
  return issues;
}

function runtimeRunInputValues(inputText: string): Record<string, any> {
  try {
    const parsed = inputText.trim() ? JSON.parse(inputText) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, any>;
  } catch {
    return {};
  }
}

function updateRuntimeRunInputText(inputText: string, key: string, value: unknown): string {
  let parsed: Record<string, any> = {};
  try {
    const current = inputText.trim() ? JSON.parse(inputText) : {};
    if (current && typeof current === "object" && !Array.isArray(current)) parsed = current;
  } catch {
    parsed = {};
  }
  if (value === undefined) delete parsed[key]; else parsed[key] = value;
  return JSON.stringify(parsed);
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
  const [runsView, setRunsView] = useState<"runtime" | "replays">("runtime");
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Runs</strong><span>{runsView === "runtime" ? "Flow execution history" : "Recording and policy validation history"}</span></div>
        <div className="automation-runs-view-control" aria-label="Run history type" role="group">
          <button aria-pressed={runsView === "runtime"} className={runsView === "runtime" ? "button button-primary" : "button"} onClick={() => setRunsView("runtime")} type="button">Runtime Runs</button>
          <button aria-pressed={runsView === "replays"} className={runsView === "replays" ? "button button-primary" : "button"} onClick={() => setRunsView("replays")} type="button">Replays</button>
        </div>
      </header>
      {runsView === "runtime"
        ? <RuntimeRunHistory projectId={props.projectId} initialSessions={orderedSessions} />
        : <section className="automation-runs-replay-view">
            <header><div><strong>Replays</strong><span>{replays.length} validation {replays.length === 1 ? "run" : "runs"}</span></div></header>
            <DataTable columns={["Replay", "Status", "Recording", "Policy", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
              replay.replayId,
              <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />,
              replay.recordingId,
              replay.policyId,
              `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`,
              replay.timingWarnings?.length ?? 0
            ])} empty="No replay validations generated yet." />
          </section>}
    </section>
  );
}

const SUBFLOW_PAGE_SIZE = 25;

export type SubflowDirectoryState = {
  search: string;
  status: string;
  role: string;
  sort: "updated" | "name" | "status" | "role";
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};

export function readSubflowDirectoryUrlState(search = typeof window === "undefined" ? "" : window.location.search): SubflowDirectoryState {
  const params = new URLSearchParams(search);
  const limit = [10, 25, 50].includes(Number(params.get("subflowPageSize"))) ? Number(params.get("subflowPageSize")) : SUBFLOW_PAGE_SIZE;
  const sort = params.get("subflowSort");
  return {
    search: params.get("subflowQuery") ?? "",
    status: params.get("subflowStatus") ?? "",
    role: params.get("subflowRole") ?? "",
    sort: sort === "name" || sort === "status" || sort === "role" ? sort : "updated",
    direction: params.get("subflowDirection") === "asc" ? "asc" : "desc",
    limit,
    offset: Math.max(0, Number(params.get("subflowOffset")) || 0)
  };
}

export function AutomationSubflowsWorkspace(props: { projectId: string | null; flow: any; onOpenSubflow?(flowId: string, subflowId: string, mode: "preview" | "new-window"): void }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId ?? "";
  const initialState = useMemo(() => readSubflowDirectoryUrlState(), []);
  const [subflows, setSubflows] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: initialState.limit, offset: initialState.offset, total: 0 });
  const [queryInput, setQueryInput] = useState(initialState.search);
  const [filters, setFilters] = useState({ search: initialState.search, status: initialState.status, role: initialState.role, sort: initialState.sort, direction: initialState.direction });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [router, setRouter] = useState<any | null>(null);
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  const [routerLoaded, setRouterLoaded] = useState(false);
  const [subflowAction, setSubflowAction] = useState<null | { subflow: any; action: "rename" | "duplicate" | "enable" | "disable" | "archive" | "delete"; name: string; pin: string }>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const requestRef = useRef(0);
  const routerRequestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: queryInput.trim() })), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setSubflows([]);
    if (!props.projectId || !flowId) {
      setPage((current) => ({ ...current, offset: 0, total: 0 }));
      return;
    }
    void loadSubflows(page.offset);
  }, [props.projectId, flowId, filters.search, filters.status, filters.role, filters.sort, filters.direction, page.limit]);

  useEffect(() => {
    setRouter(null);
    setRouterLoaded(false);
    if (!props.projectId || !flowId) return;
    void loadRouter();
  }, [props.projectId, flowId]);

  useEffect(() => {
    const refreshSubflows = (event: Event) => {
      const changedFlowId = (event as CustomEvent<{ flowId?: string }>).detail?.flowId;
      if (changedFlowId === flowId) void loadSubflows(page.offset);
    };
    window.addEventListener("fluxiq:subflows-changed", refreshSubflows);
    return () => window.removeEventListener("fluxiq:subflows-changed", refreshSubflows);
  }, [props.projectId, flowId, page.offset, page.limit, filters]);

  const syncUrl = (offset: number) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string> = {
      subflowQuery: filters.search,
      subflowStatus: filters.status,
      subflowRole: filters.role,
      subflowSort: filters.sort,
      subflowDirection: filters.direction,
      subflowPageSize: String(page.limit),
      subflowOffset: String(offset)
    };
    Object.entries(values).forEach(([key, value]) => value && value !== "0" ? params.set(key, value) : params.delete(key));
    window.history.replaceState(null, "", window.location.pathname + (params.size ? "?" + params.toString() : "") + window.location.hash);
  };

  const loadRouter = async () => {
    if (!props.projectId || !flowId) return;
    const requestId = ++routerRequestRef.current;
    const result = await api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId });
    if (requestId !== routerRequestRef.current) return;
    setRouter(result.ok ? result.payload?.router ?? null : null);
    setRouterLoaded(true);
  };

  const loadSubflows = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    const result = await api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-subflows", {
      projectId: props.projectId,
      flowId,
      limit: page.limit,
      offset,
      search: filters.search,
      status: filters.status,
      role: filters.role,
      sort: filters.sort,
      direction: filters.direction
    });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Subflows could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    const items = result.payload?.subflows ?? resultPage?.subflows ?? [];
    const total = resultPage?.total ?? items.length;
    const safeOffset = total > 0 && offset >= total ? Math.max(0, Math.floor((total - 1) / page.limit) * page.limit) : offset;
    if (safeOffset !== offset) {
      void loadSubflows(safeOffset);
      return;
    }
    setSubflows(items);
    setPage((current) => ({ limit: resultPage?.limit ?? current.limit, offset: resultPage?.offset ?? offset, total }));
    syncUrl(resultPage?.offset ?? offset);
  };

  const beginSubflowAction = (subflow: any, action: "rename" | "duplicate" | "enable" | "disable" | "archive" | "delete") => {
    setSubflowAction({ subflow, action, name: action === "duplicate" ? String(subflow.name ?? "") + " Copy" : String(subflow.name ?? ""), pin: "" });
  };

  const completeSubflowAction = async () => {
    if (!props.projectId || !flowId || !subflowAction?.pin.trim()) return;
    setActionSaving(true);
    setError("");
    const endpoint = subflowAction.action === "rename" ? "rename-flow-subflow" : subflowAction.action === "duplicate" ? "duplicate-flow-subflow" : subflowAction.action === "enable" ? "enable-flow-subflow" : subflowAction.action === "disable" ? "disable-flow-subflow" : subflowAction.action === "archive" ? "archive-flow-subflow" : "delete-flow-subflow";
    const result = await api.post(endpoint, { projectId: props.projectId, flowId, subflowId: subflowAction.subflow.subflowId, authorizationPin: subflowAction.pin.trim(), ...(["rename", "duplicate"].includes(subflowAction.action) ? { name: subflowAction.name.trim() } : {}) });
    setActionSaving(false);
    if (!result.ok) { setError(result.error ?? "Subflow change could not be saved."); return; }
    setSubflowAction(null);
    window.dispatchEvent(new CustomEvent("fluxiq:subflows-changed", { detail: { flowId } }));
    await loadSubflows(page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  const lastOffset = page.total ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
  const firstVisible = page.total ? page.offset + 1 : 0;
  const lastVisible = Math.min(page.total, page.offset + subflows.length);
  const filtered = Boolean(filters.search || filters.status || filters.role);
  const actionReferences = subflowAction ? routerReferencesForSubflow(router, subflowAction.subflow.subflowId) : [];

  return (
    <section className="automation-runs-workspace automation-subflow-directory">
      {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void loadSubflows(page.offset)} type="button">Retry</button></div> : null}
      <header>
        <div><strong>Subflows</strong><span>{props.flow?.name ?? "Select a Flow"}</span></div>
        <span className="automation-subflow-directory-count">{String(page.total)}</span>
      </header>
      <div className="automation-subflow-directory-toolbar" role="search">
        <label className="automation-subflow-search"><Search size={14} aria-hidden /><input aria-label="Search subflows" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search subflows" type="search" value={queryInput} /></label>
        <select aria-label="Filter by status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select>
        <select aria-label="Filter by role" onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))} value={filters.role}><option value="">All roles</option>{["primary", "site", "screen", "integration", "recovery", "fallback", "utility"].map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <select aria-label="Sort subflows" onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SubflowDirectoryState["sort"] }))} value={filters.sort}><option value="updated">Recently updated</option><option value="name">Name</option><option value="status">Status</option><option value="role">Role</option></select>
        <button aria-label={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} className="icon-button" onClick={() => setFilters((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} title={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} type="button">{filters.direction === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}</button>
      </div>
      <div aria-busy={loading} className="automation-subflow-directory-list" role="list" aria-label="Flow subflows">
        {subflows.map((subflow) => {
          const references = routerReferencesForSubflow(router, subflow.subflowId);
          const readiness = subflowReadiness(subflow);
          return (
          <div className="automation-subflow-directory-row" key={subflow.subflowId} role="listitem">
            <button aria-label={"Open " + (subflow.name ?? subflow.subflowId) + " in Flow editor"} className="automation-subflow-directory-open" onClick={() => props.onOpenSubflow?.(flowId, subflow.subflowId, "preview")} type="button">
              <span className="automation-subflow-directory-icon"><Workflow size={17} aria-hidden /></span>
              <span className="automation-subflow-directory-main"><strong>{subflow.name ?? subflow.subflowId}</strong><small>{subflow.subflowId}</small></span>
              <span className="automation-subflow-directory-meta"><span>{subflow.role ?? "utility"}</span><StatusBadge value={subflow.status ?? "active"} /><span className={"automation-subflow-readiness " + readiness.tone}>{readiness.label}</span><span>{references.length ? references.length + (references.length === 1 ? " Router reference" : " Router references") : routerLoaded ? "Not routed" : "Checking routes"}</span><span>{formatRuntimeTimestamp(subflow.updatedAt)}</span></span>
              <ChevronRight size={16} aria-hidden />
            </button>
            <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + String(subflow.name ?? subflow.subflowId)} options={[
              { id: "rename", label: "Rename subflow", icon: <Pencil size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, "rename") },
              { id: "duplicate", label: "Duplicate subflow", icon: <Copy size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, "duplicate") },
              { id: "lifecycle", label: subflow.status === "active" ? "Disable subflow" : "Enable subflow", icon: <Power size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, subflow.status === "active" ? "disable" : "enable") },
              { id: "archive", label: "Archive subflow", icon: <Workflow size={14} aria-hidden />, disabled: subflow.status === "archived", onSelect: () => beginSubflowAction(subflow, "archive") },
              { id: "delete", label: "Delete subflow", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => beginSubflowAction(subflow, "delete") }
            ]} />
          </div>
          );
        })}
        {loading && !subflows.length ? <div className="automation-router-loading" aria-label="Loading subflows"><span /><span /><span /></div> : null}
        {!loading && !subflows.length ? <div className="automation-subflow-directory-empty"><Workflow size={22} aria-hidden /><strong>{flowId ? filtered ? "No matching subflows" : "No subflows yet" : "Select a Flow"}</strong><span>{flowId ? filtered ? "Adjust the search or filters to see other subflows." : "Add subflows from the plus button beside the Subflows folder." : "Choose a Flow to view its subflows."}</span></div> : null}
      </div>
      <footer className="automation-subflow-directory-footer">
        <span>{firstVisible}-{lastVisible} of {page.total}</span>
        <label>Rows <select aria-label="Subflows per page" onChange={(event) => setPage((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))} value={page.limit}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
        <div>
          <button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadSubflows(0)} title="First page" aria-label="First page" type="button"><ChevronsLeft size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadSubflows(previousOffset)} title="Previous page" aria-label="Previous page" type="button"><ChevronLeft size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadSubflows(nextOffset)} title="Next page" aria-label="Next page" type="button"><ChevronRight size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadSubflows(lastOffset)} title="Last page" aria-label="Last page" type="button"><ChevronsRight size={14} aria-hidden /></button>
        </div>
      </footer>
      {subflowAction ? <Modal title={subflowAction.action === "rename" ? "Rename Subflow" : subflowAction.action === "duplicate" ? "Duplicate Subflow" : subflowAction.action === "delete" ? "Delete Subflow" : subflowAction.action === "archive" ? "Archive Subflow" : subflowAction.action === "disable" ? "Disable Subflow" : "Enable Subflow"} onClose={() => setSubflowAction(null)}>
        <div className="automation-modal-form">
          <p className="automation-router-modal-intro">{subflowAction.action === "delete" ? "This removes the Subflow and its Nodes graph. Router references must be removed first." : subflowAction.action === "duplicate" ? "The duplicate receives an independent Nodes graph." : "Update this Subflow without changing its stable identity."}</p>
          {subflowAction.action === "delete" && actionReferences.length ? <div className="automation-subflow-reference-warning" role="alert"><strong>Still used by Router</strong><span>Remove these references before deleting:</span><ul>{actionReferences.map((reference) => <li key={reference.id}>{reference.name} - {reference.condition}</li>)}</ul></div> : null}
          {subflowAction.action === "rename" || subflowAction.action === "duplicate" ? <Field label="Name"><input autoFocus value={subflowAction.name} onChange={(event) => setSubflowAction((current) => current ? { ...current, name: event.target.value } : current)} /></Field> : null}
          <Field label="Security PIN"><input autoFocus={!["rename", "duplicate"].includes(subflowAction.action)} inputMode="numeric" value={subflowAction.pin} onChange={(event) => setSubflowAction((current) => current ? { ...current, pin: event.target.value.replace(/\D/g, "") } : current)} /></Field>
          <div className="modal-actions"><button className="button" onClick={() => setSubflowAction(null)} type="button">Cancel</button><button className={"button " + (subflowAction.action === "delete" ? "danger" : "button-primary")} disabled={actionSaving || !subflowAction.pin.trim() || (["rename", "duplicate"].includes(subflowAction.action) && !subflowAction.name.trim()) || (subflowAction.action === "delete" && actionReferences.length > 0)} onClick={() => void completeSubflowAction()} type="button">{actionSaving ? "Saving..." : subflowAction.action === "delete" ? "Delete Subflow" : "Confirm"}</button></div>
        </div>
      </Modal> : null}
    </section>
  );
}
export type AutomationProblemViewItem = {
  problemKey: string;
  code: string;
  severity: "error" | "warning" | "info";
  blocking: boolean;
  scopeLabel: string;
  scopeIds: string[];
  source: any;
};

export function normalizeAutomationProblems(problems: any[]): AutomationProblemViewItem[] {
  const unique = new Map<string, AutomationProblemViewItem>();
  for (const problem of problems) {
    const severity = normalizedProblemSeverity(problem?.severity);
    const code = String(problem?.code ?? problem?.id ?? "problem.unknown");
    const scopeIds = [problem?.flowId, problem?.subflowId, problem?.artifactId, problem?.nodeId, problem?.edgeId, problem?.routeId, problem?.fieldId].filter((value): value is string => typeof value === "string" && Boolean(value));
    const scopeLabel = String(problem?.artifactLabel ?? problem?.subflowLabel ?? problem?.flowLabel ?? problem?.artifactId ?? problem?.artifactKind ?? problem?.source ?? "Project");
    const problemKey = [code, ...scopeIds, String(problem?.message ?? "")].join("|");
    if (unique.has(problemKey)) continue;
    unique.set(problemKey, { problemKey, code, severity, blocking: problem?.blocking === true || severity === "error", scopeLabel, scopeIds, source: problem });
  }
  return [...unique.values()].sort((left, right) => problemSeverityRank(left.severity) - problemSeverityRank(right.severity) || left.scopeLabel.localeCompare(right.scopeLabel) || left.code.localeCompare(right.code));
}

export function automationProblemsForScope(problems: AutomationProblemViewItem[], currentObjectId?: string | null): AutomationProblemViewItem[] {
  return currentObjectId ? problems.filter((problem) => problem.scopeIds.includes(currentObjectId)) : problems;
}
export function AutomationProblemsWorkspace(props: { problems: any[]; currentObjectId?: string | null; currentObjectLabel?: string; onOpenProblem?(problem: any): void }) {
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [scope, setScope] = useState<"project" | "current">("project");
  const [pageOffset, setPageOffset] = useState(0);
  const [selectedProblemKey, setSelectedProblemKey] = useState<string | null>(null);
  const problems = useMemo(() => normalizeAutomationProblems(props.problems), [props.problems]);
  useEffect(() => {
    if (selectedProblemKey && !problems.some((problem) => problem.problemKey === selectedProblemKey)) setSelectedProblemKey(null);
  }, [problems, selectedProblemKey]);
  useEffect(() => setPageOffset(0), [filter, scope, props.currentObjectId]);
  const scoped = scope === "current" ? automationProblemsForScope(problems, props.currentObjectId) : problems;
  const visible = filter === "all" ? scoped : scoped.filter((problem) => problem.severity === filter);
  const pageSize = 100;
  const page = visible.slice(pageOffset, pageOffset + pageSize);
  const grouped = new Map<string, Map<AutomationProblemViewItem["severity"], AutomationProblemViewItem[]>>();
  for (const problem of page) {
    const severityGroups = grouped.get(problem.scopeLabel) ?? new Map();
    const entries = severityGroups.get(problem.severity) ?? [];
    entries.push(problem);
    severityGroups.set(problem.severity, entries);
    grouped.set(problem.scopeLabel, severityGroups);
  }
  const counts = {
    error: scoped.filter((problem) => problem.severity === "error").length,
    warning: scoped.filter((problem) => problem.severity === "warning").length,
    info: scoped.filter((problem) => problem.severity === "info").length
  };
  const currentScopeUnavailable = !props.currentObjectId;
  return (
    <section className="automation-problems-workspace">
      <header className="automation-problems-header">
        <div><AlertTriangle size={16} aria-hidden /><div><strong>Problems</strong><span>Validation, authoring, and runtime issues</span></div></div>
        <span aria-label={problems.length + " problems"}>{problems.length}</span>
      </header>
      <div className="automation-problems-controls">
        <div aria-label="Problem scope" className="automation-problem-filters" role="group">
          <button aria-pressed={scope === "project"} onClick={() => setScope("project")} type="button">Whole project</button>
          <button aria-pressed={scope === "current"} disabled={currentScopeUnavailable} onClick={() => setScope("current")} title={currentScopeUnavailable ? "Select an object to filter its problems." : undefined} type="button">Current object</button>
        </div>
        <div aria-label="Problem severity" className="automation-problem-filters" role="toolbar">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")} type="button">All <span>{scoped.length}</span></button>
          <button aria-pressed={filter === "error"} onClick={() => setFilter("error")} type="button">Errors <span>{counts.error}</span></button>
          <button aria-pressed={filter === "warning"} onClick={() => setFilter("warning")} type="button">Warnings <span>{counts.warning}</span></button>
          <button aria-pressed={filter === "info"} onClick={() => setFilter("info")} type="button">Info <span>{counts.info}</span></button>
        </div>
      </div>
      {scope === "current" && props.currentObjectLabel ? <p className="automation-problems-scope">Showing problems for <strong>{props.currentObjectLabel}</strong></p> : null}
      {page.length ? <div aria-label="Current problems" className="automation-problem-groups">
        {[...grouped.entries()].map(([scopeLabel, severityGroups]) => <section className="automation-problem-group" key={scopeLabel}>
          <header><strong>{scopeLabel}</strong><span>{[...severityGroups.values()].reduce((total, entries) => total + entries.length, 0)}</span></header>
          {(["error", "warning", "info"] as const).map((severity) => {
            const entries = severityGroups.get(severity) ?? [];
            if (!entries.length) return null;
            return <div className={"automation-problem-severity-group " + severity} key={severity}>
              <strong>{severity === "error" ? "Blocking errors" : severity === "warning" ? "Recommendations" : "Information"}</strong>
              <ul className="automation-problem-list">{entries.map((problem) => {
                const Icon = problem.severity === "error" ? AlertCircle : problem.severity === "warning" ? AlertTriangle : Info;
                return <li key={problem.problemKey}>
                  <button aria-pressed={selectedProblemKey === problem.problemKey} className={selectedProblemKey === problem.problemKey ? "selected" : ""} onClick={() => { setSelectedProblemKey(problem.problemKey); props.onOpenProblem?.(problem.source); }} type="button">
                    <Icon aria-hidden size={15} />
                    <span><strong>{problem.source.label ?? problem.code}</strong><small>{problem.source.message ?? "No explanation was provided."}</small><em><span>{problem.blocking ? "Blocking" : problem.severity === "warning" ? "Recommendation" : "Info"}</span>{problem.code}</em></span>
                    {props.onOpenProblem ? <ChevronRight aria-hidden size={14} /> : null}
                  </button>
                </li>;
              })}</ul>
            </div>;
          })}
        </section>)}
      </div> : <div className="automation-problems-empty"><CircleCheck aria-hidden size={24} /><strong>{problems.length ? "No problems in this filter" : "No problems found"}</strong><span>{scope === "current" ? "The selected object has no matching problems." : problems.length ? "Choose another scope or severity to review remaining issues." : "The current project snapshot and graph pass available checks."}</span></div>}
      {visible.length > pageSize ? <footer className="automation-runtime-pagination-footer"><span>{pageOffset + 1}-{Math.min(visible.length, pageOffset + page.length)} of {visible.length}</span><div className="automation-runtime-pagination"><button disabled={pageOffset <= 0} onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))} type="button"><ChevronLeft size={15} aria-hidden />Previous</button><button disabled={pageOffset + pageSize >= visible.length} onClick={() => setPageOffset(pageOffset + pageSize)} type="button">Next<ChevronRight size={15} aria-hidden /></button></div></footer> : null}
    </section>
  );
}

function normalizedProblemSeverity(value: unknown): "error" | "warning" | "info" {
  const severity = String(value ?? "error").toLowerCase();
  if (severity === "warning" || severity === "warn") return "warning";
  if (severity === "info" || severity === "notice") return "info";
  return "error";
}

function problemSeverityRank(value: unknown): number {
  const severity = normalizedProblemSeverity(value);
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}const RUNTIME_RUN_PAGE_SIZE = 25;
const RUNTIME_ACTION_PAGE_SIZE = 50;
const ADAPTATION_PAGE_SIZE = 25;
const ADAPTATION_STATUSES = ["proposed", "testing", "validated", "applied", "rejected", "disabled", "reverted", "superseded"];
const WORKBENCH_PAGE_SIZE = 25;
const ROUTER_ROUTE_PAGE_SIZE = 100;
export function AutomationFlowMapWorkspace(props: { projectId: string | null; flow: any; initialRouter?: any; initialSubflows?: any[]; onCreateSubflow?(): void }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [flowMap, setFlowMap] = useState<any | null>(() => props.initialRouter ?? null);
  const [subflows, setSubflows] = useState<any[]>(() => props.initialSubflows ?? []);
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [routePageOffset, setRoutePageOffset] = useState(0);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [routeDraft, setRouteDraft] = useState(() => defaultFlowMapRouteDraft());
  const [groupDraft, setGroupDraft] = useState({ groupId: "", name: "", description: "", order: 0, collapsed: false, status: "active" });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [fallbackModalOpen, setFallbackModalOpen] = useState(false);
  const [fallbackDraft, setFallbackDraft] = useState({ kind: "subflow" as "subflow" | "fail", targetSubflowId: "", message: "" });
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeTestValue, setRouteTestValue] = useState("");
  const [routeTestResult, setRouteTestResult] = useState<null | { matched: boolean; reason: string }>(null);
  const [testingRoute, setTestingRoute] = useState(false);
  const [authorization, setAuthorization] = useState<null | { action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route" }>(null);
  const [authorizationPin, setAuthorizationPin] = useState("");
  const [routeMutation, setRouteMutation] = useState<null | { ruleId: string; action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete" }>(null);
  const [loading, setLoading] = useState(() => Boolean(props.projectId && flowId && !props.initialSubflows?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scopeRef = useRef("");
  const routeGroups = useMemo(() => flowMapRouteGroupsFromRouter(flowMap), [flowMap]);
  const sortedRoutes = useMemo(() => flowMapRoutes(flowMap), [flowMap]);
  const visibleRoutes = useMemo(() => sortedRoutes.filter((route) => selectedGroupId === "all" ? true : selectedGroupId === "ungrouped" ? !route.metadata?.groupId : route.metadata?.groupId === selectedGroupId), [sortedRoutes, selectedGroupId]);
  const visibleRoutePage = useMemo(() => visibleRoutes.slice(routePageOffset, routePageOffset + ROUTER_ROUTE_PAGE_SIZE), [routePageOffset, visibleRoutes]);
  const selectedRule = useMemo(() => sortedRoutes.find((route) => route.ruleId === selectedRuleId) ?? null, [sortedRoutes, selectedRuleId]);
  const activeSubflows = useMemo(() => subflows.filter((subflow) => subflow.status !== "archived").sort((left, right) => String(left.name ?? left.subflowId).localeCompare(String(right.name ?? right.subflowId))), [subflows]);
  const subflowOptions = useMemo(() => activeSubflows.map((subflow) => ({ value: subflow.subflowId, label: subflow.name ?? subflow.subflowId, description: [subflow.description, subflow.role ? "Role: " + subflow.role : "", subflow.subflowId].filter(Boolean).join(" | ") })), [activeSubflows]);

  useEffect(() => {
    scopeRef.current = String(props.projectId ?? "") + ":" + String(flowId ?? "");
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft());
    setRouteModalOpen(false);
    if (!props.projectId || !flowId) return;
    setLoading(true);
    void Promise.all([loadFlowMap(), loadSubflows()]).finally(() => setLoading(false));
  }, [props.projectId, flowId]);
  useEffect(() => setRoutePageOffset(0), [props.projectId, flowId, selectedGroupId]);
  useEffect(() => {
    if (routePageOffset < visibleRoutes.length || routePageOffset === 0) return;
    setRoutePageOffset(Math.max(0, Math.floor((Math.max(0, visibleRoutes.length - 1)) / ROUTER_ROUTE_PAGE_SIZE) * ROUTER_ROUTE_PAGE_SIZE));
  }, [routePageOffset, visibleRoutes.length]);


  useEffect(() => {
    const refreshSubflows = (event: Event) => {
      const changedFlowId = (event as CustomEvent<{ flowId?: string }>).detail?.flowId;
      if (changedFlowId === flowId) void loadSubflows();
    };
    window.addEventListener("fluxiq:subflows-changed", refreshSubflows);
    return () => window.removeEventListener("fluxiq:subflows-changed", refreshSubflows);
  }, [props.projectId, flowId]);

  useEffect(() => {
    if (selectedRule) setRouteDraft(flowMapRouteDraftFromRule(selectedRule));
  }, [selectedRuleId, selectedRule]);

  const loadFlowMap = async () => {
    if (!props.projectId || !flowId) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    setError("");
    const result = await api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Flow Map could not be loaded.");
    else setFlowMap(result.payload?.router ?? null);
  };

  const loadSubflows = async () => {
    if (!props.projectId || !flowId) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    const result = await api.post<{ subflows?: any[]; page?: { subflows?: any[] } }>("list-flow-subflows", { projectId: props.projectId, flowId, limit: 100, offset: 0 });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Subflow targets could not be loaded.");
    else setSubflows(result.payload?.subflows ?? result.payload?.page?.subflows ?? []);
  };
  const retryFlowMap = async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadFlowMap(), loadSubflows()]);
    setLoading(false);
  };
  const beginNewRoute = () => {
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft({ targetSubflowId: activeSubflows[0]?.subflowId ?? "", groupId: selectedGroupId !== "all" && selectedGroupId !== "ungrouped" ? selectedGroupId : "" }));
    setRouteTestValue("");
    setRouteTestResult(null);
    setRouteModalOpen(true);
  };

  const editRoute = (rule: any) => {
    setSelectedRuleId(rule.ruleId ?? null);
    setRouteDraft(flowMapRouteDraftFromRule(rule));
    setRouteTestValue("");
    setRouteTestResult(null);
    setRouteModalOpen(true);
  };

  const beginNewGroup = () => {
    setGroupDraft({ groupId: "", name: "", description: "", order: nextFlowMapGroupOrder(routeGroups), collapsed: false, status: "active" });
    setGroupModalOpen(true);
  };

  const editGroup = (group: any) => {
    setGroupDraft({ groupId: group.groupId ?? "", name: group.name ?? "", description: group.description ?? "", order: group.order ?? 0, collapsed: group.collapsed === true, status: group.status ?? "active" });
    setGroupModalOpen(true);
  };

  const beginFallbackEdit = () => {
    const fallback = flowMap?.fallback;
    setFallbackDraft({
      kind: fallback?.kind === "subflow" ? "subflow" : "fail",
      targetSubflowId: fallback?.kind === "subflow" ? fallback.subflowId ?? activeSubflows[0]?.subflowId ?? "" : activeSubflows[0]?.subflowId ?? "",
      message: fallback?.kind === "fail" ? fallback.message ?? "" : ""
    });
    setFallbackModalOpen(true);
  };
  const requestAuthorization = (action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route") => {
    setAuthorization({ action });
    setAuthorizationPin("");
  };

  const requestRouteMutation = (ruleId: string, action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete") => {
    setRouteMutation({ ruleId, action });
    requestAuthorization("mutate-route");
  };
  const runRouteTest = async () => {
    if (!props.projectId || !flowId) return;
    setTestingRoute(true);
    const result = await api.post<{ matched?: boolean; reason?: string }>("test-flow-map-route-condition", { projectId: props.projectId, flowId, ...buildFlowMapRouteTestPayload(routeDraft, routeTestValue) });
    setTestingRoute(false);
    if (!result.ok) {
      setRouteTestResult({ matched: false, reason: result.error ?? "The route test could not be completed." });
      return;
    }
    setRouteTestResult({ matched: result.payload?.matched === true, reason: result.payload?.reason ?? "No explanation was returned." });
  };
  const completeAuthorizedAction = async () => {
    if (!props.projectId || !flowId || !authorization || !authorizationPin.trim()) return;
    setSaving(true);
    setError("");
    const base = { projectId: props.projectId, flowId, authorizationPin: authorizationPin.trim() };
    const result = authorization.action === "save-route"
      ? await api.post<{ router?: any }>("save-flow-map-route", { ...base, ...(routeDraft.ruleId ? { ruleId: routeDraft.ruleId } : {}), name: routeDraft.name, description: routeDraft.description, targetSubflowId: routeDraft.targetSubflowId, order: routeDraft.order, status: routeDraft.status, groupId: routeDraft.groupId || null, setAsFallback: routeDraft.setAsFallback, confidence: routeDraft.confidence, conditionSummary: flowMapConditionSummary(routeDraft), conditionSignalPath: routeDraft.conditionMode === "when" ? routeDraft.conditionSource + "." + routeDraft.conditionField.trim() : "", conditionOperator: routeDraft.conditionOperator, conditionExpected: flowMapConditionExpected(routeDraft), clearCondition: routeDraft.conditionMode === "always" })
      : authorization.action === "delete-route"
        ? await api.post<{ router?: any }>("delete-flow-map-route", { ...base, ruleId: routeDraft.ruleId })
        : authorization.action === "save-group"
          ? await api.post<{ router?: any }>("save-flow-map-route-group", { ...base, ...(groupDraft.groupId ? { groupId: groupDraft.groupId } : {}), name: groupDraft.name, description: groupDraft.description, order: groupDraft.order, collapsed: groupDraft.collapsed, status: groupDraft.status })
          : authorization.action === "delete-group"
            ? await api.post<{ router?: any }>("delete-flow-map-route-group", { ...base, groupId: groupDraft.groupId })
            : authorization.action === "save-fallback"
              ? await api.post<{ router?: any }>("save-flow-map-fallback", { ...base, kind: fallbackDraft.kind, ...(fallbackDraft.kind === "subflow" ? { targetSubflowId: fallbackDraft.targetSubflowId } : { message: fallbackDraft.message }) })
              : await api.post<{ router?: any }>("mutate-flow-map-route", { ...base, ruleId: routeMutation?.ruleId, action: routeMutation?.action });
    setSaving(false);
    if (!result.ok || !result.payload?.router) {
      setError(result.error ?? "Flow Map change could not be saved.");
      return;
    }
    setFlowMap(result.payload.router);
    setAuthorization(null);
    setAuthorizationPin("");
    setGroupModalOpen(false);
    if (authorization.action === "save-route") {
      setSelectedRuleId((result.payload.router.rules ?? []).find((rule: any) => rule.name === routeDraft.name)?.ruleId ?? routeDraft.ruleId ?? null);
      setRouteModalOpen(false);
    }
    if (authorization.action === "delete-route") {
      setSelectedRuleId(null);
      setRouteDraft(defaultFlowMapRouteDraft());
      setRouteModalOpen(false);
    }
  };

  if (!flowId) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        <header><div><strong>Router</strong><span>Route traffic into the right subflow</span></div></header>
        <section className="automation-router-empty-state">
          <Route size={22} aria-hidden />
          <strong>Select a Flow to edit its Router</strong>
          <p>Router rules belong to one top-level Flow.</p>
        </section>
      </section>
    );
  }
  if (loading) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        <header>
          <div><strong>Router</strong><span>Loading route targets...</span></div>
        </header>
        <div aria-busy="true" className="automation-router-loading" aria-label="Loading Router routes">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (!activeSubflows.length) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void retryFlowMap()} type="button">Retry</button></div> : null}
        <header><div><strong>Router</strong><span>Route traffic into the right subflow</span></div></header>
        <section className="automation-router-empty-state">
          <Workflow size={22} aria-hidden />
          <strong>This Flow needs a subflow</strong>
          <p>Router rules send each run to a subflow target.</p>
          <button className="button button-primary" disabled={!props.onCreateSubflow} onClick={props.onCreateSubflow} type="button">
            <Plus size={14} aria-hidden />Create Subflow
          </button>
        </section>
      </section>
    );
  }
  return (
    <section className="automation-runs-workspace automation-flow-map-workspace">
      <StatusText value={error} />
      <header>
        <div><strong>Router</strong><span>{saving ? "Saving changes..." : flowMap?.name ?? "Flow Map route orchestration"}</span></div>
        <div className="automation-runtime-log-toolbar">
          <button className="button button-primary" onClick={beginNewRoute} disabled={!flowId || !activeSubflows.length} type="button"><Plus size={14} aria-hidden />New Route</button>
        </div>
      </header>
      <section className="automation-router-workbench" aria-label="Router routes">
        <div className="automation-router-group-bar">
          <div className="automation-router-group-filters" role="group" aria-label="Filter routes by group">
            {[{ groupId: "all", name: "All routes", count: sortedRoutes.length }, { groupId: "ungrouped", name: "Ungrouped", count: sortedRoutes.filter((route) => !route.metadata?.groupId).length }, ...routeGroups.map((group) => ({ ...group, count: sortedRoutes.filter((route) => route.metadata?.groupId === group.groupId).length }))].map((group) => (
              <div className={`automation-router-group-option${selectedGroupId === group.groupId ? " selected" : ""}`} key={group.groupId}>
                <button aria-pressed={selectedGroupId === group.groupId} onClick={() => setSelectedGroupId(group.groupId)} type="button">
                  <span>{group.name}</span>
                  <small>{group.count}</small>
                </button>
                {group.groupId !== "all" && group.groupId !== "ungrouped" ? <button aria-label={`Edit ${group.name}`} className="automation-router-group-edit" onClick={() => editGroup(group)} title={`Edit ${group.name}`} type="button"><Pencil size={13} aria-hidden /></button> : null}
              </div>
            ))}
          </div>
          <button className="button automation-router-new-group" onClick={beginNewGroup} disabled={!flowId} type="button"><Plus size={14} aria-hidden />Group</button>
        </div>

        <div className="automation-router-route-list-heading" aria-hidden>
          <span>Order</span>
          <span>Route and condition</span>
          <span>Target</span>
          <span>Group</span>
          <span>Status</span>
          <span />
        </div>
        <div className="automation-router-route-rows">
          {visibleRoutePage.map((rule, index) => {
            const routeIndex = routePageOffset + index;
            const group = routeGroups.find((item) => item.groupId === rule.metadata?.groupId);
            return (
              <div className="automation-router-route-row" key={rule.ruleId}>
                <button aria-label={"Priority " + String(rule.order ?? routeIndex + 1) + ": " + String(rule.name ?? rule.ruleId) + " to " + targetSubflowLabel(activeSubflows, rule.target?.subflowId)} className="automation-router-route-main" onClick={() => editRoute(rule)} type="button">
                  <span className="automation-router-route-order">{rule.order ?? routeIndex + 1}</span>
                  <span className="automation-router-route-copy"><strong>{rule.name ?? rule.ruleId}</strong><small>{flowMapConditionText(rule)}</small></span>
                  <span className="automation-router-route-target"><Workflow size={14} aria-hidden />{targetSubflowLabel(activeSubflows, rule.target?.subflowId)}</span>
                  <span className="automation-router-route-group">{group?.name ?? "Ungrouped"}</span>
                  <span className="automation-router-route-status"><StatusBadge value={rule.status ?? "active"} /></span>
                </button>
                <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + String(rule.name ?? rule.ruleId)} options={[
                  { id: "move-up", label: "Move up", icon: <ArrowUp size={14} aria-hidden />, disabled: routeIndex === 0, onSelect: () => requestRouteMutation(rule.ruleId, "move_up") },
                  { id: "move-down", label: "Move down", icon: <ArrowDown size={14} aria-hidden />, disabled: routeIndex === visibleRoutes.length - 1, onSelect: () => requestRouteMutation(rule.ruleId, "move_down") },
                  { id: "duplicate", label: "Duplicate route", icon: <Copy size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "duplicate") },
                  { id: "toggle", label: rule.status === "active" ? "Disable route" : "Enable route", icon: <Power size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "toggle") },
                  { id: "delete", label: "Delete route", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => requestRouteMutation(rule.ruleId, "delete") }
                ]} />
              </div>
            );
          })}
          {!visibleRoutes.length ? <div className="automation-router-routes-empty">
            <Route size={20} aria-hidden />
            <strong>{sortedRoutes.length ? "No routes in this group" : "No routes yet"}</strong>
            <span>{sortedRoutes.length ? "Choose another group or add a route here." : "Add the first route to send runtime traffic to a subflow."}</span>
            <button className="button button-primary" onClick={beginNewRoute} type="button"><Plus size={14} aria-hidden />New Route</button>
          </div> : null}
        </div>
        {visibleRoutes.length > ROUTER_ROUTE_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer">
          <span>{routePageOffset + 1}-{Math.min(visibleRoutes.length, routePageOffset + visibleRoutePage.length)} of {visibleRoutes.length} routes</span>
          <div className="automation-runtime-pagination">
            <button disabled={routePageOffset === 0} onClick={() => setRoutePageOffset(Math.max(0, routePageOffset - ROUTER_ROUTE_PAGE_SIZE))} type="button"><ChevronLeft size={15} aria-hidden />Previous</button>
            <button disabled={routePageOffset + ROUTER_ROUTE_PAGE_SIZE >= visibleRoutes.length} onClick={() => setRoutePageOffset(routePageOffset + ROUTER_ROUTE_PAGE_SIZE)} type="button">Next<ChevronRight size={15} aria-hidden /></button>
          </div>
        </footer> : null}

        <button aria-label="Edit fallback behavior" className="automation-router-fallback-row" onClick={beginFallbackEdit} type="button">
          <span className="automation-router-fallback-icon"><Route size={16} aria-hidden /></span>
          <span><strong>Fallback</strong><small>Used when no route condition matches</small></span>
          <span className="automation-router-fallback-target">{flowMap?.fallback?.kind === "subflow" ? targetSubflowLabel(activeSubflows, flowMap.fallback.subflowId) : flowMapFallbackLabel(flowMap) === "-" ? "Not configured" : flowMapFallbackLabel(flowMap)}</span>
          <ChevronRight className="automation-router-route-chevron" size={16} aria-hidden />
        </button>
      </section>
      {routeModalOpen ? <Modal className="automation-router-modal" title={routeDraft.ruleId ? "Edit Route" : "New Route"} onClose={() => setRouteModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <div className="automation-router-editor-grid">
            <Field label="Route name"><input autoFocus value={routeDraft.name} onChange={(event) => setRouteDraft((current) => ({ ...current, name: event.target.value }))} placeholder="For example, Handle refund requests" /></Field>
            <Combobox {...(!routeDraft.targetSubflowId ? { error: "Choose a target subflow." } : {})} label="Target subflow" onChange={(value) => setRouteDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={routeDraft.targetSubflowId} />
            <Field label="Route group"><select value={routeDraft.groupId} onChange={(event) => setRouteDraft((current) => ({ ...current, groupId: event.target.value }))}><option value="">Ungrouped</option>{routeGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></Field>
            <Field label="Priority"><input min="0" step="1" type="number" value={routeDraft.order} onChange={(event) => setRouteDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></Field>
          </div>
          <section className="automation-router-condition-builder" aria-labelledby="route-match-heading">
            <header>
              <div><strong id="route-match-heading">Match behavior</strong><span>{routeDraft.conditionMode === "always" ? "This route is considered whenever earlier routes do not match." : flowMapConditionSummary(routeDraft)}</span></div>
              <div className="automation-segmented-control" role="group" aria-label="Route match behavior">
                <button aria-pressed={routeDraft.conditionMode === "always"} onClick={() => setRouteDraft((current) => ({ ...current, conditionMode: "always" }))} type="button">Always</button>
                <button aria-pressed={routeDraft.conditionMode === "when"} onClick={() => setRouteDraft((current) => ({ ...current, conditionMode: "when" }))} type="button">When</button>
              </div>
            </header>
            {routeDraft.conditionMode === "when" ? <div className="automation-router-condition-row">
              <Field label="Source"><select value={routeDraft.conditionSource} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionSource: event.target.value }))}><option value="inputs">Run input</option><option value="state">Current state</option></select></Field>
              <Field label="Field"><input value={routeDraft.conditionField} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionField: event.target.value.replace(/^\.+/, "") }))} placeholder="intent" /></Field>
              <Field label="Comparison"><select value={routeDraft.conditionOperator} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionOperator: event.target.value }))}>{FLOW_MAP_CONDITION_OPERATORS.map((operator) => <option key={operator} value={operator}>{flowMapConditionOperatorLabel(operator)}</option>)}</select></Field>
              {routeDraft.conditionOperator !== "exists" ? <Field label="Value type"><select value={routeDraft.conditionValueType} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionValueType: event.target.value }))}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True or false</option></select></Field> : null}
              {routeDraft.conditionOperator !== "exists" ? <Field label="Expected value">{routeDraft.conditionValueType === "boolean" ? <select value={routeDraft.conditionExpected} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionExpected: event.target.value }))}><option value="true">True</option><option value="false">False</option></select> : <input type={routeDraft.conditionValueType === "number" ? "number" : "text"} value={routeDraft.conditionExpected} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionExpected: event.target.value }))} placeholder={routeDraft.conditionValueType === "number" ? "0" : "Value to compare"} />}</Field> : null}
            </div> : null}
          </section>
          <section className="automation-router-route-test" aria-labelledby="route-test-heading">
            <div><strong id="route-test-heading">Test this route</strong><span>Check this condition with a sample value before saving.</span></div>
            {routeDraft.conditionMode === "when" ? <Field label={"Sample " + (routeDraft.conditionSource === "state" ? "state" : "input") + " value"}>{routeDraft.conditionValueType === "boolean" ? <select value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }}><option value="">Choose value</option><option value="true">True</option><option value="false">False</option></select> : <input type={routeDraft.conditionValueType === "number" ? "number" : "text"} value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }} placeholder="Value received at runtime" />}</Field> : null}
            <button className="button" disabled={testingRoute || (routeDraft.conditionMode === "when" && routeTestValue === "")} onClick={() => void runRouteTest()} type="button">{testingRoute ? "Testing..." : "Test condition"}</button>
            {routeTestResult ? <div className={"automation-router-test-result " + (routeTestResult.matched ? "matched" : "not-matched")} role="status"><CircleCheck size={15} aria-hidden /><span><strong>{routeTestResult.matched ? "Route matches" : "Route does not match"}</strong><small>{routeTestResult.reason}</small></span></div> : null}
          </section>
          <details className="automation-router-route-details">
            <summary>Route details</summary>
            <div className="automation-router-editor-grid">
              <Field label="Status"><select value={routeDraft.status} onChange={(event) => setRouteDraft((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></Field>
              <Field label="Confidence"><input max="1" min="0" step="0.01" type="number" value={routeDraft.confidence} onChange={(event) => setRouteDraft((current) => ({ ...current, confidence: Number(event.target.value) }))} /></Field>
              <Field label="Description"><textarea rows={3} value={routeDraft.description} onChange={(event) => setRouteDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
            </div>
          </details>
          <div className="modal-actions automation-router-editor-actions">
            {routeDraft.ruleId ? <button className="button danger" onClick={() => requestAuthorization("delete-route")} disabled={saving} type="button"><Trash2 size={14} aria-hidden />Delete</button> : <span />}
            <div><button className="button" onClick={() => setRouteModalOpen(false)} type="button">Cancel</button><button className="button button-primary" onClick={() => requestAuthorization("save-route")} disabled={!routeDraft.name.trim() || !routeDraft.targetSubflowId || saving || (routeDraft.conditionMode === "when" && !routeDraft.conditionField.trim())} type="button">Save Route</button></div>
          </div>
        </div>
      </Modal> : null}
      {fallbackModalOpen ? <Modal className="automation-router-modal" title="Fallback Behavior" onClose={() => setFallbackModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <p className="automation-router-modal-intro">Choose what the Router should do when no active route matches.</p>
          <Field label="Behavior">
            <select value={fallbackDraft.kind} onChange={(event) => setFallbackDraft((current) => ({ ...current, kind: event.target.value === "subflow" ? "subflow" : "fail" }))}>
              <option value="subflow">Send to a subflow</option>
              <option value="fail">Stop the run</option>
            </select>
          </Field>
          {fallbackDraft.kind === "subflow"
            ? <Combobox {...(!fallbackDraft.targetSubflowId ? { error: "Choose a fallback subflow." } : {})} label="Fallback subflow" onChange={(value) => setFallbackDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={fallbackDraft.targetSubflowId} />
            : <Field label="Run message"><textarea autoFocus rows={3} value={fallbackDraft.message} onChange={(event) => setFallbackDraft((current) => ({ ...current, message: event.target.value }))} placeholder="Explain why the run stopped" /></Field>}
          <div className="modal-actions"><button className="button" onClick={() => setFallbackModalOpen(false)} type="button">Cancel</button><button className="button button-primary" onClick={() => requestAuthorization("save-fallback")} disabled={saving || (fallbackDraft.kind === "subflow" ? !fallbackDraft.targetSubflowId : !fallbackDraft.message.trim())} type="button">Save Fallback</button></div>
        </div>
      </Modal> : null}
      {groupModalOpen ? <Modal title={groupDraft.groupId ? "Edit Route Group" : "New Route Group"} onClose={() => setGroupModalOpen(false)}>
        <div className="automation-modal-form">
          <Field label="Name"><input autoFocus value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Description"><input value={groupDraft.description} onChange={(event) => setGroupDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
          <Field label="Status"><select value={groupDraft.status} onChange={(event) => setGroupDraft((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></Field>
          <Field label="Order"><input type="number" value={groupDraft.order} onChange={(event) => setGroupDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></Field>
          <label className="automation-settings-toggle"><input checked={groupDraft.collapsed} onChange={(event) => setGroupDraft((current) => ({ ...current, collapsed: event.target.checked }))} type="checkbox" /><span>Collapsed by default</span></label>
          <div className="modal-actions"><button className="button button-primary" onClick={() => requestAuthorization("save-group")} disabled={!groupDraft.name.trim()} type="button">Save Group</button>{groupDraft.groupId ? <button className="button danger" onClick={() => requestAuthorization("delete-group")} type="button">Delete Group</button> : null}</div>
        </div>
      </Modal> : null}
      {authorization ? <Modal title="Authorize Router Change" onClose={() => setAuthorization(null)}>
        <div className="automation-modal-form">
          <p className="automation-router-modal-intro">Confirm this Router change with your security PIN.</p>
          <Field label="Security PIN"><input autoFocus inputMode="numeric" value={authorizationPin} onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, ""))} /></Field>
          <div className="modal-actions"><button className="button" onClick={() => setAuthorization(null)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={!authorizationPin.trim() || saving} onClick={() => void completeAuthorizedAction()} type="button">{saving ? "Saving..." : "Confirm"}</button></div>
        </div>
      </Modal> : null}
    </section>
  );
}

const FLOW_MAP_CONDITION_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists", "matches", "similar_to"];

function defaultFlowMapRouteDraft(overrides: Partial<ReturnType<typeof defaultFlowMapRouteDraftShape>> = {}) {
  return { ...defaultFlowMapRouteDraftShape(), ...overrides };
}

function defaultFlowMapRouteDraftShape() {
  return { ruleId: "", name: "", description: "", targetSubflowId: "", order: 0, status: "active", groupId: "", confidence: 1, conditionMode: "always", conditionSource: "inputs", conditionField: "", conditionOperator: "equals", conditionValueType: "text", conditionExpected: "", setAsFallback: false };
}

function flowMapRouteDraftFromRule(rule: any) {
  return defaultFlowMapRouteDraft({
    ruleId: rule.ruleId ?? "",
    name: rule.name ?? "",
    description: rule.description ?? "",
    targetSubflowId: rule.target?.kind === "subflow" ? rule.target.subflowId ?? "" : "",
    order: rule.order ?? 0,
    status: rule.status ?? "active",
    groupId: typeof rule.metadata?.groupId === "string" ? rule.metadata.groupId : "",
    confidence: typeof rule.confidence === "number" ? rule.confidence : 1,
    ...flowMapConditionDraft(rule.condition),
    setAsFallback: false
  });
}

export function buildFlowMapRouteTestPayload(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>, actualValue: string): { condition?: any; inputs?: any; currentStateSummary?: any } {
  if (draft.conditionMode === "always") return {};
  const value = draft.conditionValueType === "number" ? Number(actualValue) : draft.conditionValueType === "boolean" ? actualValue === "true" : actualValue;
  const source = nestedRouteTestValue(draft.conditionField, value);
  const condition = {
    signalPath: draft.conditionSource + "." + draft.conditionField.trim(),
    operator: draft.conditionOperator,
    ...(draft.conditionOperator !== "exists" ? { expected: flowMapConditionExpected(draft) } : {})
  };
  return draft.conditionSource === "state" ? { condition, currentStateSummary: source } : { condition, inputs: source };
}
function nestedRouteTestValue(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  const root: Record<string, unknown> = {};
  let cursor = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else {
      const child: Record<string, unknown> = {};
      cursor[part] = child;
      cursor = child;
    }
  });
  return root;
}
export function flowMapConditionDraft(condition: any) {
  const signalPath = typeof condition?.signalPath === "string" ? condition.signalPath : "";
  const source = signalPath.startsWith("state.") ? "state" : "inputs";
  const field = signalPath.startsWith(source + ".") ? signalPath.slice(source.length + 1) : signalPath;
  const expected = condition?.expected;
  return {
    conditionMode: signalPath ? "when" : "always",
    conditionSource: source,
    conditionField: field,
    conditionOperator: typeof condition?.operator === "string" ? condition.operator : "equals",
    conditionValueType: typeof expected === "boolean" ? "boolean" : typeof expected === "number" ? "number" : "text",
    conditionExpected: expected === undefined ? "" : String(expected)
  };
}

export function flowMapConditionExpected(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>): unknown {
  if (draft.conditionMode === "always" || draft.conditionOperator === "exists") return undefined;
  if (draft.conditionValueType === "number") return Number(draft.conditionExpected);
  if (draft.conditionValueType === "boolean") return draft.conditionExpected === "true";
  return draft.conditionExpected;
}

export function flowMapConditionSummary(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>): string {
  if (draft.conditionMode === "always") return "Always";
  const field = draft.conditionField.trim() || "Choose a field";
  const expected = draft.conditionOperator === "exists" ? "" : " " + String(flowMapConditionExpected(draft) ?? "");
  return (draft.conditionSource === "state" ? "Current state " : "Run input ") + field + " " + flowMapConditionOperatorLabel(draft.conditionOperator).toLowerCase() + expected;
}

function flowMapConditionOperatorLabel(operator: string): string {
  return ({ exists: "Exists", equals: "Equals", not_equals: "Does not equal", contains: "Contains", greater_than: "Is greater than", less_than: "Is less than", matches: "Matches pattern", similar_to: "Is similar to" } as Record<string, string>)[operator] ?? operator.replaceAll("_", " ");
}
function flowMapRouteGroupsFromRouter(router: any | null): any[] {
  const groups = Array.isArray(router?.metadata?.routeGroups) ? router.metadata.routeGroups : [];
  return groups.filter((group: any) => group?.groupId && group?.name).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0) || String(left.name).localeCompare(String(right.name)));
}

function flowMapConditionText(rule: any): string {
  if (rule?.condition) return compactConditionLabel(rule.condition);
  if (typeof rule?.metadata?.conditionSummary === "string" && rule.metadata.conditionSummary.trim()) return rule.metadata.conditionSummary.trim();
  return "Always";
}
export function flowMapRoutes(router: any | null): any[] {
  return (Array.isArray(router?.rules) ? router.rules : []).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0) || String(left.name ?? left.ruleId).localeCompare(String(right.name ?? right.ruleId)));
}

function nextFlowMapGroupOrder(groups: any[]): number {
  return groups.reduce((max, group) => Math.max(max, Number(group.order ?? 0)), -10) + 10;
}

function targetSubflowLabel(subflows: any[], subflowId: string | undefined): string {
  if (!subflowId) return "No target";
  return subflows.find((subflow) => subflow.subflowId === subflowId)?.name ?? subflowId;
}
export type InstructionDirectoryState = { search: string; status: string; scopeKind: string; requirement: string; sort: "updated" | "title" | "status" | "scope" | "priority"; direction: "asc" | "desc"; limit: number; offset: number };

export function readInstructionDirectoryUrlState(search = typeof window === "undefined" ? "" : window.location.search): InstructionDirectoryState {
  const params = new URLSearchParams(search);
  const limit = [10, 25, 50].includes(Number(params.get("instructionPageSize"))) ? Number(params.get("instructionPageSize")) : WORKBENCH_PAGE_SIZE;
  const sort = params.get("instructionSort");
  return {
    search: params.get("instructionQuery") ?? "", status: params.get("instructionStatus") ?? "", scopeKind: params.get("instructionScope") ?? "", requirement: params.get("instructionRequirement") ?? "",
    sort: sort === "title" || sort === "status" || sort === "scope" || sort === "priority" ? sort : "updated",
    direction: params.get("instructionDirection") === "asc" ? "asc" : "desc", limit, offset: Math.max(0, Number(params.get("instructionOffset")) || 0)
  };
}

type InstructionDraft = { instructionId: string; title: string; body: string; scopeKind: string; routerId: string; subflowId: string; nodeId: string; errorTargetKind: "flow" | "subflow" | "node"; priority: number; requirement: string; status: string };

function emptyInstructionDraft(): InstructionDraft {
  return { instructionId: "", title: "", body: "", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow", priority: 50, requirement: "advisory", status: "active" };
}

export function instructionDraftStorageKey(projectId: string, flowId: string, instructionId?: string): string {
  return `fluxiq:instruction-draft:${projectId}:${flowId}:${instructionId || "new"}`;
}

export function instructionDraftIsDirty(draft: InstructionDraft, base: InstructionDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(base);
}

const INSTRUCTION_SCOPE_ORDER = ["global", "project", "flow", "router", "subflow", "node", "on_error", "adaptation_review"] as const;

export function effectiveInstructionOrder(instructions: any[]): any[] {
  return [...instructions].filter((instruction) => instruction?.status === "active").sort((left, right) => {
    const leftRank = INSTRUCTION_SCOPE_ORDER.indexOf(left?.scope?.kind);
    const rightRank = INSTRUCTION_SCOPE_ORDER.indexOf(right?.scope?.kind);
    return leftRank - rightRank || Number(right?.priority ?? 0) - Number(left?.priority ?? 0) || Number(left?.updatedAt ?? 0) - Number(right?.updatedAt ?? 0) || String(left?.instructionId ?? "").localeCompare(String(right?.instructionId ?? ""));
  });
}
export type InstructionImportance = "low" | "normal" | "high" | "critical" | "custom";

export const INSTRUCTION_TEMPLATES = [
  { id: "flow-goal", label: "Flow goal", description: "Define the outcome this Flow should achieve.", title: "Flow goal", body: "Achieve the Flow outcome reliably while preserving the declared inputs, outputs, and safety constraints.", scopeKind: "flow", priority: 50, requirement: "advisory" },
  { id: "safety-constraint", label: "Safety constraint", description: "Add a rule the runtime must obey.", title: "Safety constraint", body: "Do not continue when the required safety condition cannot be verified. Stop and report the missing condition clearly.", scopeKind: "flow", priority: 90, requirement: "required" },
  { id: "error-recovery", label: "On-error behavior", description: "Guide recovery from runtime failures.", title: "Error recovery", body: "When an action fails, preserve the current state, explain the failure, and choose the safest valid recovery path.", scopeKind: "on_error", priority: 75, requirement: "required" },
  { id: "router-guidance", label: "Router guidance", description: "Clarify how runs should be routed.", title: "Routing guidance", body: "Choose the most specific eligible subflow. Use fallback behavior only when no route condition matches.", scopeKind: "router", priority: 75, requirement: "advisory" },
  { id: "subflow-rule", label: "Subflow rule", description: "Constrain one reusable subflow.", title: "Subflow rule", body: "Apply this guidance whenever the selected subflow runs, regardless of which route invoked it.", scopeKind: "subflow", priority: 50, requirement: "advisory" },
  { id: "node-guidance", label: "Node guidance", description: "Guide one action node precisely.", title: "Node guidance", body: "Before this node acts, verify its required inputs and produce only the outputs declared by the node contract.", scopeKind: "node", priority: 75, requirement: "advisory" },
  { id: "review-criteria", label: "Adaptation review", description: "Set criteria for reviewing adaptations.", title: "Adaptation review criteria", body: "Approve an adaptation only when its evidence is sufficient, validations pass, and the change remains within this Flow's safety constraints.", scopeKind: "adaptation_review", priority: 75, requirement: "required" }
] as const;

export function instructionImportance(priority: number): InstructionImportance {
  if (priority === 25) return "low";
  if (priority === 50) return "normal";
  if (priority === 75) return "high";
  if (priority === 90) return "critical";
  return "custom";
}

export function instructionPriorityForImportance(importance: Exclude<InstructionImportance, "custom">): number {
  return importance === "low" ? 25 : importance === "normal" ? 50 : importance === "high" ? 75 : 90;
}
export function instructionScopeTargetError(draft: InstructionDraft): string {
  if (draft.scopeKind === "router" && !draft.routerId) return "Choose the Flow Router.";
  if (draft.scopeKind === "subflow" && !draft.subflowId) return "Choose a subflow.";
  if (draft.scopeKind === "node" && !draft.nodeId) return "Choose a node.";
  if (draft.scopeKind === "on_error" && draft.errorTargetKind === "subflow" && !draft.subflowId) return "Choose the subflow whose errors this applies to.";
  if (draft.scopeKind === "on_error" && draft.errorTargetKind === "node" && !draft.nodeId) return "Choose the node whose errors this applies to.";
  if (draft.scopeKind === "adaptation_review" && draft.errorTargetKind === "subflow" && !draft.subflowId) return "Choose the reviewed subflow.";
  return "";
}
function readStoredInstructionDraft(key: string): InstructionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return value && typeof value === "object" ? { ...emptyInstructionDraft(), ...value } : null;
  } catch {
    return null;
  }
}

export function AutomationInstructionsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const initialState = useMemo(() => readInstructionDirectoryUrlState(), []);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: initialState.limit, offset: initialState.offset, total: 0 });
  const [queryInput, setQueryInput] = useState(initialState.search);
  const [filters, setFilters] = useState({ search: initialState.search, status: initialState.status, scopeKind: initialState.scopeKind, requirement: initialState.requirement, sort: initialState.sort, direction: initialState.direction });
  const [selectedInstruction, setSelectedInstruction] = useState<any | null>(null);
  const [draftInstruction, setDraftInstruction] = useState<InstructionDraft>(() => emptyInstructionDraft());
  const [baseInstructionDraft, setBaseInstructionDraft] = useState<InstructionDraft>(() => emptyInstructionDraft());
  const [recoveryDraft, setRecoveryDraft] = useState<InstructionDraft | null>(null);
  const [pendingEditorTarget, setPendingEditorTarget] = useState<null | { kind: "new" | "open" | "view"; instructionId?: string; view?: "library" | "editor" | "effective" }>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scopeRouter, setScopeRouter] = useState<any | null>(null);
  const [scopeSubflows, setScopeSubflows] = useState<any[]>([]);
  const [scopeTargetsLoading, setScopeTargetsLoading] = useState(false);
  const [scopeTargetsError, setScopeTargetsError] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showAdvancedPriority, setShowAdvancedPriority] = useState(false);
  const [instructionView, setInstructionView] = useState<"library" | "editor" | "effective">("library");
  const [effectiveInstructions, setEffectiveInstructions] = useState<any[]>([]);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [effectiveError, setEffectiveError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const scopeRequestRef = useRef(0);
  const effectiveRequestRef = useRef(0);
  const draftDirty = instructionDraftIsDirty(draftInstruction, baseInstructionDraft);
  const draftKey = props.projectId && flowId ? instructionDraftStorageKey(props.projectId, flowId, selectedInstruction?.instructionId) : "";
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: queryInput.trim() })), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);
  useEffect(() => {
    setSelectedInstruction(null);
    const blank = emptyInstructionDraft();
    setDraftInstruction(blank);
    setBaseInstructionDraft(blank);
    setRecoveryDraft(props.projectId && flowId ? readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId)) : null);
    setInstructions([]);
    setScopeRouter(null);
    setScopeSubflows([]);
    setScopeTargetsError("");
    setEffectiveInstructions([]);
    setEffectiveError("");
    setInstructionView("library");
    if (!props.projectId || !flowId) setPage((current) => ({ ...current, offset: 0, total: 0 }));
  }, [props.projectId, flowId]);
  useEffect(() => {
    if (props.projectId && flowId) void loadInstructions(page.offset);
  }, [props.projectId, flowId, filters.search, filters.status, filters.scopeKind, filters.requirement, filters.sort, filters.direction, page.limit]);
  useEffect(() => {
    if (instructionView === "effective" && props.projectId && flowId && !effectiveInstructions.length && !effectiveLoading) { void loadEffectiveInstructions(); if (!scopeSubflows.length) void loadInstructionScopeTargets("subflows"); }
  }, [instructionView, props.projectId, flowId]);  useEffect(() => {
    if (!props.projectId || !flowId) return;
    if (draftInstruction.scopeKind === "router" && !scopeRouter) void loadInstructionScopeTargets("router");
    if (["subflow", "on_error", "adaptation_review"].includes(draftInstruction.scopeKind) && !scopeSubflows.length) void loadInstructionScopeTargets("subflows");
  }, [props.projectId, flowId, draftInstruction.scopeKind]);  useEffect(() => {
    if (draftInstruction.scopeKind === "router" && scopeRouter?.routerId && !draftInstruction.routerId) {
      setDraftInstruction((current) => ({ ...current, routerId: scopeRouter.routerId }));
    }
  }, [draftInstruction.scopeKind, draftInstruction.routerId, scopeRouter?.routerId]);  useEffect(() => {
    if (!draftKey || !draftDirty) return;
    const timer = window.setTimeout(() => window.localStorage.setItem(draftKey, JSON.stringify(draftInstruction)), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftDirty, draftInstruction]);
  useEffect(() => {
    setSaveState(draftDirty ? "unsaved" : "saved");
  }, [draftDirty]);  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { if (draftDirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draftDirty]);  const loadInstructionScopeTargets = async (kind: "router" | "subflows") => {
    if (!props.projectId || !flowId) return;
    const requestId = ++scopeRequestRef.current;
    setScopeTargetsLoading(true);
    setScopeTargetsError("");
    const result = kind === "router"
      ? await api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId })
      : await api.post<{ subflows?: any[]; page?: { subflows?: any[] } }>("list-flow-subflows", { projectId: props.projectId, flowId, limit: 100, offset: 0, sort: "name", direction: "asc" });
    if (requestId !== scopeRequestRef.current) return;
    setScopeTargetsLoading(false);
    if (!result.ok) { setScopeTargetsError(result.error ?? "Instruction targets could not be loaded."); return; }
    if (kind === "router") setScopeRouter((result.payload as any)?.router ?? null);
    else setScopeSubflows((result.payload as any)?.subflows ?? (result.payload as any)?.page?.subflows ?? []);
  };  const loadEffectiveInstructions = async () => {
    if (!props.projectId || !flowId) return;
    const requestId = ++effectiveRequestRef.current;
    setEffectiveLoading(true);
    setEffectiveError("");
    const result = await api.post<{ instructions?: any[] }>("get-flow-instruction-set", { projectId: props.projectId, flowId });
    if (requestId !== effectiveRequestRef.current) return;
    setEffectiveLoading(false);
    if (!result.ok) { setEffectiveError(result.error ?? "Effective instructions could not be loaded."); return; }
    setEffectiveInstructions(effectiveInstructionOrder(result.payload?.instructions ?? []));
  };  const syncInstructionUrl = (offset: number) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string> = { instructionQuery: filters.search, instructionStatus: filters.status, instructionScope: filters.scopeKind, instructionRequirement: filters.requirement, instructionSort: filters.sort, instructionDirection: filters.direction, instructionPageSize: String(page.limit), instructionOffset: String(offset) };
    Object.entries(values).forEach(([key, value]) => value && value !== "0" ? params.set(key, value) : params.delete(key));
    window.history.replaceState(null, "", window.location.pathname + (params.size ? "?" + params.toString() : "") + window.location.hash);
  };
  const loadInstructions = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    const result = await api.post<{ instructions?: any[]; page?: { instructions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-instructions", { projectId: props.projectId, flowId, limit: page.limit, offset, ...filters });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok) { setError(result.error ?? "Instructions could not be loaded."); return; }
    const resultPage = result.payload?.page;
    const items = result.payload?.instructions ?? resultPage?.instructions ?? [];
    const total = resultPage?.total ?? items.length;
    const safeOffset = total > 0 && offset >= total ? Math.max(0, Math.floor((total - 1) / page.limit) * page.limit) : offset;
    if (safeOffset !== offset) { void loadInstructions(safeOffset); return; }
    setInstructions(items);
    setPage((current) => ({ limit: resultPage?.limit ?? current.limit, offset: resultPage?.offset ?? offset, total }));
    syncInstructionUrl(resultPage?.offset ?? offset);
  };
  const openInstructionSet = async (instructionId: string) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    const result = await api.post<{ instruction?: any }>("get-flow-instruction", { projectId: props.projectId, instructionId });
    if (requestId !== detailRequestRef.current) return;
    setDetailLoading(false);
    if (!result.ok || !result.payload?.instruction) { setError(result.error ?? "Instruction detail could not be loaded."); return; }
    const nextDraft = instructionDraftFromInstruction(result.payload.instruction);
    setSelectedInstruction(result.payload.instruction);
    setBaseInstructionDraft(nextDraft);
    setDraftInstruction(nextDraft);
    const stored = readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId, instructionId));
    setRecoveryDraft(stored && instructionDraftIsDirty(stored, nextDraft) ? stored : null);
    setInstructionView("editor");
  };
  const openNewInstruction = () => {
    const blank = emptyInstructionDraft();
    setSelectedInstruction(null);
    setBaseInstructionDraft(blank);
    setDraftInstruction(blank);
    setRecoveryDraft(props.projectId && flowId ? readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId)) : null);
    setInstructionView("editor");
  };
  const requestInstructionOpen = (instructionId: string) => draftDirty ? setPendingEditorTarget({ kind: "open", instructionId }) : void openInstructionSet(instructionId);
  const requestCreateInstruction = () => draftDirty ? setPendingEditorTarget({ kind: "new" }) : openNewInstruction();
  const requestInstructionView = (view: "library" | "editor" | "effective") => instructionView === "editor" && view !== "editor" && draftDirty ? setPendingEditorTarget({ kind: "view", view }) : setInstructionView(view);
  const discardAndContinue = () => {
    if (draftKey) window.localStorage.removeItem(draftKey);
    const target = pendingEditorTarget;
    setPendingEditorTarget(null);
    if (target?.kind === "open" && target.instructionId) void openInstructionSet(target.instructionId);
    else if (target?.kind === "new") openNewInstruction();
    else if (target?.kind === "view" && target.view) setInstructionView(target.view);
  };
  const requestSaveInstruction = () => {
    setSaveAuthorizationPin("");
    setSaveAuthorizationError("");
    setSaveAuthorizationOpen(true);
  };
  const discardInstructionChanges = () => {
    if (draftKey) window.localStorage.removeItem(draftKey);
    setDraftInstruction(baseInstructionDraft);
    setRecoveryDraft(null);
    setSaveState("saved");
  };
  const saveInstruction = async (authorizationPin: string) => {
    if (!props.projectId || !flowId || authorizationPin.trim().length < 4) return;
    setError("");
    setSaveAuthorizationError("");
    setSaveState("saving");
    const result = await api.post<{ instruction?: any }>("save-flow-instruction", {
      projectId: props.projectId,
      flowId,
      authorizationPin: authorizationPin.trim(),
      ...(draftInstruction.instructionId ? { instructionId: draftInstruction.instructionId } : {}),
      title: draftInstruction.title,
      body: draftInstruction.body,
      scopeKind: draftInstruction.scopeKind,
      ...(draftInstruction.routerId ? { routerId: draftInstruction.routerId } : {}),
      ...(draftInstruction.subflowId ? { subflowId: draftInstruction.subflowId } : {}),
      ...(draftInstruction.nodeId ? { nodeId: draftInstruction.nodeId } : {}),
      priority: draftInstruction.priority,
      requirement: draftInstruction.requirement,
      status: draftInstruction.status
    });
    if (!result.ok || !result.payload?.instruction) {
      const message = result.error ?? "Instruction could not be saved.";
      setError(message);
      setSaveAuthorizationError(message);
      setSaveState("failed");
      return;
    }
    const savedDraft = instructionDraftFromInstruction(result.payload.instruction);
    if (draftKey) window.localStorage.removeItem(draftKey);
    if (props.projectId && flowId) window.localStorage.removeItem(instructionDraftStorageKey(props.projectId, flowId));
    setSelectedInstruction(result.payload.instruction);
    setBaseInstructionDraft(savedDraft);
    setDraftInstruction(savedDraft);
    setRecoveryDraft(null);
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    setSaveState("saved");
    setEffectiveInstructions([]);
    window.dispatchEvent(new CustomEvent("fluxiq:instructions-changed", { detail: { flowId, instructionId: result.payload.instruction.instructionId } }));
    await loadInstructions(page.offset);
  };  const draftDiagnosticInstruction = { instructionId: draftInstruction.instructionId || "new-instruction", title: draftInstruction.title, body: draftInstruction.body, priority: draftInstruction.priority, requirement: draftInstruction.requirement, status: draftInstruction.status, scope: { kind: draftInstruction.scopeKind, routerId: draftInstruction.routerId, subflowId: draftInstruction.subflowId, nodeId: draftInstruction.nodeId } };
  const diagnostics = instructionDiagnostics([draftDiagnosticInstruction]);
  const effectiveDiagnostics = instructionDiagnostics(effectiveInstructions);
  const draftTokenEstimate = estimateInstructionTokens(draftDiagnosticInstruction);
  const effectiveTokenEstimate = effectiveInstructions.reduce((total, instruction) => total + estimateInstructionTokens(instruction), 0);
  const nextOffset = page.offset + page.limit;
  const lastOffset = page.total ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
  const filtered = Boolean(filters.search || filters.status || filters.scopeKind || filters.requirement);
  const scopeTargetError = instructionScopeTargetError(draftInstruction);
  const currentImportance = instructionImportance(draftInstruction.priority);
  const applyInstructionTemplate = () => {
    const template = INSTRUCTION_TEMPLATES.find((candidate) => candidate.id === selectedTemplateId);
    if (!template) return;
    setDraftInstruction((current) => ({ ...current, title: template.title, body: template.body, scopeKind: template.scopeKind, priority: template.priority, requirement: template.requirement, routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" }));
    setShowAdvancedPriority(false);
  };
  const subflowOptions = scopeSubflows.map((subflow) => ({ value: String(subflow.subflowId), label: String(subflow.name ?? subflow.label ?? "Untitled subflow"), description: String(subflow.role ?? "Subflow") }));
  const nodeOptions = (Array.isArray(props.flow?.nodes) ? props.flow.nodes : []).map((node: any) => ({ value: String(node.id), label: String(node.label ?? node.name ?? node.metadata?.label ?? node.id), description: String(node.definitionId ?? node.type ?? "Node") }));
  const routerOptions = scopeRouter?.routerId ? [{ value: String(scopeRouter.routerId), label: String(scopeRouter.name ?? scopeRouter.label ?? "Flow Router"), description: "Router for this Flow" }] : [];
  const effectiveTargetLabel = (instruction: any) => {
    const scope = instruction?.scope ?? {};
    if (scope.nodeId) return nodeOptions.find((option: { value: string; label: string }) => option.value === scope.nodeId)?.label ?? "Selected node";
    if (scope.subflowId) return subflowOptions.find((option) => option.value === scope.subflowId)?.label ?? "Selected subflow";
    if (scope.routerId) return scopeRouter?.name ?? scopeRouter?.label ?? "Flow Router";
    return "Entire Flow";
  };  const changeInstructionScope = (scopeKind: string) => setDraftInstruction((current) => ({ ...current, scopeKind, routerId: scopeKind === "router" ? current.routerId : "", subflowId: "", nodeId: "", errorTargetKind: "flow" }));
  const scopeObjectPicker = draftInstruction.scopeKind === "router"
    ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} hint="The Router that decides which subflow receives a run." label="Applies to" onChange={(routerId) => setDraftInstruction((current) => ({ ...current, routerId }))} options={routerOptions} placeholder={scopeTargetsLoading ? "Loading Router" : "Choose Router"} value={draftInstruction.routerId} />
    : draftInstruction.scopeKind === "subflow"
      ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} hint="Search by subflow name; internal IDs are handled automatically." label="Applies to" onChange={(subflowId) => setDraftInstruction((current) => ({ ...current, subflowId }))} options={subflowOptions} placeholder={scopeTargetsLoading ? "Loading subflows" : "Search subflows"} value={draftInstruction.subflowId} />
      : draftInstruction.scopeKind === "node"
        ? <Combobox {...(scopeTargetError ? { error: scopeTargetError } : {})} hint="Nodes from the current Flow or subflow graph." label="Applies to" onChange={(nodeId) => setDraftInstruction((current) => ({ ...current, nodeId }))} options={nodeOptions} placeholder="Search nodes" value={draftInstruction.nodeId} />
        : ["on_error", "adaptation_review"].includes(draftInstruction.scopeKind)
          ? <div className="automation-instruction-target-stack"><label><span>Target level</span><select value={draftInstruction.errorTargetKind} onChange={(event) => setDraftInstruction((current) => ({ ...current, errorTargetKind: event.target.value as InstructionDraft["errorTargetKind"], subflowId: "", nodeId: "" }))}><option value="flow">Entire Flow</option><option value="subflow">Specific subflow</option>{draftInstruction.scopeKind === "on_error" ? <option value="node">Specific node</option> : null}</select></label>{draftInstruction.errorTargetKind === "subflow" ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} label="Applies to" onChange={(subflowId) => setDraftInstruction((current) => ({ ...current, subflowId }))} options={subflowOptions} placeholder={scopeTargetsLoading ? "Loading subflows" : "Search subflows"} value={draftInstruction.subflowId} /> : draftInstruction.errorTargetKind === "node" ? <Combobox {...(scopeTargetError ? { error: scopeTargetError } : {})} label="Applies to" onChange={(nodeId) => setDraftInstruction((current) => ({ ...current, nodeId }))} options={nodeOptions} placeholder="Search nodes" value={draftInstruction.nodeId} /> : <div className="automation-instruction-scope-summary"><Workflow size={16} aria-hidden /><div><strong>{props.flow?.name ?? "Current Flow"}</strong><span>No narrower object target</span></div></div>}</div>
          : <div className="automation-instruction-scope-summary"><Workflow size={16} aria-hidden /><div><strong>{draftInstruction.scopeKind === "global" ? "All projects and Flows" : draftInstruction.scopeKind === "project" ? "Current project" : props.flow?.name ?? "Current Flow"}</strong><span>{draftInstruction.scopeKind === "global" ? "Framework-wide guidance" : draftInstruction.scopeKind === "project" ? "Inherited by Flows in this project" : "Applies throughout this Flow"}</span></div></div>;
  return (<>
    <section className="automation-runs-workspace automation-instructions-shell">
      <header>
        <div><strong>Instructions</strong><span>Scoped guidance for generation, runtime, errors, and review</span></div>
        <button className="button button-primary" disabled={!props.projectId || !flowId} onClick={requestCreateInstruction} type="button"><Plus size={14} aria-hidden />New Instruction</button>
      </header>
      <nav aria-label="Instruction views" className="automation-instruction-view-tabs" role="tablist">{([ ["library", "Library"], ["editor", "Editor"], ["effective", "Effective Preview"] ] as const).map(([view, label]) => <button aria-selected={instructionView === view} className={instructionView === view ? "selected" : ""} key={view} onClick={() => requestInstructionView(view)} role="tab" type="button">{label}{view === "editor" && draftDirty ? <span aria-label="Unsaved changes" /> : null}</button>)}</nav>
      {!loading && page.total === 0 && flowId ? <div className="automation-instruction-readiness-banner" role="status"><AlertCircle size={17} aria-hidden /><div><strong>This Flow needs guidance before its first run</strong><span>Add at least one active instruction so the runtime and LLM know the intended outcome and constraints.</span></div><button className="button button-primary" onClick={requestCreateInstruction} type="button">Create Instruction</button><button className="button" onClick={() => { openNewInstruction(); setSelectedTemplateId("flow-goal"); }} type="button">Browse Templates</button></div> : null}
      {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void loadInstructions(page.offset)} type="button">Retry</button></div> : null}
      <div className="automation-instruction-library-toolbar" role="search">
        <label className="automation-subflow-search"><Search size={14} aria-hidden /><input aria-label="Search instructions" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search instructions" type="search" value={queryInput} /></label>
        <select aria-label="Filter instructions by scope" onChange={(event) => setFilters((current) => ({ ...current, scopeKind: event.target.value }))} value={filters.scopeKind}><option value="">All scopes</option><option value="global">Global</option><option value="project">Project</option><option value="flow">Flow</option><option value="router">Router</option><option value="subflow">Subflow</option><option value="node">Node</option><option value="on_error">On error</option><option value="adaptation_review">Adaptation review</option></select>
        <select aria-label="Filter instructions by status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select>
        <select aria-label="Filter instructions by requirement" onChange={(event) => setFilters((current) => ({ ...current, requirement: event.target.value }))} value={filters.requirement}><option value="">All requirements</option><option value="required">Required</option><option value="advisory">Advisory</option></select>
        <select aria-label="Sort instructions" onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as InstructionDirectoryState["sort"] }))} value={filters.sort}><option value="updated">Recently updated</option><option value="title">Title</option><option value="scope">Scope</option><option value="priority">Priority</option><option value="status">Status</option></select>
        <button aria-label={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} className="icon-button" onClick={() => setFilters((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} title={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} type="button">{filters.direction === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}</button>
      </div>
      <div className="automation-instructions-workspace">
        <section className="automation-instruction-list-pane" hidden={instructionView !== "library"}>
          <header>
            <div><strong>Instruction Library</strong><span>{page.total ? `${page.offset + 1}-${Math.min(page.total, page.offset + instructions.length)} of ${page.total}` : "0 instructions"}</span></div>
          </header>
          <div aria-busy={loading} className="automation-instruction-list">
            {instructions.map((instruction) => {
              const selected = selectedInstruction?.instructionId === instruction.instructionId;
              return (
                <button className={selected ? "selected" : ""} key={instruction.instructionId} onClick={() => requestInstructionOpen(instruction.instructionId)} type="button">
                  <span className="automation-instruction-title">{instruction.title ?? instruction.instructionId}</span>
                  <span className="automation-instruction-meta">{instructionScopeLabel(instruction.scopeKind ?? instruction.scope?.kind)} | priority {instruction.priority ?? 0}</span>
                  <span className="automation-instruction-footer">
                    <StatusBadge value={instruction.status ?? "active"} />
                    <small>{instruction.requirement ?? "advisory"}</small>
                  </span>
                </button>
              );
            })}
            {loading && !instructions.length ? <div className="automation-router-loading" aria-label="Loading instructions"><span /><span /><span /></div> : null}
            {!loading && !instructions.length ? <div className="automation-subflow-directory-empty"><ListChecks size={22} aria-hidden /><strong>{flowId ? filtered ? "No matching instructions" : "No instructions yet" : "Select a Flow"}</strong><span>{flowId ? filtered ? "Adjust the search or filters to see other instructions." : "Create the first instruction to give this Flow usable guidance." : "Choose a Flow to review its instructions."}</span></div> : null}
          </div>
          <footer className="automation-instruction-library-footer">
            <span>{page.total ? `${page.offset + 1}-${Math.min(page.total, page.offset + instructions.length)} of ${page.total}` : "0 of 0"}</span>
            <label>Rows <select aria-label="Instructions per page" onChange={(event) => setPage((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))} value={page.limit}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
            <div><button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadInstructions(0)} title="First page" aria-label="First instruction page" type="button"><ChevronsLeft size={14} aria-hidden /></button><button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadInstructions(Math.max(0, page.offset - page.limit))} title="Previous page" aria-label="Previous instruction page" type="button"><ChevronLeft size={14} aria-hidden /></button><button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadInstructions(nextOffset)} title="Next page" aria-label="Next instruction page" type="button"><ChevronRight size={14} aria-hidden /></button><button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadInstructions(lastOffset)} title="Last page" aria-label="Last instruction page" type="button"><ChevronsRight size={14} aria-hidden /></button></div>
          </footer>
        </section>
        <section aria-busy={detailLoading} className="automation-instruction-editor-pane" hidden={instructionView !== "editor"}>
          <header>
            <div><strong>Instruction Editor</strong><span>{detailLoading ? "Loading instruction" : draftDirty ? "Unsaved changes" : selectedInstruction?.instructionId ?? "New instruction"}</span></div>
            <div aria-live="polite" className={`automation-instruction-save-state ${saveState}`} role="status"><span aria-hidden />{saveState === "saved" ? "Saved" : saveState === "unsaved" ? "Unsaved changes" : saveState === "saving" ? "Saving" : "Save failed"}</div>
          </header>
          {recoveryDraft ? <div className="automation-instruction-recovery" role="status"><div><strong>Recovered local draft</strong><span>A newer unsaved version is available for this instruction.</span></div><div><button className="button" onClick={() => { if (draftKey) window.localStorage.removeItem(draftKey); setRecoveryDraft(null); }} type="button">Discard</button><button className="button button-primary" onClick={() => { setDraftInstruction(recoveryDraft); setRecoveryDraft(null); }} type="button">Restore</button></div></div> : null}
          <div className="automation-instruction-editor-sections">
            <section className="automation-instruction-editor-section automation-instruction-content-section">
              <header><div><strong>Content</strong><span>Name the guidance and write the instruction in plain language.</span></div></header><div className="automation-instruction-template-bar"><label><span>Start from a template</span><select aria-label="Instruction template" onChange={(event) => setSelectedTemplateId(event.target.value)} value={selectedTemplateId}><option value="">Blank instruction</option>{INSTRUCTION_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label><button className="button" disabled={!selectedTemplateId} onClick={applyInstructionTemplate} type="button">Apply Template</button>{selectedTemplateId ? <span>{INSTRUCTION_TEMPLATES.find((template) => template.id === selectedTemplateId)?.description}</span> : null}</div>
              <label><span>Title</span><input value={draftInstruction.title} onChange={(event) => setDraftInstruction((current) => ({ ...current, title: event.target.value }))} placeholder="Instruction title" /></label>
              <label className="automation-instruction-body-field"><span>Instruction</span><textarea rows={12} value={draftInstruction.body} onChange={(event) => setDraftInstruction((current) => ({ ...current, body: event.target.value }))} placeholder="Tell FluxIQ what to prefer, avoid, require, or clarify for this Flow." /><div className="automation-instruction-token-meter"><span>About {draftTokenEstimate} tokens</span><progress aria-label="Estimated instruction tokens" max={2000} value={Math.min(2000, draftTokenEstimate)} /></div></label>
            </section>
            <section className="automation-instruction-editor-section automation-instruction-behavior-section">
              <header><div><strong>Behavior</strong><span>Control where this guidance applies and how strongly it is enforced.</span></div></header>
              <div className="automation-instruction-behavior-grid">
                <div className="automation-instruction-scope-control"><label><span>Scope</span><select value={draftInstruction.scopeKind} onChange={(event) => changeInstructionScope(event.target.value)}><option value="global">Global</option><option value="project">Project</option><option value="flow">Flow</option><option value="router">Router</option><option value="subflow">Subflow</option><option value="node">Node</option><option value="on_error">On Error</option><option value="adaptation_review">Adaptation Review</option></select></label>{scopeObjectPicker}</div>
                <fieldset className="automation-instruction-choice-field"><legend>Requirement</legend><div className="automation-instruction-segments"><button aria-pressed={draftInstruction.requirement === "advisory"} className={draftInstruction.requirement === "advisory" ? "selected" : ""} onClick={() => setDraftInstruction((current) => ({ ...current, requirement: "advisory" }))} type="button">Advisory</button><button aria-pressed={draftInstruction.requirement === "required"} className={draftInstruction.requirement === "required" ? "selected" : ""} onClick={() => setDraftInstruction((current) => ({ ...current, requirement: "required" }))} type="button">Required</button></div><small>Required guidance is treated as a runtime constraint.</small></fieldset>
                <fieldset className="automation-instruction-choice-field"><legend>Status</legend><div className="automation-instruction-segments"><button aria-pressed={draftInstruction.status === "active"} className={draftInstruction.status === "active" ? "selected" : ""} onClick={() => setDraftInstruction((current) => ({ ...current, status: "active" }))} type="button">Active</button><button aria-pressed={draftInstruction.status === "disabled"} className={draftInstruction.status === "disabled" ? "selected" : ""} onClick={() => setDraftInstruction((current) => ({ ...current, status: "disabled" }))} type="button">Disabled</button><button aria-pressed={draftInstruction.status === "archived"} className={draftInstruction.status === "archived" ? "selected" : ""} onClick={() => setDraftInstruction((current) => ({ ...current, status: "archived" }))} type="button">Archived</button></div></fieldset>
                <fieldset className="automation-instruction-choice-field automation-instruction-importance-field"><legend>Importance</legend><div className="automation-instruction-segments">{(["low", "normal", "high", "critical"] as const).map((importance) => <button aria-pressed={currentImportance === importance} className={currentImportance === importance ? "selected" : ""} key={importance} onClick={() => setDraftInstruction((current) => ({ ...current, priority: instructionPriorityForImportance(importance) }))} type="button">{importance.charAt(0).toUpperCase() + importance.slice(1)}</button>)}</div><button className="automation-instruction-advanced-toggle" onClick={() => setShowAdvancedPriority((current) => !current)} type="button">{showAdvancedPriority || currentImportance === "custom" ? "Hide numeric priority" : "Fine-tune priority"}</button>{showAdvancedPriority || currentImportance === "custom" ? <label><span>Numeric priority (0-100)</span><input min="0" max="100" type="number" value={draftInstruction.priority} onChange={(event) => setDraftInstruction((current) => ({ ...current, priority: Math.max(0, Math.min(100, Number(event.target.value))) }))} /></label> : null}</fieldset>
              </div>
            </section>
          </div>
          <section className="automation-instruction-diagnostics">
            <header><strong>Draft Checks</strong><span>{diagnostics.length ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}` : "Ready"}</span></header>
            {diagnostics.length ? diagnostics.map((diagnostic, index) => <article className={`severity-${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}><div><strong>{diagnostic.title}</strong><StatusBadge value={diagnostic.severity} /></div><span>{diagnostic.message}</span>{diagnostic.instructionIds.length ? <small>{diagnostic.instructionIds.join(", ")}</small> : null}</article>) : <p>No conflicts, duplicates, or size warnings in this draft.</p>}
          </section>
          {selectedInstruction ? <JsonToggle label="Show Instruction JSON" value={selectedInstruction} /> : null}
          <footer className="automation-instruction-editor-footer"><div aria-live="polite" className={`automation-instruction-save-state ${saveState}`} role="status"><span aria-hidden />{saveState === "saved" ? "All changes saved" : saveState === "unsaved" ? "Unsaved changes" : saveState === "saving" ? "Saving instruction" : "Save failed; your draft is preserved"}</div><div><button className="button" disabled={!draftDirty || saveState === "saving"} onClick={discardInstructionChanges} type="button">Discard Changes</button><button className="button button-primary" disabled={saveState === "saving" || !draftDirty || !props.projectId || !flowId || !draftInstruction.title.trim() || !draftInstruction.body.trim() || Boolean(scopeTargetError)} onClick={requestSaveInstruction} type="button">{saveState === "saving" ? "Saving..." : "Save Instruction"}</button></div></footer>
        </section>
        <section aria-busy={effectiveLoading} className="automation-instruction-effective-pane" hidden={instructionView !== "effective"}>
          <header><div><strong>Effective Instructions</strong><span>{effectiveInstructions.length} active instruction{effectiveInstructions.length === 1 ? "" : "s"} in runtime order</span></div><button className="icon-button" disabled={effectiveLoading || !props.projectId || !flowId} onClick={() => void loadEffectiveInstructions()} title="Refresh effective instructions" aria-label="Refresh effective instructions" type="button"><Power size={14} aria-hidden /></button></header>
          <div className="automation-instruction-effective-intro"><Info size={16} aria-hidden /><div><strong>How the runtime reads this guidance</strong><span>Broad inherited guidance is applied first. More specific instructions follow, with higher importance first inside each scope.</span></div></div><div className="automation-instruction-effective-budget"><div><strong>Instruction context</strong><span>About {effectiveTokenEstimate} of 2,000 tokens</span></div><progress aria-label="Estimated effective instruction tokens" max={2000} value={Math.min(2000, effectiveTokenEstimate)} /></div>{effectiveDiagnostics.length ? <section className="automation-instruction-diagnostics automation-instruction-effective-diagnostics"><header><strong>Effective Set Checks</strong><span>{effectiveDiagnostics.length} issue{effectiveDiagnostics.length === 1 ? "" : "s"}</span></header>{effectiveDiagnostics.map((diagnostic, index) => <article className={`severity-${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}><div><strong>{diagnostic.title}</strong><StatusBadge value={diagnostic.severity} /></div><span>{diagnostic.message}</span>{diagnostic.instructionIds.length ? <small>{diagnostic.instructionIds.join(", ")}</small> : null}</article>)}</section> : null}
          {effectiveError ? <div className="automation-router-error" role="alert"><StatusText value={effectiveError} /><button className="button" onClick={() => void loadEffectiveInstructions()} type="button">Retry</button></div> : null}
          {effectiveLoading && !effectiveInstructions.length ? <div className="automation-router-loading" aria-label="Loading effective instructions"><span /><span /><span /></div> : null}
          {!effectiveLoading && !effectiveError && !effectiveInstructions.length ? <div className="automation-subflow-directory-empty"><ListChecks size={22} aria-hidden /><strong>No active instructions apply</strong><span>Create or activate guidance to give the runtime an effective instruction set.</span><button className="button button-primary" onClick={requestCreateInstruction} type="button">New Instruction</button></div> : null}
          <ol className="automation-instruction-effective-list">{effectiveInstructions.map((instruction, index) => { const inherited = instruction.scope?.kind === "global" || instruction.scope?.kind === "project"; return <li key={instruction.instructionId}><span className="automation-instruction-order">{index + 1}</span><article><header><div><strong>{instruction.title}</strong><span>{inherited ? "Inherited" : "This Flow"} | {instructionScopeLabel(instruction.scope?.kind)}</span></div><div><StatusBadge value={instruction.requirement ?? "advisory"} /><span className="automation-instruction-importance-label">{instructionImportance(Number(instruction.priority ?? 50))}</span></div></header><p>{instruction.body}</p><footer><span>{instruction.scope?.kind === "global" ? "All projects" : instruction.scope?.kind === "project" ? "Current project" : instruction.scope?.kind === "flow" ? "Entire Flow" : effectiveTargetLabel(instruction)}</span><span>Priority {instruction.priority ?? 50}</span></footer></article></li>; })}</ol>
        </section>
      </div>
    </section>
    {pendingEditorTarget ? <Modal title="Unsaved Instruction Changes" onClose={() => setPendingEditorTarget(null)}><div className="automation-modal-form"><p className="automation-router-modal-intro">This instruction has local changes that have not been saved.</p><div className="modal-actions"><button className="button" onClick={() => setPendingEditorTarget(null)} type="button">Keep Editing</button><button className="button danger" onClick={discardAndContinue} type="button">Discard and Continue</button></div></div></Modal> : null}
    {saveAuthorizationOpen ? <Modal title="Authorize Instruction Save" onClose={() => saveState === "saving" ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this write with your security PIN. Your instruction draft stays in this editor if authorization fails.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saveState === "saving"} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saveState === "saving"} onClick={() => void saveInstruction(saveAuthorizationPin)} type="button">{saveState === "saving" ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}
  </>);
}

function instructionScopeLabel(scope: unknown): string {
  const value = String(scope ?? "flow");
  return value === "on_error" ? "On error" : value === "adaptation_review" ? "Adaptation review" : value.charAt(0).toUpperCase() + value.slice(1);
}
function instructionScopeTargetLabel(instruction: any): string {
  const scope = instruction?.scope ?? {};
  if (scope.nodeId) return String(scope.nodeName ?? scope.nodeId);
  if (scope.subflowId) return String(scope.subflowName ?? scope.subflowId);
  if (scope.routerId) return "Flow Router";
  return "Entire Flow";
}
export function settingsDraftIsDirty(current: unknown, saved: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

const FLOW_SETTINGS_SECTIONS = ["flow-settings-general", "flow-settings-runtime", "flow-settings-llm", "flow-settings-adaptation", "flow-settings-limits", "flow-settings-safety", "flow-settings-inputs", "flow-settings-dependencies", "flow-settings-effective"] as const;
const SUBFLOW_SETTINGS_SECTIONS = ["subflow-settings-general", "subflow-settings-routing", "subflow-settings-inputs", "subflow-settings-outputs", "subflow-settings-lifecycle"] as const;

export function readSettingsSection(search: string, kind: "flow" | "subflow"): string {
  const allowed = kind === "flow" ? FLOW_SETTINGS_SECTIONS : SUBFLOW_SETTINGS_SECTIONS;
  const value = new URLSearchParams(search).get("settingsSection") ?? "";
  return (allowed as readonly string[]).includes(value) ? value : allowed[0];
}

function syncSettingsSectionUrl(sectionId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("settingsSection", sectionId);
  window.history.replaceState(window.history.state, "", url);
}
function scrollToSettingsSection(sectionId: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
type SubflowSettingsDraft = {
  name: string;
  description: string;
  role: "primary" | "site" | "screen" | "integration" | "recovery" | "fallback" | "utility";
  routeTags: string;
  localInstructionIds: string[];
  status: "active" | "disabled" | "archived";
  proposalModeOverride: "inherit" | "auto" | "manual" | "mixed";
  inputMapping: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
};

export function subflowSettingsErrors(draft: SubflowSettingsDraft, flowInputs: any[], flowOutputs: any[], subflowInputs: any[], subflowOutputs: any[]): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Subflow name is required.");
  const validate = (rows: Array<Record<string, any>>, leftKey: string, rightKey: string, leftPorts: any[], rightPorts: any[], label: string) => {
    const pairs = new Set<string>();
    for (const row of rows) {
      const left = leftPorts.find((port) => port.id === row[leftKey]);
      const right = rightPorts.find((port) => port.id === row[rightKey]);
      if (!left || !right) { errors.push(label + " mappings must choose existing named ports."); continue; }
      const pair = String(row[leftKey]) + ":" + String(row[rightKey]);
      if (pairs.has(pair)) errors.push(label + " mappings cannot contain duplicates.");
      pairs.add(pair);
      if (left.valueType?.kind && right.valueType?.kind && left.valueType.kind !== right.valueType.kind) errors.push(label + " mapping " + left.name + " to " + right.name + " uses incompatible types.");
    }
  };
  validate(draft.inputMapping, "flowInputId", "subflowInputId", flowInputs, subflowInputs, "Input");
  validate(draft.outputMapping, "subflowOutputId", "flowOutputId", subflowOutputs, flowOutputs, "Output");
  return [...new Set(errors)];
}

export function AutomationFlowSettingsWorkspace(props: { projectId: string | null; flow: any }) {
  const ownership = subflowSettingsOwnership(props.flow);
  return ownership
    ? <AutomationSubflowSettingsWorkspace flow={props.flow} ownership={ownership} projectId={props.projectId} />
    : <AutomationTopLevelFlowSettingsWorkspace flow={props.flow} projectId={props.projectId} />;
}

export function AutomationSubflowSettingsWorkspace(props: {
  projectId: string | null;
  flow: any;
  ownership: { parentFlowId: string; subflowId: string };
}) {
  const api = useProgramApi("automation-studio");
  const [subflow, setSubflow] = useState<any | null>(null);
  const [draft, setDraft] = useState<SubflowSettingsDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<SubflowSettingsDraft | null>(null);
  const [activeSection, setActiveSection] = useState(() => readSettingsSection(typeof window === "undefined" ? "" : window.location.search, "subflow"));
  useEffect(() => { const timer = window.setTimeout(() => scrollToSettingsSection(activeSection), 0); return () => window.clearTimeout(timer); }, []);
  const [loading, setLoading] = useState(Boolean(props.projectId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [parentFlow, setParentFlow] = useState<any | null>(null);
  const [instructionOptions, setInstructionOptions] = useState<any[]>([]);
  const [instructionChoice, setInstructionChoice] = useState("");
  const [router, setRouter] = useState<any | null>(null);
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSubflow(null);
    setDraft(null);
    setSavedDraft(null);
    setMessage("");
    setError("");
    if (!props.projectId) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void Promise.all([
      api.post<{ subflow?: any }>("get-flow-subflow", { projectId: props.projectId, flowId: props.ownership.parentFlowId, subflowId: props.ownership.subflowId }),
      api.post<{ flow?: any }>("get-flow", { projectId: props.projectId, flowId: props.ownership.parentFlowId }),
      api.post<{ instructions?: any[] }>("list-flow-instructions", { projectId: props.projectId, flowId: props.ownership.parentFlowId, limit: 50, offset: 0, sort: "title", direction: "asc" }),
      api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId: props.ownership.parentFlowId })
    ]).then(([result, flowResult, instructionResult, routerResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok || !result.payload?.subflow) {
        setError(result.error ?? "Subflow settings could not be loaded.");
        return;
      }
      setSubflow(result.payload.subflow);
      setParentFlow(flowResult.ok ? flowResult.payload?.flow ?? null : null);
      setInstructionOptions(instructionResult.ok ? instructionResult.payload?.instructions ?? [] : []);
      setRouter(routerResult.ok ? routerResult.payload?.router ?? null : null);
      const nextDraft = subflowSettingsDraft(result.payload.subflow);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
    });
    return () => { cancelled = true; };
  }, [props.projectId, props.ownership.parentFlowId, props.ownership.subflowId]);
  const draftDirty = Boolean(draft && savedDraft && settingsDraftIsDirty(draft, savedDraft));
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!draftDirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [draftDirty]);
  const updateDraft = <K extends keyof SubflowSettingsDraft>(key: K, value: SubflowSettingsDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const flowInputs = parentFlow?.interface?.inputs ?? [];
  const flowOutputs = parentFlow?.interface?.outputs ?? [];
  const subflowInputs = props.flow?.interface?.inputs ?? [];
  const subflowOutputs = props.flow?.interface?.outputs ?? [];
  const settingsErrors = draft ? subflowSettingsErrors(draft, flowInputs, flowOutputs, subflowInputs, subflowOutputs) : [];
  const routeReferences = routerReferencesForSubflow(router, props.ownership.subflowId);
  const inheritedApproval = flowSettingsProposalMode(flowSettingsMetadata(parentFlow).adaptationPolicySettings?.proposalMode);
  const saveSettings = async (authorizationPin: string) => {
    if (!props.projectId || !draft || authorizationPin.trim().length < 4) return;
    setSaving(true);
    setMessage("");
    setError("");
    setSaveAuthorizationError("");
    const updateResult = await api.post<{ subflow?: any }>("update-flow-subflow", {
      projectId: props.projectId,
      flowId: props.ownership.parentFlowId,
      subflowId: props.ownership.subflowId,
      expectedUpdatedAt: subflow?.updatedAt,
      authorizationPin: authorizationPin.trim(),
      name: draft.name,
      description: draft.description,
      role: draft.role,
      routeTags: splitSettingsValues(draft.routeTags),
      localInstructionIds: draft.localInstructionIds,
      proposalModeOverride: draft.proposalModeOverride === "inherit" ? null : draft.proposalModeOverride,
      inputMapping: draft.inputMapping,
      outputMapping: draft.outputMapping
    });
    const lifecycleEndpoint = draft.status !== subflow?.status ? draft.status === "active" ? "enable-flow-subflow" : draft.status === "disabled" ? "disable-flow-subflow" : "archive-flow-subflow" : null;
    const result = updateResult.ok && lifecycleEndpoint
      ? await api.post<{ subflow?: any }>(lifecycleEndpoint, { projectId: props.projectId, flowId: props.ownership.parentFlowId, subflowId: props.ownership.subflowId, authorizationPin: authorizationPin.trim() })
      : updateResult;
    setSaving(false);
    if (!result.ok || !result.payload?.subflow) {
      const saveError = result.error?.includes("SUBFLOW_SAVE_CONFLICT") ? "Save conflict: this subflow changed elsewhere. Your draft is preserved; reload after reviewing the other change." : result.error ?? "Subflow settings could not be saved.";
      setError(saveError);
      setSaveAuthorizationError(saveError);
      return;
    }
    setSubflow(result.payload.subflow);
    const nextDraft = subflowSettingsDraft(result.payload.subflow);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setMessage("Subflow settings saved.");
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    window.dispatchEvent(new CustomEvent("fluxiq:subflows-changed", { detail: { flowId: props.ownership.parentFlowId, subflowId: props.ownership.subflowId } }));
  };
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace automation-subflow-settings-workspace">
      <header>
        <div><strong>Subflow Settings</strong><span>{subflow?.name ?? props.flow?.name ?? props.ownership.subflowId} | routing, mappings, instructions, and approval behavior</span></div>
        <span className={`automation-instruction-save-state ${draftDirty ? "unsaved" : "saved"}`}><span aria-hidden />{draftDirty ? "Unsaved changes" : "Saved"}</span>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      {message ? <p className="automation-settings-success">{message}</p> : null}
      {loading ? <div className="automation-runtime-empty">Loading subflow settings...</div> : null}
      {!loading && !draft ? <div className="automation-runtime-empty">Select a persisted subflow to edit its settings.</div> : null}
      {settingsErrors.length ? <div className="automation-settings-validation" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Fix these subflow settings before saving</strong>{settingsErrors.map((item) => <span key={item}>{item}</span>)}</div></div> : null}
      {draft ? <div className="automation-settings-layout"><nav aria-label="Subflow settings sections" className="automation-settings-section-nav">{([["subflow-settings-general", "General"], ["subflow-settings-routing", "Routing & Instructions"], ["subflow-settings-inputs", "Input Mapping"], ["subflow-settings-outputs", "Output Mapping"], ["subflow-settings-lifecycle", "Lifecycle & Ownership"]] as const).map(([id, label]) => <button aria-current={activeSection === id ? "location" : undefined} className={activeSection === id ? "selected" : ""} key={id} onClick={() => { setActiveSection(id); syncSettingsSectionUrl(id); scrollToSettingsSection(id); }} type="button">{label}</button>)}</nav><div className="automation-flow-settings-grid">
        <section className="automation-settings-panel" id="subflow-settings-general">
          <header><strong>Subflow Identity</strong><span>Name, responsibility, and routing role</span></header>
          <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Subflow name" /></label>
          <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this subflow is responsible for." /></label>
          <label><span>Role</span><select value={draft.role} onChange={(event) => updateDraft("role", event.target.value as SubflowSettingsDraft["role"])}><option value="primary">Primary</option><option value="site">Site</option><option value="screen">Screen</option><option value="integration">Integration</option><option value="recovery">Recovery</option><option value="fallback">Fallback</option><option value="utility">Utility</option></select></label>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide" id="subflow-settings-routing">
          <header><strong>Routing and Instructions</strong><span>Matching hints, Router usage, and named scoped guidance</span></header>
          <label><span>Route tags</span><input value={draft.routeTags} onChange={(event) => updateDraft("routeTags", event.target.value)} placeholder="checkout, authenticated, desktop" /></label>
          <div className="automation-settings-divider"><strong>Local instructions</strong><span>Guidance bound specifically to this subflow</span></div>
          <div className="automation-settings-secret-picker"><Combobox label="Add instruction" onChange={setInstructionChoice} options={instructionOptions.filter((instruction) => !draft.localInstructionIds.includes(instruction.instructionId)).map((instruction) => ({ value: instruction.instructionId, label: instruction.title, description: instruction.scopeKind + " | " + instruction.status }))} placeholder="Search Flow instructions" value={instructionChoice} /><button className="button" disabled={!instructionChoice} onClick={() => { updateDraft("localInstructionIds", [...draft.localInstructionIds, instructionChoice]); setInstructionChoice(""); }} type="button"><Plus size={14} aria-hidden />Add Instruction</button></div>
          <div className="automation-settings-binding-list">{draft.localInstructionIds.map((instructionId) => { const instruction = instructionOptions.find((item) => item.instructionId === instructionId); return <div className="automation-settings-dependency-row" key={instructionId}><div><strong>{instruction?.title ?? "Unavailable instruction"}</strong><span>{instruction ? instruction.scopeKind + " | " + instruction.status : "The saved instruction is no longer available."}</span></div><button aria-label={"Remove " + (instruction?.title ?? "instruction")} className="automation-icon-button" onClick={() => updateDraft("localInstructionIds", draft.localInstructionIds.filter((id) => id !== instructionId))} title="Remove instruction" type="button"><Trash2 size={15} aria-hidden /></button></div>; })}{!draft.localInstructionIds.length ? <div className="automation-runtime-empty">No local instructions bound.</div> : null}</div>
          <fieldset className="automation-settings-choice"><legend>Adaptation approval</legend><div className="automation-instruction-segments">{([["inherit", "Inherit"], ["auto", "Automatic"], ["mixed", "Manual for risky"], ["manual", "Manual only"]] as const).map(([value, label]) => <button aria-pressed={draft.proposalModeOverride === value} className={draft.proposalModeOverride === value ? "selected" : ""} key={value} onClick={() => updateDraft("proposalModeOverride", value)} type="button">{label}</button>)}</div><small>Effective approval: {draft.proposalModeOverride === "inherit" ? inheritedApproval === "auto" ? "Automatic from parent Flow" : inheritedApproval === "mixed" ? "Manual for risky from parent Flow" : "Manual only from parent Flow" : draft.proposalModeOverride === "auto" ? "Automatic override" : draft.proposalModeOverride === "mixed" ? "Manual for risky override" : "Manual only override"}.</small></fieldset>
          <div className="automation-settings-divider"><strong>Router references</strong><span>Read-only rules owned by the parent Flow Router</span></div>
          <div className="automation-settings-binding-list">{routeReferences.map((reference) => <div className="automation-settings-dependency-row" key={reference.id}><div><strong>{reference.name}</strong><span>{reference.condition} | {reference.status}</span></div><StatusBadge value={reference.status} /></div>)}{!routeReferences.length ? <div className="automation-runtime-empty">No Router rule currently targets this subflow.</div> : null}</div>
        </section>
        <SubflowMappingEditor
          leftKey="flowInputId"
          leftOptions={flowInputs}
          leftLabel="Flow input"
          onChange={(inputMapping) => updateDraft("inputMapping", inputMapping as SubflowSettingsDraft["inputMapping"])}
          rightKey="subflowInputId"
          rightOptions={subflowInputs}
          rightLabel="Subflow input"
          rows={draft.inputMapping}
          sectionId="subflow-settings-inputs"
          title="Input Mapping"
        />
        <SubflowMappingEditor
          leftKey="subflowOutputId"
          leftOptions={subflowOutputs}
          leftLabel="Subflow output"
          onChange={(outputMapping) => updateDraft("outputMapping", outputMapping as SubflowSettingsDraft["outputMapping"])}
          rightKey="flowOutputId"
          rightOptions={flowOutputs}
          rightLabel="Flow output"
          rows={draft.outputMapping}
          sectionId="subflow-settings-outputs"
          title="Output Mapping"
        />
        <section className="automation-settings-panel automation-settings-panel-wide" id="subflow-settings-lifecycle">
          <header><strong>Lifecycle</strong><span>Whether the parent Router may select and run this subflow</span></header>
          <fieldset className="automation-settings-choice"><legend>Status</legend><div className="automation-instruction-segments">{([["active", "Active"], ["disabled", "Disabled"], ["archived", "Archived"]] as const).map(([value, label]) => <button aria-pressed={draft.status === value} className={draft.status === value ? "selected" : ""} key={value} onClick={() => updateDraft("status", value)} type="button">{label}</button>)}</div><small>{draft.status === "active" ? "Available to Router rules and runtime execution." : draft.status === "disabled" ? "Retained for editing but unavailable to new runs." : "Hidden from normal use and retained for audit history."}</small></fieldset>
          <div className="automation-settings-effective-list"><div className="automation-settings-effective-row"><span>Ownership</span><div><strong>Parent Flow</strong><small>{parentFlow?.name ?? "Parent Flow"}</small></div><StatusBadge value={draft.status} /><span /></div><div className="automation-settings-effective-row"><span>Stability</span><div><strong>Completed runs</strong><small>{subflow?.stability?.runCount ?? 0}</small></div><span /><span /></div></div>
          <details className="automation-settings-technical-details"><summary>Technical ownership identifiers</summary><div className="automation-settings-technical-list"><code>{props.ownership.parentFlowId}</code><code>{props.ownership.subflowId}</code><code>{props.flow?.flowId ?? subflow?.graphFlowId ?? "-"}</code></div></details>
        </section>
      </div></div> : null}
      {draft ? <footer className="automation-settings-form-footer"><span>{draftDirty ? "Unsaved subflow changes" : "All subflow settings saved"}</span><div><button className="button" disabled={!draftDirty || saving || !savedDraft} onClick={() => savedDraft && setDraft(savedDraft)} type="button">Discard Changes</button><button className="button button-primary" disabled={!props.projectId || !draftDirty || saving || settingsErrors.length > 0} onClick={() => { setSaveAuthorizationPin(""); setSaveAuthorizationError(""); setSaveAuthorizationOpen(true); }} type="button">{saving ? "Saving..." : "Save Subflow Settings"}</button></div></footer> : null}
      {saveAuthorizationOpen ? <Modal title="Authorize Subflow Settings Save" onClose={() => saving ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this Subflow Settings write with your security PIN. Your draft remains intact if authorization or conflict checks fail.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saving} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saving} onClick={() => void saveSettings(saveAuthorizationPin)} type="button">{saving ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}
    </section>
  );
}

export function SubflowMappingEditor(props: {
  sectionId?: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftKey: string;
  rightKey: string;
  leftOptions: any[];
  rightOptions: any[];
  rows: Array<Record<string, any>>;
  onChange(rows: Array<Record<string, any>>): void;
}) {
  const updateRow = (index: number, key: string, value: string | boolean) => props.onChange(props.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const addRow = () => props.onChange([...props.rows, { [props.leftKey]: "", [props.rightKey]: "", required: false }]);
  const optionLabel = (port: any) => port.name + (port.valueType?.kind ? " (" + (port.valueType.kind === "string" ? "Text" : port.valueType.kind === "boolean" ? "Yes / No" : port.valueType.kind === "json" ? "Structured" : "Number") + ")" : "");
  return (
    <section className="automation-settings-panel automation-settings-panel-wide automation-subflow-mapping-panel" id={props.sectionId}>
      <header><strong>{props.title}</strong><span>Map compatible named values across the parent Flow and subflow boundary</span></header>
      <div className="automation-subflow-mapping-list">
        {props.rows.map((row, index) => <div className="automation-subflow-mapping-row" key={props.title + ":" + index}>
          <label><span>{props.leftLabel}</span><select value={String(row[props.leftKey] ?? "")} onChange={(event) => updateRow(index, props.leftKey, event.target.value)}><option value="">Choose {props.leftLabel.toLowerCase()}</option>{props.leftOptions.map((port) => <option key={port.id} value={port.id}>{optionLabel(port)}</option>)}</select></label>
          <ChevronRight aria-hidden size={16} />
          <label><span>{props.rightLabel}</span><select value={String(row[props.rightKey] ?? "")} onChange={(event) => updateRow(index, props.rightKey, event.target.value)}><option value="">Choose {props.rightLabel.toLowerCase()}</option>{props.rightOptions.map((port) => <option key={port.id} value={port.id}>{optionLabel(port)}</option>)}</select></label>
          <label className="automation-subflow-mapping-required"><input checked={row.required === true} onChange={(event) => updateRow(index, "required", event.target.checked)} type="checkbox" /><span>Required</span></label>
          <button className="automation-icon-button" onClick={() => props.onChange(props.rows.filter((_, rowIndex) => rowIndex !== index))} title="Remove mapping" aria-label="Remove mapping" type="button"><Trash2 aria-hidden size={15} /></button>
        </div>)}
        {!props.rows.length ? <div className="automation-runtime-empty">No mappings configured.</div> : null}
      </div>
      {!props.leftOptions.length || !props.rightOptions.length ? <div className="automation-settings-inline-notice warning"><AlertTriangle size={16} aria-hidden /><span>Define named ports in both the parent Flow and subflow Nodes settings before adding this mapping.</span></div> : null}
      <button className="automation-runtime-row-action automation-subflow-add-mapping" disabled={!props.leftOptions.length || !props.rightOptions.length} onClick={addRow} type="button"><Plus aria-hidden size={14} /> Add mapping</button>
    </section>
  );
}

function subflowSettingsOwnership(flow: any): { parentFlowId: string; subflowId: string } | null {
  const metadata = flow?.metadata;
  return metadata?.subflowGraph === true && typeof metadata.parentFlowId === "string" && typeof metadata.parentSubflowId === "string"
    ? { parentFlowId: metadata.parentFlowId, subflowId: metadata.parentSubflowId }
    : null;
}

export function subflowSettingsDraft(subflow: any): SubflowSettingsDraft {
  return {
    name: String(subflow?.name ?? ""),
    description: String(subflow?.description ?? ""),
    role: ["primary", "site", "screen", "integration", "recovery", "fallback", "utility"].includes(subflow?.role) ? subflow.role : "utility",
    routeTags: Array.isArray(subflow?.routeTags) ? subflow.routeTags.join(", ") : "",
    localInstructionIds: Array.isArray(subflow?.localInstructionIds) ? [...subflow.localInstructionIds] : [],
    status: subflow?.status === "disabled" || subflow?.status === "archived" ? subflow.status : "active",
    proposalModeOverride: subflow?.proposalModeOverride === "auto" || subflow?.proposalModeOverride === "manual" || subflow?.proposalModeOverride === "mixed" ? subflow.proposalModeOverride : "inherit",
    inputMapping: Array.isArray(subflow?.inputMapping) ? subflow.inputMapping.map((mapping: any) => ({ ...mapping })) : [],
    outputMapping: Array.isArray(subflow?.outputMapping) ? subflow.outputMapping.map((mapping: any) => ({ ...mapping })) : []
  };
}

function splitSettingsValues(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}
export const FLOW_LLM_PROVIDERS = [
  { id: "host", label: "Host default", models: ["host-default"] },
  { id: "openai", label: "OpenAI", models: ["gpt-5", "gpt-5-mini", "gpt-4.1"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-opus-4-1", "claude-sonnet-4"] },
  { id: "google-gemini", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "azure-openai", label: "Azure OpenAI", models: ["deployment-default"] },
  { id: "groq", label: "Groq", models: ["llama-3.3-70b-versatile"] },
  { id: "mistral", label: "Mistral", models: ["mistral-large-latest", "codestral-latest"] },
  { id: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "openrouter", label: "OpenRouter", models: ["openrouter/auto"] },
  { id: "ollama", label: "Ollama", models: ["llama3.3", "qwen3"] }
] as const;

export function flowLlmProvider(providerId: string) {
  return FLOW_LLM_PROVIDERS.find((provider) => provider.id === providerId) ?? FLOW_LLM_PROVIDERS[0];
}

function normalizedProviderLabel(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
type FlowPortSettingsDraft = { id: string; name: string; valueKind: "string" | "number" | "boolean" | "json"; required: boolean; description: string; defaultValue: string };

type FlowSettingsDraft = {
  name: string;
  description: string;
  visibility: "private" | "public";
  timeoutSeconds: string;
  maxConcurrency: string;
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
  maxRetriesPerAction: string;
  maxRecoveryAttemptsPerSubflow: string;
  maxReroutesPerRun: string;
  interfaceInputs: FlowPortSettingsDraft[];
  interfaceOutputs: FlowPortSettingsDraft[];
  dependencyPins: string[];
  authorizedDomainIds: string[];
  maxInterventionsPerRun: string;
  maxTokensPerRun: string;
  maxCostUsdPerTrainingWindow: string;
  maxAdaptationInterventionsPerRun: string;
  maxAdaptationCostUsdPerRun: string;
  budgetExhaustedBehavior: "ask" | "stop";
  llmProvider: string;
  llmModel: string;
  llmSecretKeyId: string;
  adaptationPolicyId: string;
};

export function flowLimitsInterfaceErrors(draft: Pick<FlowSettingsDraft, "maxInterventionsPerRun" | "maxTokensPerRun" | "maxCostUsdPerTrainingWindow" | "maxAdaptationInterventionsPerRun" | "maxAdaptationCostUsdPerRun" | "maxRetriesPerAction" | "maxRecoveryAttemptsPerSubflow" | "maxReroutesPerRun" | "interfaceInputs" | "interfaceOutputs">): string[] {
  const errors: string[] = [];
  const wholeNumberFields: Array<[string, string, number]> = [["LLM interventions per run", draft.maxInterventionsPerRun, 100], ["Adaptation interventions per run", draft.maxAdaptationInterventionsPerRun, 100], ["Retries per action", draft.maxRetriesPerAction, 20], ["Recovery attempts per subflow", draft.maxRecoveryAttemptsPerSubflow, 20], ["Reroutes per run", draft.maxReroutesPerRun, 20]];
  for (const [label, value, maximum] of wholeNumberFields) if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > maximum) errors.push(`${label} must be a whole number from 0 to ${maximum}.`);
  if (!Number.isInteger(Number(draft.maxTokensPerRun)) || Number(draft.maxTokensPerRun) < 128 || Number(draft.maxTokensPerRun) > 1_000_000) errors.push("LLM tokens per run must be a whole number from 128 to 1,000,000.");
  for (const [label, value] of [["Training-window cost", draft.maxCostUsdPerTrainingWindow], ["Adaptation cost per run", draft.maxAdaptationCostUsdPerRun]] as const) if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100_000) errors.push(`${label} must be from 0 to 100,000 USD.`);
  for (const [kind, ports] of [["Input", draft.interfaceInputs], ["Output", draft.interfaceOutputs]] as const) {
    const names = ports.map((port) => port.name.trim().toLowerCase()).filter(Boolean);
    if (ports.some((port) => !port.name.trim())) errors.push(`${kind} names cannot be empty.`);
    if (new Set(names).size !== names.length) errors.push(`${kind} names must be unique.`);
    for (const port of ports) {
      if (!port.defaultValue.trim() || port.valueKind === "string") continue;
      if (port.valueKind === "number" && !Number.isFinite(Number(port.defaultValue))) errors.push(`${kind} ${port.name || "value"} needs a valid numeric default.`);
      if (port.valueKind === "json") { try { JSON.parse(port.defaultValue); } catch { errors.push(`${kind} ${port.name || "value"} needs a valid structured default.`); } }
    }
  }
  return [...new Set(errors)];
}
type FlowEffectiveSetting = { key: keyof FlowSettingsDraft; group: string; label: string; value: string; source: "Flow override" | "Framework default" | "Flow contract"; resettable: boolean };

const FLOW_SETTINGS_DEFAULT_VALUES: Partial<FlowSettingsDraft> = {
  timeoutSeconds: "30", maxConcurrency: "1", trainingMode: "continuous_adaptive", llmProvider: "host", llmModel: "host-default",
  adaptationPreset: "adaptive", adaptationProposalMode: "auto", maxInterventionsPerRun: "2", maxTokensPerRun: "12000",
  maxCostUsdPerTrainingWindow: "5", maxRetriesPerAction: "1", maxRecoveryAttemptsPerSubflow: "2", maxReroutesPerRun: "2"
};


export function flowEffectiveSettings(flow: any, draft: FlowSettingsDraft): FlowEffectiveSetting[] {
  const metadata = flow?.metadata ?? {};
  const describeMode = (value: string) => value === "continuous_adaptive" ? "Fully adaptive" : value === "train_for_runs" ? "Fixed training runs" : value === "train_until_stable" ? "Until stable" : "No LLM intervention";
  const describeApproval = (value: string) => value === "auto" ? "Automatic" : value === "mixed" ? "Manual for risky" : "Manual only";
  const definitions: Array<{ key: keyof FlowSettingsDraft; group: string; label: string; value: string; overridden: boolean }> = [
    { key: "trainingMode", group: "Runtime", label: "LLM intervention mode", value: describeMode(draft.trainingMode), overridden: draft.trainingMode !== "continuous_adaptive" },
    { key: "timeoutSeconds", group: "Runtime", label: "Flow timeout", value: draft.timeoutSeconds + " seconds", overridden: Number(draft.timeoutSeconds) !== 30 },
    { key: "maxConcurrency", group: "Runtime", label: "Maximum concurrent runs", value: draft.maxConcurrency, overridden: Number(draft.maxConcurrency) !== 1 },
    { key: "llmProvider", group: "LLM", label: "Provider", value: flowLlmProvider(draft.llmProvider).label, overridden: draft.llmProvider !== "host" },
    { key: "llmModel", group: "LLM", label: "Model", value: draft.llmModel || "Host default", overridden: draft.llmModel !== "host-default" },
    { key: "adaptationPreset", group: "Adaptation", label: "Behavior", value: draft.adaptationPreset === "adaptive" ? "Fully adaptive" : draft.adaptationPreset === "observe" ? "Observe only" : draft.adaptationPreset === "locked" ? "Locked" : "Broad autonomy", overridden: draft.adaptationPreset !== "adaptive" },
    { key: "adaptationProposalMode", group: "Adaptation", label: "Approval", value: describeApproval(draft.adaptationProposalMode), overridden: draft.adaptationProposalMode !== "auto" },
    { key: "maxInterventionsPerRun", group: "Limits", label: "LLM interventions per run", value: draft.maxInterventionsPerRun, overridden: Number(draft.maxInterventionsPerRun) !== 2 },
    { key: "maxTokensPerRun", group: "Limits", label: "LLM tokens per run", value: draft.maxTokensPerRun, overridden: Number(draft.maxTokensPerRun) !== 12000 },
    { key: "maxRetriesPerAction", group: "Limits", label: "Retries per action", value: draft.maxRetriesPerAction, overridden: Number(draft.maxRetriesPerAction) !== 1 },
    { key: "maxRecoveryAttemptsPerSubflow", group: "Limits", label: "Recovery attempts per subflow", value: draft.maxRecoveryAttemptsPerSubflow, overridden: Number(draft.maxRecoveryAttemptsPerSubflow) !== 2 },
    { key: "maxReroutesPerRun", group: "Limits", label: "Reroutes per run", value: draft.maxReroutesPerRun, overridden: Number(draft.maxReroutesPerRun) !== 2 }
  ];
  return definitions.map((item) => ({ ...item, source: item.overridden ? "Flow override" : "Framework default", resettable: item.overridden && Object.prototype.hasOwnProperty.call(FLOW_SETTINGS_DEFAULT_VALUES, item.key) }));
}
export function applyFlowTrainingMode(draft: FlowSettingsDraft, trainingMode: FlowSettingsDraft["trainingMode"]): FlowSettingsDraft {
  if (trainingMode === "normal") return { ...draft, trainingMode, allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false };
  return { ...draft, trainingMode, allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual" };
}

export function applyFlowAdaptationPreset(draft: FlowSettingsDraft, preset: FlowSettingsDraft["adaptationPreset"]): FlowSettingsDraft {
  if (preset === "locked") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: false, allowPromotion: false, allowCreateRecoveryPaths: false, allowModifySubflows: false, allowCreateSubflows: false, allowModifyRouter: false, allowModifyExpectations: false, allowModifyActionTargets: false, allowDeleteOrDisableBehavior: false };
  if (preset === "observe") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: true, allowPromotion: false, allowCreateRecoveryPaths: false, allowModifySubflows: false, allowCreateSubflows: false, allowModifyRouter: false, allowModifyExpectations: false, allowModifyActionTargets: false, allowDeleteOrDisableBehavior: false };
  if (preset === "autonomous") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual", allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: true, requireApprovalForDestructiveChanges: true };
  return { ...draft, adaptationPreset: "adaptive", allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual", allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: false, requireApprovalForDestructiveChanges: true };
}

export function flowAdaptationErrors(draft: Pick<FlowSettingsDraft, "trainingMode" | "allowLlmIntervention" | "allowAdaptationCreation" | "allowPromotion" | "adaptationProposalMode">): string[] {
  const errors: string[] = [];
  if (draft.trainingMode === "normal" && (draft.allowLlmIntervention || draft.allowAdaptationCreation || draft.allowPromotion)) errors.push("No LLM intervention mode cannot create or promote adaptations.");
  if (draft.allowPromotion && !draft.allowAdaptationCreation) errors.push("Automatic promotion requires adaptation creation.");
  if (draft.adaptationProposalMode === "manual" && draft.allowPromotion) errors.push("Manual approval mode cannot auto-apply adaptations.");
  return errors;
}
export function flowGeneralRuntimeErrors(draft: Pick<FlowSettingsDraft, "name" | "timeoutSeconds" | "maxConcurrency" | "trainingMode" | "trainForRunCount" | "minimumStabilityScore">): string[] {
  const errors: string[] = [];
  const timeout = Number(draft.timeoutSeconds);
  const concurrency = Number(draft.maxConcurrency);
  if (!draft.name.trim()) errors.push("Flow name is required.");
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) errors.push("Runtime timeout must be between 1 second and 1 hour.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) errors.push("Concurrency must be a whole number from 1 to 100.");
  if (draft.trainingMode === "train_for_runs" && (!Number.isInteger(Number(draft.trainForRunCount)) || Number(draft.trainForRunCount) < 1)) errors.push("Fixed training mode needs at least one run.");
  if (draft.trainingMode === "train_until_stable" && (!Number.isFinite(Number(draft.minimumStabilityScore)) || Number(draft.minimumStabilityScore) <= 0 || Number(draft.minimumStabilityScore) > 1)) errors.push("Stability target must be greater than 0 and no more than 1.");
  return errors;
}
export function flowLlmSettingsErrors(draft: Pick<FlowSettingsDraft, "allowLlmIntervention" | "llmProvider" | "llmModel" | "llmSecretKeyId">, compatibleKeys: any[], keysReady: boolean): string[] {
  if (!draft.allowLlmIntervention) return [];
  const errors: string[] = [];
  if (!flowLlmProvider(draft.llmProvider)) errors.push("Choose an LLM provider.");
  if (!draft.llmModel.trim()) errors.push("Choose an LLM model.");
  const needsSecret = draft.llmProvider !== "host" && draft.llmProvider !== "ollama";
  if (needsSecret && keysReady && !draft.llmSecretKeyId) errors.push("Choose an enabled encrypted key for this provider.");
  if (draft.llmSecretKeyId && keysReady && !compatibleKeys.some((key) => key.id === draft.llmSecretKeyId)) errors.push("The selected encrypted key is unavailable, disabled, or belongs to another provider.");
  return errors;
}
export function AutomationTopLevelFlowSettingsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const secretApi = useProgramApi("secret-keys");
  const [savedFlow, setSavedFlow] = useState<any | null>(null);
  const flow = savedFlow?.flowId && savedFlow.flowId === props.flow?.flowId ? savedFlow : props.flow;
  const metadata = flowSettingsMetadata(flow);
  const [draft, setDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [baseDraft, setBaseDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [activeSection, setActiveSection] = useState(() => readSettingsSection(typeof window === "undefined" ? "" : window.location.search, "flow"));
  useEffect(() => { const timer = window.setTimeout(() => scrollToSettingsSection(activeSection), 0); return () => window.clearTimeout(timer); }, []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [llmSecrets, setLlmSecrets] = useState<any[]>([]);
  const [llmSecretsLoading, setLlmSecretsLoading] = useState(false);
  const [llmSecretsError, setLlmSecretsError] = useState("");
  const [flowPublications, setFlowPublications] = useState<any[]>([]);
  const [publicationsLoading, setPublicationsLoading] = useState(false);
  const [publicationsError, setPublicationsError] = useState("");
  const [dependencyChoice, setDependencyChoice] = useState("");
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  useEffect(() => {
    setSavedFlow(null);
    const nextDraft = flowSettingsDraftFromFlow(props.flow);
    setDraft(nextDraft);
    setBaseDraft(nextDraft);
    setMessage("");
    setError("");
  }, [props.flow?.flowId]);
  useEffect(() => {
    let cancelled = false;
    if (!props.projectId || !flow?.flowId) { setLlmSecrets([]); setLlmSecretsError(""); return; }
    setLlmSecretsLoading(true);
    setLlmSecretsError("");
    void secretApi.get<{ keys?: any[] }>("snapshot").then((result) => {
      if (cancelled) return;
      setLlmSecretsLoading(false);
      if (!result.ok) { setLlmSecretsError(result.error ?? "Encrypted keys could not be loaded."); setLlmSecrets([]); return; }
      setLlmSecrets((result.payload?.keys ?? []).filter((key) => key.kind === "llm"));
    });
    return () => { cancelled = true; };
  }, [props.projectId, flow?.flowId]);  useEffect(() => {
    let cancelled = false;
    if (!props.projectId || !flow?.flowId) { setFlowPublications([]); setPublicationsError(""); return; }
    setPublicationsLoading(true);
    setPublicationsError("");
    void api.post<{ publications?: any[] }>("list-flow-publications", { projectId: props.projectId }).then((result) => {
      if (cancelled) return;
      setPublicationsLoading(false);
      if (!result.ok) { setPublicationsError(result.error ?? "Published Flow dependencies could not be loaded."); setFlowPublications([]); return; }
      setFlowPublications((result.payload?.publications ?? []).filter((publication) => publication.status === "published" && publication.flowId !== flow.flowId));
    });
    return () => { cancelled = true; };
  }, [props.projectId, flow?.flowId]);  const draftDirty = settingsDraftIsDirty(draft, baseDraft);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!draftDirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [draftDirty]);
  const generalRuntimeErrors = flowGeneralRuntimeErrors(draft);
  const effectiveSettings = flowEffectiveSettings(flow, draft);
  const resetEffectiveSetting = (key: keyof FlowSettingsDraft) => {
    const value = FLOW_SETTINGS_DEFAULT_VALUES[key];
    if (value === undefined) return;
    if (key === "trainingMode") { setDraft((current) => applyFlowTrainingMode(current, value as FlowSettingsDraft["trainingMode"])); return; }
    if (key === "adaptationPreset") { setDraft((current) => applyFlowAdaptationPreset(current, value as FlowSettingsDraft["adaptationPreset"])); return; }
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const dependencyOptions = flowPublications.map((publication) => ({ value: `flow:${publication.flowId}@${publication.version}`, label: `${publication.snapshot?.name ?? publication.flowId} @ ${publication.version}`, description: publication.snapshot?.description ?? "Published Flow" }));
  const inferredDependencies = (flow?.nodes ?? []).filter((node: any) => node.compositeTarget || node.parameterValues?.target?.flowId).map((node: any) => { const target = node.compositeTarget ?? node.parameterValues.target; return { pin: `flow:${target.flowId}@${target.version ?? "current"}`, label: target.name ?? target.flowId, version: target.version ?? "current" }; });
  const selectedProvider = flowLlmProvider(draft.llmProvider);
  const compatibleLlmSecrets = llmSecrets.filter((key) => key.enabled === true && normalizedProviderLabel(key.provider) === normalizedProviderLabel(selectedProvider.label) && (key.scope === "global" || (key.scope === "flow" && key.scopeRef === flow?.flowId)));
  const llmSettingsErrors = flowLlmSettingsErrors(draft, compatibleLlmSecrets, !llmSecretsLoading && !llmSecretsError);
  const llmSecretError = llmSettingsErrors.find((item) => item.toLowerCase().includes("key")) ?? "";
  const adaptationErrors = flowAdaptationErrors(draft);
  const limitsInterfaceErrors = flowLimitsInterfaceErrors(draft);
  const settingsErrors = [...generalRuntimeErrors, ...llmSettingsErrors, ...adaptationErrors, ...limitsInterfaceErrors];
  const updateDraft = <K extends keyof FlowSettingsDraft>(key: K, value: FlowSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const saveSettings = async (authorizationPin: string) => {
    if (!props.projectId || !flow?.flowId || settingsErrors.length || authorizationPin.trim().length < 4) return;
    setSaving(true);
    setMessage("");
    setError("");
    setSaveAuthorizationError("");
    const result = await api.post<{ flow?: any }>("save-flow", {
      projectId: props.projectId,
      authorizationPin: authorizationPin.trim(),
      expectedUpdatedAt: flow.updatedAt,
      flow: buildFlowSettingsSavePayload(flow, draft)
    });
    setSaving(false);
    if (!result.ok || !result.payload?.flow) {
      const saveError = result.error?.includes("FLOW_SAVE_CONFLICT") ? "Save conflict: this Flow changed elsewhere. Your Settings draft is preserved; reload after reviewing the other change." : result.error ?? "Flow settings could not be saved.";
      setError(saveError);
      setSaveAuthorizationError(saveError);
      return;
    }
    setSavedFlow(result.payload.flow);
    const nextDraft = flowSettingsDraftFromFlow(result.payload.flow);
    setDraft(nextDraft);
    setBaseDraft(nextDraft);
    setMessage("Settings saved.");
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    window.dispatchEvent(new CustomEvent("fluxiq:flow-settings-changed", { detail: { flowId: flow.flowId } }));
  };
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace">
      <header>
        <div><strong>Settings</strong><span>{flow?.name ?? "Select a Flow"} | training, approval, LLM, and safety gates</span></div>
        <span className={`automation-instruction-save-state ${draftDirty ? "unsaved" : "saved"}`}><span aria-hidden />{draftDirty ? "Unsaved changes" : "Saved"}</span>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      {message ? <p className="automation-settings-success">{message}</p> : null}
      {settingsErrors.length ? <div className="automation-settings-validation" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Fix these settings before saving</strong>{settingsErrors.map((item) => <span key={item}>{item}</span>)}</div></div> : null}
      <div className="automation-settings-layout"><nav aria-label="Flow settings sections" className="automation-settings-section-nav">{([["flow-settings-general", "General"], ["flow-settings-runtime", "Runtime"], ["flow-settings-llm", "LLM"], ["flow-settings-adaptation", "Adaptation"], ["flow-settings-limits", "Limits"], ["flow-settings-safety", "Safety"], ["flow-settings-inputs", "Inputs & Outputs"], ["flow-settings-dependencies", "Dependencies"], ["flow-settings-effective", "Effective Values"]] as const).map(([id, label]) => <button aria-current={activeSection === id ? "location" : undefined} className={activeSection === id ? "selected" : ""} key={id} onClick={() => { setActiveSection(id); syncSettingsSectionUrl(id); scrollToSettingsSection(id); }} type="button">{label}</button>)}</nav><div className="automation-flow-settings-grid">
        <section className="automation-settings-panel" id="flow-settings-general">
          <header><strong>Flow Identity</strong><span>Name, description, and catalog visibility</span></header>
          <label><span>Name</span><input aria-invalid={!draft.name.trim()} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Flow name" />{!draft.name.trim() ? <small>Flow name is required.</small> : null}</label>
          <label><span>Description</span><textarea maxLength={1000} rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this Flow is responsible for." /><small>{draft.description.length}/1000 characters</small></label>
          <fieldset className="automation-settings-choice"><legend>Visibility</legend><div className="automation-instruction-segments"><button aria-pressed={draft.visibility === "private"} className={draft.visibility === "private" ? "selected" : ""} onClick={() => updateDraft("visibility", "private")} type="button">Private</button><button aria-pressed={draft.visibility === "public"} className={draft.visibility === "public" ? "selected" : ""} onClick={() => updateDraft("visibility", "public")} type="button">Public composite</button></div><small>Public Flows can be published for reuse when their interface is valid.</small></fieldset>
        </section>
        <section className="automation-settings-panel" id="flow-settings-runtime">
          <header><strong>Training Mode</strong><span>How much help the runtime may ask from the LLM</span></header>
          <fieldset className="automation-settings-choice automation-settings-mode-choice"><legend>LLM intervention mode</legend><div className="automation-settings-mode-grid">{([ ["continuous_adaptive", "Fully adaptive", "LLM recovery and validated adaptations are available continuously."], ["train_for_runs", "Fixed training runs", "Use LLM assistance for a bounded number of runs."], ["train_until_stable", "Until stable", "Use LLM assistance until the stability target is met."], ["normal", "No LLM intervention", "Run deterministic behavior without LLM assistance."] ] as const).map(([value, label, detail]) => <button aria-pressed={draft.trainingMode === value} className={draft.trainingMode === value ? "selected" : ""} key={value} onClick={() => setDraft((current) => applyFlowTrainingMode(current, value))} type="button"><strong>{label}</strong><span>{detail}</span></button>)}</div></fieldset>
          {draft.trainingMode === "train_for_runs" ? <label><span>Training runs</span><input aria-invalid={Number(draft.trainForRunCount) < 1} min={1} type="number" value={draft.trainForRunCount} onChange={(event) => updateDraft("trainForRunCount", event.target.value)} /><small>After this many runs, the Flow returns to deterministic-only execution.</small></label> : null}{draft.trainingMode === "train_until_stable" ? <label><span>Stability target</span><input aria-invalid={Number(draft.minimumStabilityScore) <= 0 || Number(draft.minimumStabilityScore) > 1} max={1} min={0.01} step={0.01} type="number" value={draft.minimumStabilityScore} onChange={(event) => updateDraft("minimumStabilityScore", event.target.value)} /><small>Training ends when the measured stability score reaches this target.</small></label> : null}

        </section>
        <section className="automation-settings-panel" id="flow-settings-runtime-defaults">
          <header><strong>Runtime Defaults</strong><span>Execution limits applied unless a node defines a narrower limit</span></header>
          <label><span>Flow timeout</span><div className="automation-settings-unit-input"><input aria-invalid={!Number.isFinite(Number(draft.timeoutSeconds)) || Number(draft.timeoutSeconds) < 1 || Number(draft.timeoutSeconds) > 3600} min={1} max={3600} type="number" value={draft.timeoutSeconds} onChange={(event) => updateDraft("timeoutSeconds", event.target.value)} /><span>seconds</span></div><small>Allowed range: 1 second to 1 hour.</small></label>
          <label><span>Maximum concurrent runs</span><input aria-invalid={!Number.isInteger(Number(draft.maxConcurrency)) || Number(draft.maxConcurrency) < 1 || Number(draft.maxConcurrency) > 100} min={1} max={100} step={1} type="number" value={draft.maxConcurrency} onChange={(event) => updateDraft("maxConcurrency", event.target.value)} /><small>Additional runs wait in the queue when this limit is reached.</small></label>
        </section>        <section className="automation-settings-panel" id="flow-settings-safety">
          <header><strong>Safety</strong><span>Deterministic gates that remain in force around learned behavior</span></header>
          <SettingsToggle checked={draft.allowRuntimeRecovery} label="Allow deterministic recovery paths" onChange={(checked) => updateDraft("allowRuntimeRecovery", checked)} />
          <SettingsToggle checked={draft.manualReviewForStructuralChanges} label="Review structural changes manually" onChange={(checked) => updateDraft("manualReviewForStructuralChanges", checked)} />
          <SettingsToggle checked={draft.requireApprovalForDestructiveChanges} label="Require approval before deleting or disabling behavior" onChange={(checked) => updateDraft("requireApprovalForDestructiveChanges", checked)} />
          <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>Node permissions and side-effect access are enforced by runtime capability grants, not bypass switches in Flow Settings.</span></div>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-adaptation">
          <header><strong>Adaptations</strong><span>What the runtime may learn, propose, edit, and promote</span></header><label><span>Adaptation policy</span><select value={draft.adaptationPolicyId} onChange={(event) => updateDraft("adaptationPolicyId", event.target.value)}>{draft.adaptationPolicyId && draft.adaptationPolicyId !== "policy.default" ? <option value={draft.adaptationPolicyId}>Current custom policy</option> : null}<option value="policy.default">Default adaptive policy</option></select></label>
          <fieldset className="automation-settings-choice"><legend>Adaptation behavior</legend><div className="automation-settings-mode-grid">{([ ["adaptive", "Fully adaptive", "Create and auto-apply safe validated adaptations."], ["observe", "Observe only", "Create evidence and drafts without changing runtime behavior."], ["locked", "Locked", "Do not create or apply adaptations."], ["autonomous", "Broad autonomy", "Allow broader structural changes with destructive safeguards."] ] as const).map(([preset, label, detail]) => <button aria-pressed={draft.adaptationPreset === preset} className={draft.adaptationPreset === preset ? "selected" : ""} key={preset} onClick={() => setDraft((current) => applyFlowAdaptationPreset(current, preset))} type="button"><strong>{label}</strong><span>{detail}</span></button>)}</div></fieldset><fieldset className="automation-settings-choice"><legend>Approval</legend><div className="automation-instruction-segments"><button aria-pressed={draft.adaptationProposalMode === "auto"} className={draft.adaptationProposalMode === "auto" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, adaptationProposalMode: "auto", proposalApprovalMode: "auto", allowPromotion: current.adaptationPreset !== "locked" && current.adaptationPreset !== "observe" }))} type="button">Automatic</button><button aria-pressed={draft.adaptationProposalMode === "mixed"} className={draft.adaptationProposalMode === "mixed" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, adaptationProposalMode: "mixed", proposalApprovalMode: "mixed", allowPromotion: current.adaptationPreset !== "locked" && current.adaptationPreset !== "observe" }))} type="button">Manual for risky</button><button aria-pressed={draft.adaptationProposalMode === "manual"} className={draft.adaptationProposalMode === "manual" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, adaptationProposalMode: "manual", proposalApprovalMode: "manual", allowPromotion: false }))} type="button">Manual only</button></div><small>Automatic approval applies only validated low-risk changes. Structural and destructive safeguards still apply.</small></fieldset><SettingsToggle checked={draft.requireFirstManualReviewBeforeAutoPromotion} label="Require first adaptation to be reviewed manually" onChange={(checked) => updateDraft("requireFirstManualReviewBeforeAutoPromotion", checked)} />
          <div className="automation-settings-toggle-grid">
            <SettingsToggle checked={draft.manualReviewForStructuralChanges} label="Manual review for structural changes" onChange={(checked) => updateDraft("manualReviewForStructuralChanges", checked)} />
            <SettingsToggle checked={draft.allowCreateRecoveryPaths} label="Create recovery paths" onChange={(checked) => updateDraft("allowCreateRecoveryPaths", checked)} />
            <SettingsToggle checked={draft.allowModifyRouter} label="Modify Flow Map routes" onChange={(checked) => updateDraft("allowModifyRouter", checked)} />
            <SettingsToggle checked={draft.allowModifySubflows} label="Modify subflows" onChange={(checked) => updateDraft("allowModifySubflows", checked)} />
            <SettingsToggle checked={draft.allowCreateSubflows} label="Create subflows" onChange={(checked) => updateDraft("allowCreateSubflows", checked)} />
            <SettingsToggle checked={draft.allowModifyExpectations} label="Modify expectations" onChange={(checked) => updateDraft("allowModifyExpectations", checked)} />
            <SettingsToggle checked={draft.allowModifyActionTargets} label="Modify action targets" onChange={(checked) => updateDraft("allowModifyActionTargets", checked)} />
            <SettingsToggle checked={draft.allowDeleteOrDisableBehavior} label="Delete or disable behavior" onChange={(checked) => updateDraft("allowDeleteOrDisableBehavior", checked)} />
          </div>
          <div className="automation-settings-inline-fields">
            <label><span>Adaptation interventions/run</span><input min={0} type="number" value={draft.maxAdaptationInterventionsPerRun} onChange={(event) => updateDraft("maxAdaptationInterventionsPerRun", event.target.value)} /></label>
            <label><span>Adaptation cost/run</span><input min={0} step={0.01} type="number" value={draft.maxAdaptationCostUsdPerRun} onChange={(event) => updateDraft("maxAdaptationCostUsdPerRun", event.target.value)} /></label>
          </div>
        </section>
        <section className="automation-settings-panel" id="flow-settings-limits">
          <header><strong>LLM Budget</strong><span>Caps for intervention frequency, token use, and spend</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Max interventions/run</span><input min={0} type="number" value={draft.maxInterventionsPerRun} onChange={(event) => updateDraft("maxInterventionsPerRun", event.target.value)} /></label>
            <label><span>Max tokens/run</span><input min={0} type="number" value={draft.maxTokensPerRun} onChange={(event) => updateDraft("maxTokensPerRun", event.target.value)} /></label>
          </div>
          <label><span>Max cost/training window</span><input min={0} step={0.01} type="number" value={draft.maxCostUsdPerTrainingWindow} onChange={(event) => updateDraft("maxCostUsdPerTrainingWindow", event.target.value)} /></label>
          <label><span>When exhausted</span><select value={draft.budgetExhaustedBehavior} onChange={(event) => updateDraft("budgetExhaustedBehavior", event.target.value as FlowSettingsDraft["budgetExhaustedBehavior"])}><option value="ask">Ask before continuing</option><option value="stop">Stop training</option></select></label><div className="automation-settings-divider"><strong>Recovery limits</strong><span>Bound repeated deterministic recovery work.</span></div><div className="automation-settings-inline-fields"><label><span>Retries per action</span><input min={0} max={20} step={1} type="number" value={draft.maxRetriesPerAction} onChange={(event) => updateDraft("maxRetriesPerAction", event.target.value)} /></label><label><span>Recovery attempts/subflow</span><input min={0} max={20} step={1} type="number" value={draft.maxRecoveryAttemptsPerSubflow} onChange={(event) => updateDraft("maxRecoveryAttemptsPerSubflow", event.target.value)} /></label></div><label><span>Reroutes per run</span><input min={0} max={20} step={1} type="number" value={draft.maxReroutesPerRun} onChange={(event) => updateDraft("maxReroutesPerRun", event.target.value)} /></label>
        </section>
        <FlowPortSettingsEditor kind="input" ports={draft.interfaceInputs} onChange={(interfaceInputs) => updateDraft("interfaceInputs", interfaceInputs)} />
        <FlowPortSettingsEditor kind="output" ports={draft.interfaceOutputs} onChange={(interfaceOutputs) => updateDraft("interfaceOutputs", interfaceOutputs)} />
        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-dependencies">
          <header><strong>Dependencies</strong><span>Published Flows this Flow calls and the versions it is pinned to</span></header>
          {flow?.source?.mode === "code" ? <><div className="automation-settings-secret-picker"><Combobox disabled={publicationsLoading} label="Add published Flow" onChange={setDependencyChoice} options={dependencyOptions.filter((option) => !draft.dependencyPins.includes(option.value))} placeholder={publicationsLoading ? "Loading published Flows" : "Search published Flows"} value={dependencyChoice} /><button className="button" disabled={!dependencyChoice} onClick={() => { updateDraft("dependencyPins", [...draft.dependencyPins, dependencyChoice]); setDependencyChoice(""); }} type="button"><Plus size={14} aria-hidden />Add Dependency</button></div><div className="automation-settings-dependency-list">{draft.dependencyPins.map((pin) => { const option = dependencyOptions.find((candidate) => candidate.value === pin); return <div className="automation-settings-dependency-row" key={pin}><div><strong>{option?.label ?? "Configured dependency"}</strong><span>{option?.description ?? "Pinned by code source"}</span></div><button aria-label={`Remove ${option?.label ?? "dependency"}`} className="automation-icon-button" onClick={() => updateDraft("dependencyPins", draft.dependencyPins.filter((item) => item !== pin))} title="Remove dependency" type="button"><Trash2 size={15} aria-hidden /></button></div>; })}</div></> : <div className="automation-settings-dependency-list">{inferredDependencies.map((dependency: { pin: string; label: string; version: string }) => <div className="automation-settings-dependency-row" key={dependency.pin}><div><strong>{dependency.label}</strong><span>Version {dependency.version} | inferred from a Call Flow node</span></div></div>)}{!inferredDependencies.length ? <div className="automation-runtime-empty">No Flow dependencies are used by this graph.</div> : null}</div>}
          {publicationsError ? <div className="automation-settings-inline-notice error" role="alert"><AlertCircle size={16} aria-hidden /><span>{publicationsError}</span></div> : null}
          {flow?.scope?.kind === "global" && draft.authorizedDomainIds.length ? <details><summary>Authorized domain grants</summary><div className="automation-settings-technical-list">{draft.authorizedDomainIds.map((domainId) => <code key={domainId}>{domainId}</code>)}</div></details> : null}
        </section>        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-llm">
          <header><strong>LLM Connection</strong><span>Provider, model, and encrypted credential used for assisted recovery and adaptation</span></header>
          {!draft.allowLlmIntervention ? <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>LLM intervention is currently disabled. This connection will remain configured for later use.</span></div> : null}
          <div className="automation-settings-inline-fields">
            <label><span>Provider</span><select value={draft.llmProvider} onChange={(event) => { const provider = flowLlmProvider(event.target.value); updateDraft("llmProvider", provider.id); updateDraft("llmModel", provider.models[0]); updateDraft("llmSecretKeyId", ""); }}>{FLOW_LLM_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            <label><span>Model</span><select value={draft.llmModel} onChange={(event) => updateDraft("llmModel", event.target.value)}>{(!selectedProvider.models.includes(draft.llmModel as never) && draft.llmModel ? [draft.llmModel, ...selectedProvider.models] : selectedProvider.models).map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
          </div>
          {draft.llmProvider === "host" || draft.llmProvider === "ollama" ? <div className="automation-settings-secret-summary"><CircleCheck size={17} aria-hidden /><div><strong>No encrypted API key required</strong><span>{draft.llmProvider === "host" ? "The host application supplies this provider connection." : "Ollama uses the host-configured local endpoint."}</span></div></div> : <div className="automation-settings-secret-picker"><Combobox disabled={llmSecretsLoading} {...(llmSecretError ? { error: llmSecretError } : {})} hint="Only enabled LLM keys for this provider and Flow scope are listed. Secret values are never loaded here." label="Encrypted API key" onChange={(llmSecretKeyId) => updateDraft("llmSecretKeyId", llmSecretKeyId)} options={compatibleLlmSecrets.map((key) => ({ value: key.id, label: key.name, description: key.scope === "flow" ? "This Flow" : "Global" }))} placeholder={llmSecretsLoading ? "Loading encrypted keys" : "Choose an encrypted key"} value={draft.llmSecretKeyId} /><a className="button" href="/programs/secret-keys">Manage Keys</a></div>}
          {llmSecretsError ? <div className="automation-settings-inline-notice error" role="alert"><AlertCircle size={16} aria-hidden /><span>{llmSecretsError}</span><a href="/programs/secret-keys">Open Key Manager</a></div> : null}
          {!llmSecretsLoading && !llmSecretsError && draft.llmProvider !== "host" && draft.llmProvider !== "ollama" && !compatibleLlmSecrets.length ? <div className="automation-settings-inline-notice warning"><AlertTriangle size={16} aria-hidden /><span>No enabled {selectedProvider.label} key is available for this Flow.</span><a href="/programs/secret-keys">Add Key</a></div> : null}
        </section>
      </div></div>
      <section className="automation-settings-panel automation-settings-panel-wide automation-settings-effective" id="flow-settings-effective">
        <header><strong>Effective Values</strong><span>What this Flow will use after framework defaults and Flow overrides are resolved</span></header>
        <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>This installation has framework defaults and Flow overrides. No project-default settings layer is configured.</span></div>
        <div className="automation-settings-effective-list">{effectiveSettings.map((setting) => <div className="automation-settings-effective-row" key={setting.key}><span>{setting.group}</span><div><strong>{setting.label}</strong><small>{setting.value}</small></div><StatusBadge value={setting.source} />{setting.resettable ? <button className="button" onClick={() => resetEffectiveSetting(setting.key)} type="button">Use Default</button> : <span />}</div>)}</div>
        <JsonToggle label="Show Technical Metadata" value={metadata} />
      </section>      <footer className="automation-settings-form-footer"><span>{draftDirty ? "Unsaved Flow settings" : "All Flow settings saved"}</span><div><button className="button" disabled={!draftDirty || saving} onClick={() => setDraft(baseDraft)} type="button">Discard Changes</button><button className="button button-primary" disabled={!props.projectId || !flow?.flowId || !draftDirty || saving || settingsErrors.length > 0} onClick={() => { setSaveAuthorizationPin(""); setSaveAuthorizationError(""); setSaveAuthorizationOpen(true); }} type="button">{saving ? "Saving..." : "Save Settings"}</button></div></footer>
      {saveAuthorizationOpen ? <Modal title="Authorize Flow Settings Save" onClose={() => saving ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this Flow Settings write with your security PIN. Your draft remains intact if authorization or conflict checks fail.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saving} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saving} onClick={() => void saveSettings(saveAuthorizationPin)} type="button">{saving ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}

    </section>
  );
}

function FlowPortSettingsEditor(props: { kind: "input" | "output"; ports: FlowPortSettingsDraft[]; onChange(ports: FlowPortSettingsDraft[]): void }) {
  const title = props.kind === "input" ? "Flow Inputs" : "Flow Outputs";
  const update = (index: number, patch: Partial<FlowPortSettingsDraft>) => props.onChange(props.ports.map((port, portIndex) => portIndex === index ? { ...port, ...patch } : port));
  const add = () => props.onChange([...props.ports, { id: `port.${props.kind}.${Date.now().toString(36)}`, name: "", valueKind: "string", required: false, description: "", defaultValue: "" }]);
  return <section className="automation-settings-panel automation-settings-panel-wide" id={`flow-settings-${props.kind}s`}><header><strong>{title}</strong><span>{props.kind === "input" ? "Values callers provide when starting this Flow" : "Values this Flow returns to its caller"}</span></header><div className="automation-flow-port-list">{props.ports.map((port, index) => <div className="automation-flow-port-row" key={port.id}><label><span>Name</span><input aria-invalid={!port.name.trim()} onChange={(event) => update(index, { name: event.target.value })} placeholder={props.kind === "input" ? "Customer email" : "Result"} value={port.name} /></label><label><span>Type</span><select onChange={(event) => update(index, { valueKind: event.target.value as FlowPortSettingsDraft["valueKind"], defaultValue: "" })} value={port.valueKind}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="json">Structured value</option></select></label>{port.valueKind === "boolean" ? <label><span>Default</span><select onChange={(event) => update(index, { defaultValue: event.target.value })} value={port.defaultValue}><option value="">No default</option><option value="true">Yes</option><option value="false">No</option></select></label> : <label><span>Default</span><input onChange={(event) => update(index, { defaultValue: event.target.value })} placeholder="No default" type={port.valueKind === "number" ? "number" : "text"} value={port.defaultValue} /></label>}<label className="automation-flow-port-description"><span>Description</span><input onChange={(event) => update(index, { description: event.target.value })} placeholder="How this value is used" value={port.description} /></label><label className="automation-flow-port-required"><input checked={port.required} disabled={props.kind === "output"} onChange={(event) => update(index, { required: event.target.checked })} type="checkbox" /><span>Required</span></label><button aria-label={`Remove ${props.kind} ${port.name || index + 1}`} className="automation-icon-button" onClick={() => props.onChange(props.ports.filter((_, portIndex) => portIndex !== index))} title={`Remove ${props.kind}`} type="button"><Trash2 size={15} aria-hidden /></button></div>)}{!props.ports.length ? <div className="automation-runtime-empty">No {props.kind}s defined.</div> : null}</div><button className="automation-runtime-row-action" onClick={add} type="button"><Plus size={14} aria-hidden />Add {props.kind}</button></section>;
}
function SettingsToggle(props: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return <label className="automation-settings-toggle"><input checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} type="checkbox" /><span>{props.label}</span></label>;
}

function flowPortSettingsDraft(port: any): FlowPortSettingsDraft {
  const kind = ["string", "number", "boolean", "json"].includes(port?.valueType?.kind) ? port.valueType.kind : "json";
  return { id: String(port?.id ?? `port.${Date.now().toString(36)}`), name: String(port?.name ?? ""), valueKind: kind, required: port?.required === true, description: String(port?.description ?? ""), defaultValue: port?.defaultValue === undefined ? "" : kind === "string" ? String(port.defaultValue) : JSON.stringify(port.defaultValue) };
}

function flowPortFromSettingsDraft(port: FlowPortSettingsDraft): any {
  let defaultValue: unknown = undefined;
  if (port.defaultValue.trim()) {
    if (port.valueKind === "string") defaultValue = port.defaultValue;
    else if (port.valueKind === "number") defaultValue = Number(port.defaultValue);
    else if (port.valueKind === "boolean") defaultValue = port.defaultValue === "true";
    else { try { defaultValue = JSON.parse(port.defaultValue); } catch { defaultValue = undefined; } }
  }
  return { id: port.id, name: port.name.trim(), valueType: { kind: port.valueKind }, ...(port.description.trim() ? { description: port.description.trim() } : {}), ...(port.required ? { required: true } : {}), ...(defaultValue !== undefined ? { defaultValue } : {}) };
}
export function flowSettingsDraftFromFlow(flow: any): FlowSettingsDraft {
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
    timeoutSeconds: numberInputValue(Number(flow?.executionDefaults?.timeoutMs ?? 30000) / 1000),
    maxConcurrency: numberInputValue(flow?.executionDefaults?.maxConcurrency ?? 1),
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
    maxRetriesPerAction: numberInputValue(trainingSettings.recoveryBudget?.maxRetriesPerAction ?? 1),
    maxRecoveryAttemptsPerSubflow: numberInputValue(trainingSettings.recoveryBudget?.maxRecoveryAttemptsPerSubflow ?? 2),
    maxReroutesPerRun: numberInputValue(trainingSettings.recoveryBudget?.maxReroutesPerRun ?? 2),
    interfaceInputs: (flow?.interface?.inputs ?? []).map(flowPortSettingsDraft),
    interfaceOutputs: (flow?.interface?.outputs ?? []).map(flowPortSettingsDraft),
    dependencyPins: flow?.source?.mode === "code" ? [...(flow.source.declaredDependencies ?? [])] : [],
    authorizedDomainIds: [...(flow?.executionDefaults?.authorizedDomainIds ?? [])],
    maxInterventionsPerRun: numberInputValue(budgets.maxInterventionsPerRun ?? metadata.maxInterventionsPerRun),
    maxTokensPerRun: numberInputValue(budgets.maxTokensPerRun ?? metadata.maxTokensPerRun),
    maxCostUsdPerTrainingWindow: numberInputValue(budgets.maxCostUsdPerTrainingWindow ?? metadata.maxCostUsdPerTrainingWindow),
    maxAdaptationInterventionsPerRun: numberInputValue(adaptationSettings.maxInterventionsPerRun),
    maxAdaptationCostUsdPerRun: numberInputValue(adaptationSettings.maxEstimatedCostUsdPerRun),
    budgetExhaustedBehavior: budgets.exhaustedBehavior === "stop" || metadata.budgetExhaustedBehavior === "stop" ? "stop" : "ask",
    llmProvider: String(metadata.llmProvider ?? ""),
    llmModel: String(metadata.llmModel ?? flowLlmProvider(String(metadata.llmProvider ?? "host")).models[0]),
    llmSecretKeyId: String(metadata.llmSecretKeyId ?? ""),
    adaptationPolicyId: String(metadata.adaptationPolicyId ?? "")
  };
}

export function buildFlowSettingsSavePayload(flow: any, draft: FlowSettingsDraft) {
  const rawMetadata = flow?.metadata ?? {};
  const {
    trainingMode: _oldTrainingMode, proposalMode: _oldProposalMode, proposalApprovalMode: _oldProposalApprovalMode,
    requireFirstManualReviewBeforeAutoPromotion: _oldFirstReview, manualReviewForStructuralChanges: _oldStructuralReview,
    trainingModeSettings: _oldTrainingSettings, adaptationPolicySettings: _oldAdaptationSettings,
    budgetExhaustedBehavior: _oldBudgetBehavior, llmProvider: _oldLlmProvider, llmModel: _oldLlmModel,
    llmSecretKeyId: _oldLlmSecretKeyId, adaptationPolicyId: _oldAdaptationPolicyId, ...retainedMetadata
  } = rawMetadata;
  const llmProvider = draft.llmProvider.trim();
  const llmModel = draft.llmModel.trim();
  const llmSecretKeyId = draft.llmSecretKeyId.trim();
  const adaptationPolicyId = draft.adaptationPolicyId.trim();
  const recoveryBudget = {
    ...(Number(draft.maxRetriesPerAction) !== 1 ? { maxRetriesPerAction: Math.round(Number(draft.maxRetriesPerAction)) } : {}),
    ...(Number(draft.maxRecoveryAttemptsPerSubflow) !== 2 ? { maxRecoveryAttemptsPerSubflow: Math.round(Number(draft.maxRecoveryAttemptsPerSubflow)) } : {}),
    ...(Number(draft.maxReroutesPerRun) !== 2 ? { maxReroutesPerRun: Math.round(Number(draft.maxReroutesPerRun)) } : {})
  };
  const budgets = {
    ...(Number(draft.maxInterventionsPerRun) !== 2 ? { maxInterventionsPerRun: Number(draft.maxInterventionsPerRun) } : {}),
    ...(Number(draft.maxTokensPerRun) !== 12000 ? { maxTokensPerRun: Number(draft.maxTokensPerRun) } : {}),
    ...(Number(draft.maxCostUsdPerTrainingWindow) !== 5 ? { maxCostUsdPerTrainingWindow: Number(draft.maxCostUsdPerTrainingWindow) } : {}),
    ...(draft.budgetExhaustedBehavior !== "ask" ? { exhaustedBehavior: draft.budgetExhaustedBehavior } : {})
  };
  const trainingModeSettings = {
    ...(draft.trainingMode !== "continuous_adaptive" ? { mode: draft.trainingMode } : {}),
    ...(Number(draft.trainForRunCount) !== 3 ? { trainForRunCount: Number(draft.trainForRunCount) } : {}),
    ...(Number(draft.minimumStabilityScore) !== 0.9 ? { minimumStabilityScore: Number(draft.minimumStabilityScore) } : {}),
    ...(draft.allowLlmIntervention !== true ? { allowLlmIntervention: draft.allowLlmIntervention } : {}),
    ...(draft.allowRuntimeRecovery !== true ? { allowRuntimeRecovery: draft.allowRuntimeRecovery } : {}),
    ...(draft.allowAdaptationCreation !== true ? { allowAdaptationCreation: draft.allowAdaptationCreation } : {}),
    ...(draft.proposalApprovalMode !== "auto" ? { proposalApprovalMode: draft.proposalApprovalMode } : {}),
    ...(draft.allowPromotion !== true ? { allowPromotion: draft.allowPromotion } : {}),
    ...(draft.requireFirstManualReviewBeforeAutoPromotion ? { requireFirstManualReviewBeforeAutoPromotion: true } : {}),
    ...(Object.keys(recoveryBudget).length ? { recoveryBudget } : {}),
    ...(Object.keys(budgets).length ? { budgets } : {})
  };
  const adaptationPolicySettings = {
    ...(draft.adaptationPreset !== "adaptive" ? { preset: draft.adaptationPreset } : {}),
    ...(draft.adaptationProposalMode !== "auto" ? { proposalMode: draft.adaptationProposalMode } : {}),
    ...(draft.manualReviewForStructuralChanges !== true ? { manualReviewForStructuralChanges: draft.manualReviewForStructuralChanges } : {}),
    ...(draft.allowRuntimeRecovery !== true ? { allowRuntimeRecovery: draft.allowRuntimeRecovery } : {}),
    ...(draft.allowCreateRecoveryPaths !== true ? { allowCreateRecoveryPaths: draft.allowCreateRecoveryPaths } : {}),
    ...(draft.allowModifySubflows !== true ? { allowModifySubflows: draft.allowModifySubflows } : {}),
    ...(draft.allowCreateSubflows !== true ? { allowCreateSubflows: draft.allowCreateSubflows } : {}),
    ...(draft.allowModifyRouter !== true ? { allowModifyRouter: draft.allowModifyRouter } : {}),
    ...(draft.allowModifyExpectations !== true ? { allowModifyExpectations: draft.allowModifyExpectations } : {}),
    ...(draft.allowModifyActionTargets !== true ? { allowModifyActionTargets: draft.allowModifyActionTargets } : {}),
    ...(draft.allowDeleteOrDisableBehavior ? { allowDeleteOrDisableBehavior: true } : {}),
    ...(draft.requireApprovalForDestructiveChanges !== true ? { requireApprovalForDestructiveChanges: false } : {}),
    ...(Number(draft.maxAdaptationInterventionsPerRun) !== 3 ? { maxInterventionsPerRun: Number(draft.maxAdaptationInterventionsPerRun) } : {}),
    ...(Number(draft.maxAdaptationCostUsdPerRun) !== 1 ? { maxEstimatedCostUsdPerRun: Number(draft.maxAdaptationCostUsdPerRun) } : {})
  };
  const { timeoutMs: _oldTimeout, maxConcurrency: _oldConcurrency, authorizedDomainIds: _oldDomains, ...retainedExecutionDefaults } = flow.executionDefaults ?? {};
  const authorizedDomainIds = [...new Set(draft.authorizedDomainIds.map((item) => item.trim()).filter(Boolean))];
  return {
    ...flow,
    name: draft.name.trim() || flow.name,
    description: draft.description.trim(),
    visibility: draft.visibility,
    interface: { inputs: draft.interfaceInputs.map(flowPortFromSettingsDraft), outputs: draft.interfaceOutputs.map(flowPortFromSettingsDraft) },
    ...(flow.source?.mode === "code" ? { source: { ...flow.source, declaredDependencies: [...new Set(draft.dependencyPins)] } } : {}),
    executionDefaults: {
      ...retainedExecutionDefaults,
      ...(Number(draft.timeoutSeconds) !== 30 ? { timeoutMs: Math.round(Number(draft.timeoutSeconds) * 1000) } : {}),
      ...(Number(draft.maxConcurrency) !== 1 ? { maxConcurrency: Math.round(Number(draft.maxConcurrency)) } : {}),
      ...(authorizedDomainIds.length ? { authorizedDomainIds } : {})
    },
    metadata: {
      ...retainedMetadata,
      ...(Object.keys(trainingModeSettings).length ? { trainingModeSettings } : {}),
      ...(Object.keys(adaptationPolicySettings).length ? { adaptationPolicySettings } : {}),
      ...(llmProvider && llmProvider !== "host" ? { llmProvider } : {}),
      ...(llmModel && llmModel !== "host-default" ? { llmModel } : {}),
      ...(llmSecretKeyId ? { llmSecretKeyId } : {}),
      ...(adaptationPolicyId && adaptationPolicyId !== "policy.default" ? { adaptationPolicyId } : {})
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

export type AdaptationChangedField = { path: string; before: string; after: string };

export function adaptationChangedFields(before: unknown, after: unknown, limit = 50): AdaptationChangedField[] {
  const fields: AdaptationChangedField[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const display = (value: unknown): string => {
    if (value === undefined) return "Not set";
    if (value === null) return "None";
    if (typeof value === "string") return value || "Empty";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const visit = (left: unknown, right: unknown, path: string) => {
    if (fields.length >= limit || JSON.stringify(left) === JSON.stringify(right)) return;
    if (isRecord(left) || isRecord(right)) {
      const leftRecord = isRecord(left) ? left : {};
      const rightRecord = isRecord(right) ? right : {};
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
      if (keys.length) {
        for (const key of keys) visit(leftRecord[key], rightRecord[key], path ? path + "." + key : key);
        return;
      }
    }
    fields.push({ path: path || "Value", before: display(left), after: display(right) });
  };
  visit(before, after, "");
  return fields;
}

export function adaptationObjectHref(kind: string, targetId?: string): { href: string; label: string } {
  const target = targetId ? encodeURIComponent(targetId) : "";
  if (kind === "edit_router") return { href: "?view=flow-map", label: "Open Router" };
  if (kind === "create_subflow" || kind === "edit_subflow" || kind === "edit_recovery") return { href: target ? "?view=flow-subflows&subflowId=" + target : "?view=flow-subflows", label: "Open Subflows" };
  if (kind === "edit_instruction") return { href: target ? "?view=flow-instructions&instructionId=" + target : "?view=flow-instructions", label: "Open Instructions" };
  if (kind === "edit_expectation" || kind === "edit_action_target") return { href: target ? "?view=flow-editor&nodeId=" + target : "?view=flow-editor", label: "Open Node" };
  return { href: "?view=adaptations", label: "Open Adaptations" };
}

export type AdaptationReviewAction = "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";

export function adaptationReviewActions(status: string): AdaptationReviewAction[] {
  if (status === "proposed") return ["approve", "reject", "request_validation", "switch_manual"];
  if (status === "testing") return ["approve", "reject", "request_validation", "switch_manual"];
  if (status === "validated") return ["apply", "reject", "disable", "supersede", "request_validation", "switch_manual"];
  if (status === "applied") return ["revert"];
  return [];
}

export function adaptationReviewCopy(action: AdaptationReviewAction): { title: string; description: string; label: string; danger: boolean } {
  const copy: Record<AdaptationReviewAction, { title: string; description: string; label: string; danger: boolean }> = {
    approve: { title: "Approve Adaptation", description: "Mark this adaptation as validated and ready for application.", label: "Approve", danger: false },
    reject: { title: "Reject Adaptation", description: "Close this candidate without applying its changes. A reason is required.", label: "Reject", danger: true },
    apply: { title: "Apply Adaptation", description: "Apply the validated changes to their owning Flow objects.", label: "Apply Changes", danger: false },
    disable: { title: "Disable Adaptation", description: "Prevent this validated adaptation from being applied.", label: "Disable", danger: true },
    revert: { title: "Revert Adaptation", description: "Roll back the durable mutations recorded when this adaptation was applied.", label: "Revert Changes", danger: true },
    supersede: { title: "Supersede Adaptation", description: "Close this candidate in favor of another adaptation. A replacement ID and reason are required.", label: "Supersede", danger: true },
    request_validation: { title: "Request Validation", description: "Move this adaptation into validation and record the review action.", label: "Request Validation", danger: false },
    switch_manual: { title: "Require Manual Approval", description: "Keep this candidate pending and require a person to approve promotion.", label: "Require Manual Approval", danger: false }
  };
  return copy[action];
}
function AdaptationChangeCard(props: { change: any; index: number; applied?: boolean }) {
  const kind = props.change.kind ?? props.change.patchKind ?? "change";
  const targetId = props.change.targetId ?? props.change.artifactId;
  const link = adaptationObjectHref(kind, targetId);
  const fields = adaptationChangedFields(props.change.before, props.change.after);
  return (
    <article className="automation-adaptation-change">
      <header>
        <div><strong>{String(kind).replace(/_/g, " ")}</strong><span>{props.change.summary ?? (props.applied ? "Durable mutation" : "Planned change")}</span></div>
        <a href={link.href}>{link.label}</a>
      </header>
      <div className="automation-adaptation-change-target"><span>Target</span><strong>{targetId ?? (kind === "create_subflow" ? "New subflow" : "Owning Flow")}</strong></div>
      {fields.length ? <div className="automation-adaptation-diff" role="table" aria-label="Changed fields">
        <div role="row"><span role="columnheader">Field</span><span role="columnheader">Previous</span><span role="columnheader">New</span></div>
        {fields.map((field) => <div key={field.path} role="row"><strong role="cell">{field.path}</strong><span role="cell">{field.before}</span><span role="cell">{field.after}</span></div>)}
      </div> : <p className="automation-adaptation-copy">No field-level values were recorded for this change.</p>}
      <JsonToggle label="Technical change details" value={{ before: props.change.before, after: props.change.after, metadata: props.change.metadata }} />
    </article>
  );
}
export function AutomationAdaptationsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [sort, setSort] = useState<"updated" | "status" | "risk" | "trigger">("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedAdaptation, setSelectedAdaptation] = useState<any | null>(null);
  const [detailView, setDetailView] = useState<"summary" | "changes" | "evidence" | "validation" | "audit">("summary");
  const [pendingReviewAction, setPendingReviewAction] = useState<AdaptationReviewAction | null>(null);
  const [reviewPin, setReviewPin] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [replacementAdaptationId, setReplacementAdaptationId] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);
  useEffect(() => {
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setSelectedAdaptation(null);
    if (!props.projectId || !flowId) {
      setAdaptations([]);
      setPage({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
      return;
    }
    void loadAdaptations(0);
  }, [props.projectId, flowId, status, risk, search, sort, direction]);
  const loadAdaptations = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError("");
    const result = await api.post<{ adaptations?: any[]; page?: { adaptations?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-adaptations", {
      projectId: props.projectId,
      flowId,
      ...(status ? { status } : {}),
      ...(risk ? { risk } : {}),
      ...(search ? { search } : {}),
      sort,
      direction,
      limit: ADAPTATION_PAGE_SIZE,
      offset
    });
    if (requestId !== listRequestRef.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Adaptations could not be loaded.");
      setAdaptations([]);
      return;
    }
    const resultPage = result.payload?.page;
    setAdaptations(result.payload?.adaptations ?? resultPage?.adaptations ?? []);
    setPage({ limit: resultPage?.limit ?? ADAPTATION_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.adaptations?.length ?? 0 });
  };
  const openAdaptation = async (adaptationId: string) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++detailRequestRef.current;
    setLoadingDetail(true);
    setError("");
    const result = await api.post<{ adaptation?: any }>("get-flow-adaptation", { projectId: props.projectId, flowId, adaptationId });
    if (requestId !== detailRequestRef.current) return;
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.adaptation) {
      setError(result.error ?? "Adaptation detail could not be loaded.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
    setDetailView("summary");
  };
  const requestAdaptationReview = (action: AdaptationReviewAction) => {
    setPendingReviewAction(action);
    setReviewPin("");
    setReviewReason("");
    setReplacementAdaptationId("");
    setReviewError("");
  };
  const reviewAdaptation = async () => {
    if (!props.projectId || !flowId || !selectedAdaptation || !pendingReviewAction || reviewPin.length < 4) return;
    if ((pendingReviewAction === "reject" || pendingReviewAction === "supersede") && !reviewReason.trim()) {
      setReviewError("Enter a reason for this decision.");
      return;
    }
    if (pendingReviewAction === "supersede" && !replacementAdaptationId.trim()) {
      setReviewError("Enter the replacement adaptation ID.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    const result = await api.post<{ adaptation?: any }>("review-flow-adaptation", {
      projectId: props.projectId,
      flowId,
      adaptationId: selectedAdaptation.adaptationId,
      action: pendingReviewAction,
      authorizationPin: reviewPin,
      ...(reviewReason.trim() ? { reason: reviewReason.trim() } : {}),
      ...(pendingReviewAction === "supersede" ? { supersededByAdaptationId: replacementAdaptationId.trim() } : {})
    });
    setReviewBusy(false);
    if (!result.ok || !result.payload?.adaptation) {
      setReviewError(result.error ?? "Adaptation review action failed.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
    setPendingReviewAction(null);
    setReviewPin("");
    setReviewReason("");
    setReplacementAdaptationId("");
    void loadAdaptations(page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Adaptations</strong><span>Review runtime fixes and promotion evidence</span></div></header>
      {error ? <div className="automation-runtime-message" role="alert"><span>{error}</span><button className="button" disabled={loading} onClick={() => loadAdaptations(page.offset)} type="button">Retry</button></div> : null}
      <div className="automation-runtime-debugger automation-adaptation-workspace">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Adaptation Inbox</strong><span>{loading ? "Loading..." : ((page.total ? page.offset + 1 : 0) + "-" + Math.min(page.total, page.offset + adaptations.length) + " of " + page.total)}</span></div>
          </header>
          <div className="automation-adaptation-filters" role="search">
            <label className="automation-adaptation-search"><Search size={15} aria-hidden /><input aria-label="Search adaptations" onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search trigger or ID" type="search" value={searchDraft} /></label>
            <label><span>Status</span><select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="">All statuses</option>{ADAPTATION_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
            <label><span>Risk</span><select aria-label="Filter by risk" onChange={(event) => setRisk(event.target.value)} value={risk}><option value="">All risks</option>{["low", "medium", "high", "destructive"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Sort</span><select aria-label="Sort adaptations" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="updated">Last updated</option><option value="status">Status</option><option value="risk">Risk</option><option value="trigger">Trigger</option></select></label>
            <button aria-label={"Sort " + (direction === "desc" ? "ascending" : "descending")} className="automation-adaptation-sort-direction" onClick={() => setDirection((current) => current === "desc" ? "asc" : "desc")} title={"Sort " + (direction === "desc" ? "ascending" : "descending")} type="button">{direction === "desc" ? <ArrowDown size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}</button>
          </div>
          <div aria-busy={loading} aria-label="Adaptations" className="automation-adaptation-table" role="table">
            <div className="automation-adaptation-table-head" role="row"><span role="columnheader">Trigger</span><span role="columnheader">Risk</span><span role="columnheader">Updated</span><span role="columnheader">Status</span></div>
            {!loading && adaptations.map((adaptation) => <button aria-pressed={selectedAdaptation?.adaptationId === adaptation.adaptationId} className={selectedAdaptation?.adaptationId === adaptation.adaptationId ? "selected" : ""} key={adaptation.adaptationId} onClick={() => openAdaptation(adaptation.adaptationId)} role="row" type="button"><span role="cell"><strong>{adaptation.trigger || "Untitled adaptation"}</strong><small>{adaptation.adaptationId}</small></span><span role="cell"><StatusBadge value={adaptation.riskLevel ?? "low"} /></span><span role="cell">{formatRuntimeTimestamp(adaptation.updatedAt)}</span><span role="cell"><StatusBadge value={adaptation.status ?? "proposed"} /></span></button>)}
            {loading ? <div className="automation-runtime-empty" role="status">Loading adaptations...</div> : null}
            {!loading && !adaptations.length ? <div className="automation-runtime-empty">{search || status || risk ? "No adaptations match these filters." : flowId ? "No adaptations have been created for this Flow." : "Select a Flow to review adaptations."}</div> : null}
          </div>
          <footer className="automation-runtime-pagination-footer">
            <span>Page {page.total ? Math.floor(page.offset / page.limit) + 1 : 0} of {page.total ? Math.ceil(page.total / page.limit) : 0}</span>
            <div className="automation-runtime-pagination">
              <button aria-label="Previous adaptations page" disabled={loading || page.offset <= 0} onClick={() => loadAdaptations(previousOffset)} type="button"><ChevronLeft size={16} aria-hidden />Previous</button>
              <button aria-label="Next adaptations page" disabled={loading || nextOffset >= page.total} onClick={() => loadAdaptations(nextOffset)} type="button">Next<ChevronRight size={16} aria-hidden /></button>
            </div>
          </footer>
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>Adaptation Detail</strong><span>{loadingDetail ? "Loading..." : selectedAdaptation?.adaptationId ?? "No adaptation selected"}</span></div>
            {selectedAdaptation ? <StatusBadge value={selectedAdaptation.status ?? "proposed"} /> : null}
          </header>
          {selectedAdaptation ? <div className="automation-adaptation-detail">
            <nav aria-label="Adaptation detail views" className="automation-adaptation-tabs">{([
              ["summary", "Summary"],
              ["changes", "Changes"],
              ["evidence", "Evidence"],
              ["validation", "Validation"],
              ["audit", "Audit"]
            ] as const).map(([view, label]) => <button aria-pressed={detailView === view} className={detailView === view ? "selected" : ""} key={view} onClick={() => setDetailView(view)} type="button">{label}</button>)}</nav>
            {detailView === "summary" ? <div className="automation-adaptation-detail-body">
              <section className="automation-adaptation-lead">
                <span>Why this adaptation exists</span>
                <strong>{selectedAdaptation.trigger || "No trigger was recorded."}</strong>
                <p>{selectedAdaptation.diagnosis || "The runtime did not record a diagnosis."}</p>
              </section>
              <SummaryStrip items={[
                ["Risk", selectedAdaptation.riskLevel ?? "-"],
                ["Author", selectedAdaptation.author ?? "-"],
                ["Status", selectedAdaptation.status ?? "-"],
                ["Changes", selectedAdaptation.patch?.length ?? 0],
                ["Validations", selectedAdaptation.validationResults?.length ?? 0]
              ]} />
              <section className="automation-runtime-log-section">
                <header><strong>Scope</strong><span>Where this change belongs</span></header>
                <DataTable columns={["Flow", "Subflow", "Created", "Updated"]} rows={[[selectedAdaptation.flowId ?? "-", selectedAdaptation.subflowId ?? "Top-level Flow", formatRuntimeTimestamp(selectedAdaptation.createdAt), formatRuntimeTimestamp(selectedAdaptation.updatedAt)]]} empty="No scope information." />
              </section>
              {selectedAdaptation.metadata?.approvalDecision ? <section className="automation-runtime-log-section">
                <header><strong>Current Decision</strong><span>{selectedAdaptation.metadata.approvalDecision.autoApply === true ? "Automatically allowed" : selectedAdaptation.metadata.approvalDecision.requiresManualApproval ? "Manual review required" : "Recorded"}</span></header>
                <p className="automation-adaptation-copy">{selectedAdaptation.metadata.approvalDecision.reason ?? "No decision explanation was recorded."}</p>
              </section> : null}
            </div> : null}
            {detailView === "changes" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Planned Changes</strong><span>{selectedAdaptation.patch?.length ?? 0} changes</span></header>
                <div className="automation-adaptation-change-list">{(selectedAdaptation.patch ?? []).map((patch: any, index: number) => <AdaptationChangeCard change={patch} index={index} key={patch.targetId ?? index} />)}{!selectedAdaptation.patch?.length ? <p className="automation-runtime-empty">This adaptation does not contain changes.</p> : null}</div>
              </section>
              {selectedAdaptation.metadata?.applicationRecord?.mutations?.length ? <section className="automation-runtime-log-section">
                <header><strong>Applied Changes</strong><span>{selectedAdaptation.metadata.applicationRecord.mutations.length} durable mutations</span></header>
                <div className="automation-adaptation-change-list">{selectedAdaptation.metadata.applicationRecord.mutations.map((mutation: any, index: number) => <AdaptationChangeCard applied change={mutation} index={index} key={mutation.targetId ?? index} />)}</div>
              </section> : null}
            </div> : null}
            {detailView === "evidence" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Source Evidence</strong><span>Records used to create this adaptation</span></header>
                <DataTable columns={["Source", "Reference"]} rows={[
                  ...(selectedAdaptation.sourceRunId ? [["Runtime run", <a href={"?view=runtime-debug&runId=" + encodeURIComponent(selectedAdaptation.sourceRunId)} key={selectedAdaptation.sourceRunId}>Open run {selectedAdaptation.sourceRunId}</a>]] : []),
                  ...((selectedAdaptation.sourceRecordingIds ?? []).map((id: string) => ["Recording", <a href={"?view=recording-timeline&recordingId=" + encodeURIComponent(id)} key={id}>Open recording {id}</a>])),
                  ...((selectedAdaptation.sourceInstructionIds ?? []).map((id: string) => ["Instruction", <a href={"?view=flow-instructions&instructionId=" + encodeURIComponent(id)} key={id}>Open instruction {id}</a>]))
                ]} empty="No source references were recorded." />
              </section>
              <section className="automation-runtime-log-section">
                <header><strong>Observed Context</strong><span>What the runtime compared</span></header>
                <DataTable columns={["Evidence", "Available"]} rows={[
                  ["Observed state", selectedAdaptation.observedState ? "Recorded" : "Not recorded"],
                  ["Expected state", selectedAdaptation.expectedState ? "Recorded" : "Not recorded"],
                  ["Failed action", selectedAdaptation.failedAction ? "Recorded" : "Not recorded"]
                ]} empty="No observed context." />
              </section>
            </div> : null}
            {detailView === "validation" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Validation Runs</strong><span>{selectedAdaptation.validationResults?.length ?? 0} checks</span></header>
                <DataTable columns={["Run", "Result", "Checked", "Detail"]} rows={(selectedAdaptation.validationResults ?? []).map((validation: any) => [
                  validation.runId ?? "-",
                  <StatusBadge key={validation.runId ?? validation.checkedAt} value={validation.status ?? "unknown"} />,
                  formatRuntimeTimestamp(validation.checkedAt),
                  validation.detail ?? "No additional detail."
                ])} empty="This adaptation has not been validated yet." />
              </section>
            </div> : null}
            {detailView === "audit" ? <div className="automation-adaptation-detail-body">
              {selectedAdaptation.metadata?.approvalDecision ? <section className="automation-runtime-log-section">
                <header><strong>Approval Decision</strong><span>{selectedAdaptation.metadata.approvalDecision.decisionId ?? "Runtime decision"}</span></header>
                <DataTable columns={["Mode", "Risk", "Validation", "Manual", "Reason"]} rows={[[selectedAdaptation.metadata.approvalDecision.mode ?? "-", selectedAdaptation.metadata.approvalDecision.risk ?? selectedAdaptation.riskLevel ?? "-", selectedAdaptation.metadata.approvalDecision.validationStatus ?? "-", selectedAdaptation.metadata.approvalDecision.requiresManualApproval ? "Required" : "Not required", selectedAdaptation.metadata.approvalDecision.reason ?? "-"]]} empty="No approval decision." />
              </section> : null}
              <section className="automation-runtime-log-section">
                <header><strong>Review Actions</strong><span>PIN required</span></header>
                <div className="automation-runtime-json-actions">{adaptationReviewActions(selectedAdaptation.status).map((action) => <button className={adaptationReviewCopy(action).danger ? "button button-danger" : action === "apply" ? "button button-primary" : "button"} key={action} onClick={() => requestAdaptationReview(action)} type="button">{adaptationReviewCopy(action).label}</button>)}{!adaptationReviewActions(selectedAdaptation.status).length ? <span className="automation-adaptation-copy">This adaptation is in a terminal state. Its audit record remains available.</span> : null}</div>
              </section>
              <JsonToggle label="Show complete adaptation JSON" value={selectedAdaptation} />
            </div> : null}
          </div> : <p className="automation-runtime-empty">Select an adaptation to inspect its evidence, changes, validation, and audit history.</p>}
        </section>
      </div>
      {pendingReviewAction ? <Modal busy={reviewBusy} closeOnEscape={!reviewBusy} description={adaptationReviewCopy(pendingReviewAction).description} title={adaptationReviewCopy(pendingReviewAction).title} onClose={() => !reviewBusy && setPendingReviewAction(null)}>
        <div className="dialog-form">
          {(pendingReviewAction === "reject" || pendingReviewAction === "supersede") ? <Field label="Reason" required><textarea data-autofocus maxLength={1000} onChange={(event) => setReviewReason(event.target.value)} rows={3} value={reviewReason} /></Field> : null}
          {pendingReviewAction === "supersede" ? <Field hint="Use the stable ID shown in the replacement adaptation." label="Replacement adaptation ID" required><input onChange={(event) => setReplacementAdaptationId(event.target.value)} value={replacementAdaptationId} /></Field> : null}
          <Field {...(reviewError ? { error: reviewError } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" data-autofocus={pendingReviewAction !== "reject" && pendingReviewAction !== "supersede"} inputMode="numeric" onChange={(event) => setReviewPin(event.target.value.replace(/\D/g, "").slice(0, 12))} value={reviewPin} /></Field>
        </div>
        <div className="modal-actions">
          <button className="button" disabled={reviewBusy} onClick={() => setPendingReviewAction(null)} type="button">Cancel</button>
          <button className={adaptationReviewCopy(pendingReviewAction).danger ? "button button-danger" : "button button-primary"} data-modal-submit disabled={reviewBusy || reviewPin.length < 4 || ((pendingReviewAction === "reject" || pendingReviewAction === "supersede") && !reviewReason.trim()) || (pendingReviewAction === "supersede" && !replacementAdaptationId.trim())} onClick={() => void reviewAdaptation()} type="button">{reviewBusy ? "Working..." : adaptationReviewCopy(pendingReviewAction).label}</button>
        </div>
      </Modal> : null}
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

export function RuntimeRunHistory(props: { projectId: string | null; initialSessions: any[]; flowId?: string; focusRunId?: string | null }) {
  const api = useProgramApi("automation-studio");
  const [view, setView] = useState<"list" | "log">("list");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const initialRuns = runtimeRunsForHistory(props.initialSessions, props.flowId);
  const [runs, setRuns] = useState<any[]>(() => initialRuns);
  const [page, setPage] = useState({ limit: RUNTIME_RUN_PAGE_SIZE, offset: 0, total: initialRuns.length });
  const [query, setQuery] = useState<RuntimeRunHistoryQuery>({ status: "", search: "", sort: "updated", direction: "desc", limit: RUNTIME_RUN_PAGE_SIZE });
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState<any | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState("");
  const runListRequestRef = useRef(0);
  useEffect(() => {
    runListRequestRef.current += 1;
    const nextRuns = runtimeRunsForHistory(props.initialSessions, props.flowId);
    setRuns(nextRuns);
    setPage({ limit: query.limit, offset: 0, total: nextRuns.length });
  }, [props.flowId, props.projectId]);
  useEffect(() => {
    if (!props.projectId) return;
    void loadRuns(0, query);
  }, [props.flowId, props.projectId, query.status, query.search, query.sort, query.direction, query.limit]);
  const loadRuns = async (offset: number, nextQuery: RuntimeRunHistoryQuery = query, quiet = false) => {
    if (!props.projectId) return;
    const requestId = ++runListRequestRef.current;
    if (!quiet) setLoadingRuns(true);
    if (!quiet) setError("");
    const result = await api.post<{ runs?: any[]; page?: { runs?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-runs", {
      projectId: props.projectId,
      ...(props.flowId ? { flowId: props.flowId } : {}),
      ...(nextQuery.status ? { status: nextQuery.status } : {}),
      ...(nextQuery.search ? { search: nextQuery.search } : {}),
      sort: nextQuery.sort,
      direction: nextQuery.direction,
      limit: nextQuery.limit,
      offset
    });
    if (requestId !== runListRequestRef.current) return;
    setLoadingRuns(false);
    if (!result.ok) {
      if (!quiet) setError(result.error ?? "Runtime runs could not be loaded.");
      return;
    }
    setError("");
    const resultPage = result.payload?.page;
    setRuns(result.payload?.runs ?? resultPage?.runs ?? []);
    setPage({
      limit: resultPage?.limit ?? nextQuery.limit,
      offset: resultPage?.offset ?? offset,
      total: resultPage?.total ?? result.payload?.runs?.length ?? 0
    });
  };
  useEffect(() => {
    if (!props.projectId || view !== "list") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadRuns(page.offset, query, true);
    };
    const handleRuntimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; flowId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== props.projectId) return;
      if (props.flowId && detail?.flowId && detail.flowId !== props.flowId) return;
      refresh();
    };
    const interval = window.setInterval(refresh, 3_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("fluxiq:runtime-runs-changed", handleRuntimeChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("fluxiq:runtime-runs-changed", handleRuntimeChange);
    };
  }, [props.flowId, props.projectId, view, page.offset, query.status, query.search, query.sort, query.direction, query.limit]);  const updateQuery = (patch: Partial<RuntimeRunHistoryQuery>) => setQuery((current) => ({ ...current, ...patch }));
  const openLog = async (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRunDetail(null);
    setView("log");
    if (!props.projectId) return;
    setLoadingLog(true);
    setError("");
    const result = await api.post<{ runDetail?: any }>("get-flow-run-detail", { projectId: props.projectId, runId, compact: true });
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
        ? <RuntimeRunListPage
            error={error}
            loading={loadingRuns}
            page={page}
            query={query}
            searchDraft={searchDraft}
            sessions={runs}
            onOpenLog={openLog}
            onPage={(offset) => void loadRuns(offset)}
            onQuery={updateQuery}
            onRetry={() => void loadRuns(page.offset)}
            onSearchDraft={setSearchDraft}
            onSubmitSearch={() => updateQuery({ search: searchDraft.trim() })}
          />
        : <RuntimeActionLogPage api={api} error={error} loading={loadingLog} projectId={props.projectId} runId={selectedRunId} runDetail={selectedRunDetail} onBack={closeLog} />}
    </section>
  );
}

type RuntimeRunHistoryQuery = {
  status: string;
  search: string;
  sort: "updated" | "started" | "duration" | "actions" | "status";
  direction: "asc" | "desc";
  limit: number;
};

export function runtimeRunsForHistory(runs: any[], flowId?: string): any[] {
  return sortRuntimeRunsForDebugView(flowId ? runs.filter((run) => run?.flowId === flowId) : runs);
}

export function subflowReadiness(subflow: any): { label: "Ready" | "Needs setup"; tone: "ready" | "attention"; issues: string[] } {
  const issues: string[] = [];
  if (!subflow?.graphFlowId) issues.push("Nodes graph is missing");
  if (subflow?.status !== "active") issues.push(subflow?.status === "archived" ? "Subflow is archived" : "Subflow is disabled");
  return issues.length ? { label: "Needs setup", tone: "attention", issues } : { label: "Ready", tone: "ready", issues };
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

function flowMapFallbackLabel(flowMap: any | null): string {
  if (!flowMap?.fallback) return "-";
  if (flowMap.fallback.kind === "fail") return flowMap.fallback.message ?? "Fail";
  if (flowMap.fallback.kind === "subflow") return `Subflow ${flowMap.fallback.subflowId}`;
  return "Fallback";
}

function instructionDraftFromInstruction(instruction: any | null): InstructionDraft {
  return {
    instructionId: instruction?.instructionId ?? "",
    title: instruction?.title ?? "",
    body: instruction?.body ?? "",
    scopeKind: instruction?.scope?.kind ?? "flow",
    routerId: instruction?.scope?.routerId ?? "",
    subflowId: instruction?.scope?.subflowId ?? "",
    nodeId: instruction?.scope?.nodeId ?? "",
    errorTargetKind: instruction?.scope?.nodeId ? "node" : instruction?.scope?.subflowId ? "subflow" : "flow",
    priority: Number.isFinite(Number(instruction?.priority)) ? Number(instruction.priority) : 50,
    requirement: instruction?.requirement === "required" ? "required" : "advisory",
    status: instruction?.status === "disabled" || instruction?.status === "archived" ? instruction.status : "active"
  };
}

export type InstructionDiagnostic = { severity: "info" | "warning" | "error"; code: string; title: string; message: string; instructionIds: string[] };

export function estimateInstructionTokens(instruction: any): number {
  return Math.ceil((String(instruction?.title ?? "").length + String(instruction?.body ?? "").length) / 4);
}

function instructionDiagnosticScopeKey(instruction: any): string {
  const scope = instruction?.scope ?? {};
  return [scope.kind ?? "flow", scope.projectId ?? "", scope.flowId ?? "", scope.routerId ?? "", scope.subflowId ?? "", scope.nodeId ?? ""].join(":");
}

export function instructionDiagnostics(instructions: any[], tokenBudget = 2_000): InstructionDiagnostic[] {
  const active = instructions.filter((instruction) => instruction?.status !== "disabled" && instruction?.status !== "archived");
  const diagnostics: InstructionDiagnostic[] = [];
  const groups = new Map<string, any[]>();
  for (const instruction of active) {
    const key = instructionDiagnosticScopeKey(instruction);
    groups.set(key, [...(groups.get(key) ?? []), instruction]);
  }
  for (const items of groups.values()) {
    const required = items.filter((instruction) => instruction.requirement === "required");
    const always = required.filter((instruction) => /\balways\b/i.test(String(instruction.body ?? "")));
    const never = required.filter((instruction) => /\bnever\b/i.test(String(instruction.body ?? "")));
    if (always.length && never.length) diagnostics.push({ severity: "error", code: "instruction.conflict", title: "Required guidance conflicts", message: "This target has Required instructions containing both 'always' and 'never' directives. Resolve the conflict before relying on runtime behavior.", instructionIds: [...always, ...never].map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  }
  const duplicateBodies = new Map<string, any[]>();
  for (const instruction of active) {
    const normalized = String(instruction.body ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (normalized) duplicateBodies.set(normalized, [...(duplicateBodies.get(normalized) ?? []), instruction]);
  }
  for (const items of duplicateBodies.values()) if (items.length > 1) diagnostics.push({ severity: "warning", code: "instruction.duplicate", title: "Duplicate guidance", message: "The same instruction text appears more than once. Keep one authoritative copy to make precedence easier to understand.", instructionIds: items.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  const titledGroups = new Map<string, any[]>();
  for (const instruction of active) {
    const title = String(instruction.title ?? "").trim().toLowerCase();
    if (!title) continue;
    const key = instructionDiagnosticScopeKey(instruction) + ":" + title;
    titledGroups.set(key, [...(titledGroups.get(key) ?? []), instruction]);
  }
  for (const items of titledGroups.values()) {
    if (items.length < 2) continue;
    const ordered = [...items].sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));
    const shadowed = ordered.slice(1);
    diagnostics.push({ severity: "warning", code: "instruction.shadowed", title: "Lower-importance guidance may be shadowed", message: `Multiple instructions with this title target the same object. ${String(ordered[0]?.title ?? "The highest-importance instruction")} is applied first.`, instructionIds: shadowed.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  }
  for (const instruction of active) {
    const tokens = estimateInstructionTokens(instruction);
    if (tokens > 800) diagnostics.push({ severity: "warning", code: "instruction.large", title: "Instruction is unusually long", message: `${String(instruction.title ?? "This instruction")} uses about ${tokens} tokens and may crowd out other guidance.`, instructionIds: [String(instruction.instructionId ?? instruction.title)] });
  }
  const estimatedTokens = active.reduce((total, instruction) => total + estimateInstructionTokens(instruction), 0);
  if (estimatedTokens > tokenBudget) diagnostics.push({ severity: "error", code: "instruction.token_budget", title: "Effective guidance exceeds the context budget", message: `About ${estimatedTokens} tokens are active for a ${tokenBudget}-token instruction budget. Later guidance may be truncated or omitted.`, instructionIds: active.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  else if (estimatedTokens > tokenBudget * 0.8) diagnostics.push({ severity: "warning", code: "instruction.token_pressure", title: "Instruction budget is nearly full", message: `About ${estimatedTokens} of ${tokenBudget} instruction tokens are in use.`, instructionIds: active.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  return diagnostics;
}
function RuntimeRunListPage(props: {
  sessions: any[];
  page: { limit: number; offset: number; total: number };
  query: RuntimeRunHistoryQuery;
  searchDraft: string;
  loading: boolean;
  error: string;
  onOpenLog(runId: string): void;
  onPage(offset: number): void;
  onQuery(patch: Partial<RuntimeRunHistoryQuery>): void;
  onRetry(): void;
  onSearchDraft(value: string): void;
  onSubmitSearch(): void;
}) {
  const nextOffset = props.page.offset + props.page.limit;
  const previousOffset = Math.max(0, props.page.offset - props.page.limit);
  const lastOffset = props.page.total ? Math.floor((props.page.total - 1) / props.page.limit) * props.page.limit : 0;
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
      <form className="automation-runtime-run-filters" onSubmit={(event) => { event.preventDefault(); props.onSubmitSearch(); }}>
        <label className="automation-runtime-run-search">
          <span>Find a run</span>
          <input onChange={(event) => props.onSearchDraft(event.target.value)} placeholder="Run ID or Flow ID" type="search" value={props.searchDraft} />
        </label>
        <button className="button" disabled={props.loading} type="submit">Search</button>
        <label>
          <span>Status</span>
          <select onChange={(event) => props.onQuery({ status: event.target.value })} value={props.query.status}>
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select onChange={(event) => props.onQuery({ sort: event.target.value as RuntimeRunHistoryQuery["sort"] })} value={props.query.sort}>
            <option value="updated">Last updated</option>
            <option value="started">Start time</option>
            <option value="duration">Duration</option>
            <option value="actions">Action count</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label>
          <span>Direction</span>
          <select onChange={(event) => props.onQuery({ direction: event.target.value as "asc" | "desc" })} value={props.query.direction}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <label>
          <span>Rows</span>
          <select onChange={(event) => props.onQuery({ limit: Number(event.target.value) })} value={props.query.limit}>
            {[10, 25, 50, 100].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
          </select>
        </label>
        {props.query.search || props.query.status ? <button className="button" onClick={() => { props.onSearchDraft(""); props.onQuery({ search: "", status: "" }); }} type="button">Clear</button> : null}
      </form>
      {props.error ? <div className="automation-runtime-inline-error" role="alert"><span>{props.error}</span><button className="button" onClick={props.onRetry} type="button">Retry</button></div> : null}
      <div className="automation-runtime-run-list" aria-busy={props.loading}>
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
            <span>{session.actionAttemptCount ?? session.attemptCount ?? 0} actions</span>
            <span>{session.effectCount ?? 0} effects</span>
          </article>
        ))}
        {!props.sessions.length && !props.loading ? <p className="automation-runtime-empty">{props.query.search || props.query.status ? "No runs match these filters." : "No runtime sessions have been started for this project."}</p> : null}
      </div>
      <footer className="automation-runtime-pagination-footer">
        <span>{props.loading ? "Loading..." : `${rangeStart}-${rangeEnd} of ${props.page.total}`}</span>
        <div className="automation-runtime-pagination" aria-label="Run history pages">
          <button aria-label="First page" disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(0)} type="button">First</button>
          <button disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(previousOffset)} type="button">Previous</button>
          <span>Page {props.page.total ? Math.floor(props.page.offset / props.page.limit) + 1 : 0} of {props.page.total ? Math.ceil(props.page.total / props.page.limit) : 0}</span>
          <button disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next</button>
          <button aria-label="Last page" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(lastOffset)} type="button">Last</button>
        </div>
      </footer>
    </section>
  );
}

export function RuntimeActionLogPage(props: { api?: { post<T = any>(endpoint: string, payload?: any): Promise<{ ok: boolean; payload?: T; error?: string }> }; projectId?: string | null; runId: string | null; runDetail: any | null; loading: boolean; error: string; onBack(): void }) {
  const [attemptOffset, setAttemptOffset] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportPreparing, setExportPreparing] = useState(false);
  const runDetail = props.runDetail;
  const summary = runDetail?.summary ?? {};
  const trace = runDetail?.trace;
  const embeddedAttempts = runtimeAttemptsForRunDetail(runDetail);
  const [actionPage, setActionPage] = useState<{ actions: any[]; total: number; limit: number; offset: number }>(() => ({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0 }));
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [actionDetailView, setActionDetailView] = useState<"summary" | "data" | "effects" | "state" | "raw">("summary");
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  const nextAttemptOffset = actionPage.offset + actionPage.limit;
  const visibleAttempts = props.api ? actionPage.actions : embeddedAttempts.slice(attemptOffset, attemptOffset + RUNTIME_ACTION_PAGE_SIZE);
  const actionTotal = props.api ? actionPage.total : embeddedAttempts.length;
  const loadActionPage = async (offset: number) => {
    if (!props.api || !props.projectId || !props.runId) return;
    setLoadingActions(true);
    setActionError("");
    const result = await props.api.post<{ actions?: any[]; page?: { actions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-run-actions", { projectId: props.projectId, runId: props.runId, limit: RUNTIME_ACTION_PAGE_SIZE, offset });
    setLoadingActions(false);
    if (!result.ok) { setActionError(result.error ?? "Actions could not be loaded."); return; }
    const page = result.payload?.page;
    setAttemptOffset(page?.offset ?? offset);
    setSelectedAttempt(null);
    setActionDetailView("summary");
    setActionPage({ actions: result.payload?.actions ?? page?.actions ?? [], total: page?.total ?? result.payload?.actions?.length ?? 0, limit: page?.limit ?? RUNTIME_ACTION_PAGE_SIZE, offset: page?.offset ?? offset });
  };
  useEffect(() => {
    setAttemptOffset(0);
    setExportMessage("");
    if (props.api && props.projectId && props.runId) void loadActionPage(0);
    else setActionPage({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0 });
  }, [props.runId, runDetail]);
  const exportAudit = async () => {
    const runId = props.runId;
    if (!props.api || !props.projectId || !runId) return;
    setExportPreparing(true);
    setExportMessage("Preparing complete audit export...");
    const result = await props.api.post<{ audit?: any }>("export-flow-run-audit", { projectId: props.projectId, runId });
    if (!result.ok || !result.payload?.audit) {
      setExportPreparing(false);
      setExportMessage(result.error ?? "Audit export could not be prepared.");
      return;
    }
    const auditBlob = await runtimeAuditBlob(result.payload.audit);
    if (typeof window !== "undefined" && typeof URL !== "undefined") {
      const url = URL.createObjectURL(auditBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fluxiq-run-audit-${runId}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    setExportPreparing(false);
    const actionCount = result.payload.audit?.manifest?.actionCount ?? 0;
    setExportMessage(`Audit export ready with ${actionCount} actions.`);
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
          <span>{summary.runId ?? props.runId} | flow:{summary.flowId ?? "-"} | {actionTotal} actions | {formatRuntimeDuration(summary.startedAt, summary.finishedAt)}</span>
        </div>
        <div className="automation-runtime-log-actions">
          <button className="automation-runtime-row-action" disabled={exportPreparing || !props.api || !props.projectId || !props.runId} onClick={exportAudit} type="button">{exportPreparing ? "Preparing..." : "Export Audit"}</button>
        </div>
      </header>
      {exportMessage ? <p className="automation-runtime-message">{exportMessage}</p> : null}
      {runDetail?.metadata?.terminalFailureReason ? <p className="automation-runtime-message">{runDetail.metadata.terminalFailureReason}</p> : null}
      {runDetail?.metadata?.message ? <p className="automation-runtime-message">{runDetail.metadata.message}</p> : null}
      <section className="automation-runtime-story-panel">
        <div className="automation-runtime-story-summary">
          <strong>Overview</strong>
          <span>{runtimeStoryHeadline(runDetail)}</span>
        </div>
        <dl className="automation-runtime-overview-grid">
          {runtimeRunOverviewItems(runDetail).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <RuntimeRunStory runDetail={runDetail} />
        <RuntimeMetricsPanel summary={summary} metrics={metrics} recoveryCount={recoveryAttempts.length} interventionCount={interventions.length} adaptationCount={runDetail.adaptationIds?.length ?? 0} />
      </section>
      <div className="automation-runtime-log-toolbar">
        <span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : "No actions"}</span>
        <div>
          <button disabled={loadingActions || actionPage.offset <= 0} onClick={() => props.api ? void loadActionPage(Math.max(0, actionPage.offset - actionPage.limit)) : setAttemptOffset(Math.max(0, attemptOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button>
          <button disabled={loadingActions || nextAttemptOffset >= actionTotal} onClick={() => props.api ? void loadActionPage(nextAttemptOffset) : setAttemptOffset(nextAttemptOffset)} type="button">Next</button>
        </div>
      </div>
      {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" onClick={() => void loadActionPage(actionPage.offset)} type="button">Retry</button></div> : null}
      <div className={`automation-runtime-action-workspace ${selectedAttempt ? "has-detail" : ""}`}>
        <div className="automation-runtime-action-list-region">
          <ol aria-busy={loadingActions} className="automation-runtime-action-log">
            {visibleAttempts.map((attempt: any, index: number) => (
              <li key={runtimeAttemptKey(attempt, actionPage.offset + index)}>
                <RuntimeAttemptRow
                  attempt={attempt}
                  index={actionPage.offset + index}
                  selected={selectedAttempt?.attemptId === attempt.attemptId}
                  onSelect={() => { setSelectedAttempt(attempt); setActionDetailView("summary"); }}
                />
              </li>
            ))}
          </ol>
          {!actionTotal && !loadingActions ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
        </div>
        {selectedAttempt ? <RuntimeActionDetailPanel attempt={selectedAttempt} index={Math.max(0, visibleAttempts.indexOf(selectedAttempt)) + actionPage.offset} view={actionDetailView} onClose={() => setSelectedAttempt(null)} onView={setActionDetailView} /> : null}
      </div>
      <RuntimeRecoveryRoutingPanel flowId={summary.flowId} recoveryAttempts={recoveryAttempts} routeDecisions={runDetail.routeDecisions ?? []} />

      <RuntimeLlmAdaptationPanel flowId={summary.flowId} runDetail={runDetail} />

      <RuntimeRunStateEffectsPanel runDetail={runDetail} runId={props.runId} visibleAttempts={visibleAttempts} />

    </section>
  );
}

export async function runtimeAuditBlob(audit: unknown): Promise<Blob> {
  if (typeof Worker === "undefined" || typeof URL === "undefined") return new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
  const workerSource = "self.onmessage=function(event){self.postMessage(new Blob([JSON.stringify(event.data,null,2)],{type:'application/json'}));};";
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(workerUrl);
      worker.onmessage = (event) => { worker.terminate(); resolve(event.data as Blob); };
      worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || "Audit serialization failed.")); };
      worker.postMessage(audit);
    });
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}
export function runtimeRunOverviewItems(runDetail: any): Array<[string, string]> {
  const summary = runDetail?.summary ?? {};
  const metadata = runDetail?.metadata ?? {};
  return [
    ["Started", formatRuntimeTimestamp(summary.startedAt)],
    ["Finished", formatRuntimeTimestamp(summary.finishedAt)],
    ["Duration", formatRuntimeDuration(summary.startedAt, summary.finishedAt)],
    ["Flow version", String(summary.flowVersion ?? metadata.flowVersion ?? "Current")],
    ["Intervention mode", runtimeInterventionModeLabel(metadata.runningMode ?? metadata.interventionMode ?? metadata.trainingMode)],
    ["Outcome", String(metadata.terminalFailureReason ?? metadata.terminalReason ?? metadata.message ?? summary.status ?? "Unknown")]
  ];
}

function runtimeInterventionModeLabel(value: unknown): string {
  if (value === "manual_approval") return "Manual approval";
  if (value === "deterministic" || value === "deterministic_only") return "No LLM intervention";
  if (value === "default" || value === "continuous_adaptive" || value === "fully_adaptive") return "Fully adaptive";
  return value ? String(value).replace(/_/g, " ") : "Saved Flow setting";
}
export function runtimeRecoveryRoutingEvents(routeDecisions: any[], recoveryAttempts: any[]): Array<{ id: string; kind: "route" | "recovery"; timestamp: number; title: string; target: string; status: string; reason: string; fallback: boolean; rejected: string[]; detail: any }> {
  const routes = routeDecisions.map((decision, index) => ({
    id: String(decision.decisionId ?? `route.${index}`),
    kind: "route" as const,
    timestamp: Number(decision.decidedAt ?? 0),
    title: decision.fallbackUsed ? "Router fallback selected" : "Route selected",
    target: String(decision.selectedSubflowId ?? decision.selectedRuleId ?? "No target"),
    status: decision.selectedSubflowId || decision.selectedRuleId ? "succeeded" : "failed",
    reason: String(decision.reason ?? decision.explanation ?? (decision.fallbackUsed ? "No active rule matched." : "The selected rule matched the current signals.")),
    fallback: decision.fallbackUsed === true,
    rejected: (decision.rejectedRuleIds ?? []).map(String),
    detail: decision
  }));
  const recovery = recoveryAttempts.map((attempt, index) => ({
    id: String(attempt.recoveryId ?? attempt.attemptId ?? `recovery.${index}`),
    kind: "recovery" as const,
    timestamp: Number(attempt.startedAt ?? attempt.decidedAt ?? attempt.createdAt ?? 0),
    title: "Recovery candidate selected",
    target: String(attempt.selectedTargetNodeId ?? attempt.selectedEdgeId ?? attempt.selectedKind ?? "No target"),
    status: String(attempt.status ?? "unknown"),
    reason: String(attempt.reason ?? "No recovery explanation was recorded."),
    fallback: false,
    rejected: (attempt.rejectedCandidateIds ?? attempt.metadata?.rejectedCandidateIds ?? []).map(String),
    detail: attempt
  }));
  return [...routes, ...recovery].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
}

function RuntimeRecoveryRoutingPanel(props: { flowId?: string; routeDecisions: any[]; recoveryAttempts: any[] }) {
  const events = runtimeRecoveryRoutingEvents(props.routeDecisions, props.recoveryAttempts);
  return (
    <section className="automation-runtime-log-section automation-runtime-decision-panel">
      <header><strong>Recovery and Routing</strong><span>{props.routeDecisions.length} routes | {props.recoveryAttempts.length} recovery attempts</span></header>
      <div className="automation-runtime-decision-links">
        <a className="automation-runtime-row-action" href="?view=flow-map">Open Router</a>
      </div>
      <ol className="automation-runtime-decision-timeline">
        {events.map((event, index) => <li key={event.id}>
          <span className="automation-runtime-decision-index">{index + 1}</span>
          <div>
            <div className="automation-runtime-decision-title"><strong>{event.title}</strong><StatusBadge value={event.status} /></div>
            <span>{event.reason}</span>
            <div className="automation-runtime-decision-meta">
              <span>Target: {event.target}</span>
              {event.fallback ? <span>Fallback</span> : null}
              {event.rejected.length ? <span>{event.rejected.length} alternatives rejected</span> : null}
              {event.kind === "route" && event.detail.selectedSubflowId ? <a href={`?view=flow-subflows&subflowId=${encodeURIComponent(event.detail.selectedSubflowId)}`}>Open Subflow</a> : null}
            </div>
          </div>
          <JsonToggle label="Decision JSON" value={event.detail} />
        </li>)}
      </ol>
      {!events.length ? <p className="automation-runtime-empty">No route or recovery decisions were recorded.</p> : null}
    </section>
  );
}
export function runtimeLlmAdaptationEvents(runDetail: any): Array<{ id: string; stage: string; title: string; status: string; summary: string; provider?: string; model?: string; usage?: string; adaptationId?: string; detail: any }> {
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const patchAttempts = Array.isArray(runDetail?.metadata?.runtimePatchAttempts) ? runDetail.metadata.runtimePatchAttempts : [];
  const adaptationIds = Array.isArray(runDetail?.adaptationIds) ? runDetail.adaptationIds : [];
  const retry = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveRetry) ? runDetail.metadata.adaptiveRetry : null;
  const interventionEvents = interventions.map((intervention: any, index: number) => ({
    id: String(intervention.interventionId ?? `llm.${index}`),
    stage: "LLM",
    title: String(intervention.kind ?? "Intervention").replace(/_/g, " "),
    status: String(intervention.status ?? "attempted"),
    summary: String(intervention.reason ?? intervention.summary ?? intervention.approvalDecision?.reason ?? "LLM assistance was recorded."),
    ...(intervention.provider ? { provider: String(intervention.provider) } : {}),
    ...(intervention.model ? { model: String(intervention.model) } : {}),
    usage: `${runtimeTokenLabel(intervention.tokenUsage)} tokens | ${runtimeCostLabel(intervention.tokenUsage?.estimatedCostUsd)}`,
    detail: intervention
  }));
  const patchEvents = patchAttempts.map((attempt: any, index: number) => ({
    id: String(attempt.patchAttemptId ?? attempt.attemptId ?? `patch.${index}`),
    stage: "Patch Test",
    title: "Candidate behavior test",
    status: String(attempt.patchedTraceStatus ?? attempt.status ?? "attempted"),
    summary: String(attempt.reason ?? attempt.message ?? (attempt.patchedTraceStatus === "succeeded" ? "The candidate passed deterministic validation." : "The candidate did not pass deterministic validation.")),
    detail: attempt
  }));
  const adaptationEvents = adaptationIds.map((adaptationId: string) => ({
    id: adaptationId,
    stage: "Adaptation",
    title: "Adaptation created",
    status: "created",
    summary: String(runDetail?.metadata?.approvalDecision?.reason ?? "A durable behavior change was recorded for review or application."),
    adaptationId,
    detail: { adaptationId, approvalDecision: runDetail?.metadata?.approvalDecision }
  }));
  const retryEvents = retry ? [{
    id: "adaptive-retry",
    stage: "Retry",
    title: "Deterministic retry",
    status: String(retry.status ?? "attempted"),
    summary: String(retry.reason ?? retry.message ?? `${retry.attemptCount ?? 0} retry actions completed with status ${retry.status ?? "attempted"}.`),
    detail: retry
  }] : [];
  return [...interventionEvents, ...patchEvents, ...adaptationEvents, ...retryEvents];
}

function RuntimeLlmAdaptationPanel(props: { flowId?: string; runDetail: any }) {
  const events = runtimeLlmAdaptationEvents(props.runDetail);
  return (
    <section className="automation-runtime-log-section automation-runtime-llm-adaptation-panel">
      <header><strong>LLM and Adaptation</strong><span>{events.length} recorded stages</span></header>
      <ol className="automation-runtime-adaptation-sequence">
        {events.map((event, index) => <li key={event.id}>
          <span className="automation-runtime-decision-index">{index + 1}</span>
          <div>
            <span className="automation-runtime-adaptation-stage">{event.stage}</span>
            <div className="automation-runtime-decision-title"><strong>{event.title}</strong><StatusBadge value={event.status} /></div>
            <p>{event.summary}</p>
            <div className="automation-runtime-decision-meta">
              {event.provider ? <span>Provider: {event.provider}</span> : null}
              {event.model ? <span>Model: {event.model}</span> : null}
              {event.usage ? <span>{event.usage}</span> : null}
              {event.adaptationId ? <a href={adaptationReviewHref(props.flowId, event.adaptationId)}>Open Adaptation</a> : null}
            </div>
          </div>
          <JsonToggle label="Stage JSON" value={event.detail} />
        </li>)}
      </ol>
      {!events.length ? <p className="automation-runtime-empty">No LLM intervention or adaptation was used in this run.</p> : null}
    </section>
  );
}
export function runtimeRunEffects(runDetail: any, attempts: any[]): any[] {
  if (Array.isArray(runDetail?.effects)) return runDetail.effects;
  if (Array.isArray(runDetail?.trace?.effects)) return runDetail.trace.effects;
  return attempts.flatMap((attempt) => (attempt.effects ?? []).map((effect: any) => ({ ...effect, nodeId: effect.nodeId ?? attempt.nodeId, attemptId: attempt.attemptId })));
}

export function runtimeRunStateEvidence(runDetail: any, attempts: any[]): Array<{ id: string; action: string; phase: string; stateRef: string; detail: any }> {
  const evidence: Array<{ id: string; action: string; phase: string; stateRef: string; detail: any }> = [];
  for (const [index, reference] of (runDetail?.startingStateRefs ?? []).entries()) {
    evidence.push({ id: `starting.${index}`, action: "Run", phase: "Starting state", stateRef: String(reference.stateRef ?? reference.snapshotId ?? reference.id ?? "Recorded reference"), detail: reference });
  }
  for (const attempt of attempts) {
    const refs = attempt?.metadata?.stateRefs ?? {};
    for (const [key, label] of [["beforeAction", "Before action"], ["afterAction", "After action"], ["stateDiff", "State diff"]] as const) {
      const detail = refs[key];
      if (!detail) continue;
      evidence.push({ id: `${attempt.attemptId ?? attempt.nodeId}.${key}`, action: String(attempt.nodeId ?? attempt.attemptId ?? "Action"), phase: label, stateRef: String(detail.stateRef ?? detail.stateSnapshotId ?? detail.snapshotId ?? "Recorded evidence"), detail });
    }
  }
  return evidence;
}

function RuntimeRunStateEffectsPanel(props: { runDetail: any; runId: string | null; visibleAttempts: any[] }) {
  const [view, setView] = useState<"effects" | "state">("effects");
  const [effectOffset, setEffectOffset] = useState(0);
  const effects = runtimeRunEffects(props.runDetail, props.visibleAttempts);
  const stateEvidence = runtimeRunStateEvidence(props.runDetail, props.visibleAttempts);
  const visibleEffects = effects.slice(effectOffset, effectOffset + RUNTIME_ACTION_PAGE_SIZE);
  const finalValues = props.runDetail?.finalValues ?? props.runDetail?.trace?.values ?? {};
  return (
    <section className="automation-runtime-log-section automation-runtime-state-effects-panel">
      <header>
        <div><strong>State and Effects</strong><span>{effects.length} effects | {stateEvidence.length} state references</span></div>
        <div className="automation-runs-view-control" aria-label="State and effects view" role="group">
          <button aria-pressed={view === "effects"} className={view === "effects" ? "button button-primary" : "button"} onClick={() => setView("effects")} type="button">Effects</button>
          <button aria-pressed={view === "state"} className={view === "state" ? "button button-primary" : "button"} onClick={() => setView("state")} type="button">State</button>
        </div>
      </header>
      {view === "effects" ? <>
        <DataTable columns={["#", "Action", "Type", "Payload"]} rows={visibleEffects.map((effect: any, index: number) => [effectOffset + index + 1, effect.nodeId ?? effect.attemptId ?? "-", effect.type ?? "-", <JsonToggle key={`${effectOffset + index}:effect`} label="Show payload" value={effect.payload ?? effect} />])} empty="No runtime effects were dispatched." />
        {effects.length > RUNTIME_ACTION_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer"><span>{effectOffset + 1}-{Math.min(effects.length, effectOffset + RUNTIME_ACTION_PAGE_SIZE)} of {effects.length}</span><div className="automation-runtime-pagination"><button disabled={effectOffset <= 0} onClick={() => setEffectOffset(Math.max(0, effectOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button><button disabled={effectOffset + RUNTIME_ACTION_PAGE_SIZE >= effects.length} onClick={() => setEffectOffset(effectOffset + RUNTIME_ACTION_PAGE_SIZE)} type="button">Next</button></div></footer> : null}
      </> : <>
        <div className="automation-runtime-decision-links"><a className="automation-runtime-row-action" href={`?view=state-view${props.runId ? `&runId=${encodeURIComponent(props.runId)}` : ""}`}>Open State Viewer</a></div>
        <DataTable columns={["Action", "Phase", "Reference", "Detail"]} rows={stateEvidence.map((item) => [item.action, item.phase, item.stateRef, <JsonToggle key={item.id} label="Show reference" value={item.detail} />])} empty="No state references were recorded for the visible actions." />
        <JsonToggle label={`Show final state (${Object.keys(finalValues).length} keys)`} value={finalValues} />
      </>}
    </section>
  );
}
function RuntimeRunStory(props: { runDetail: any }) {
  const detail = props.runDetail;
  const summary = detail?.summary ?? {};
  const attemptCount = detail?.summary?.actionAttemptCount ?? runtimeAttemptsForRunDetail(detail).length;
  const recoveryAttempts = Array.isArray(detail?.recoveryAttempts) ? detail.recoveryAttempts : [];
  const interventions = Array.isArray(detail?.interventions) ? detail.interventions : [];
  const runtimePatchAttempts = Array.isArray(detail?.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  const adaptiveRetry = isRuntimeJsonRecord(detail?.metadata?.adaptiveRetry) ? detail.metadata.adaptiveRetry : null;
  const steps = [
    {
      label: "Deterministic Run",
      value: `${attemptCount} actions`,
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

export function RuntimeAttemptRow(props: { attempt: any; index: number; selected?: boolean; onSelect?(): void }) {
  const attempt = props.attempt;
  const comparisonStatus = attempt.comparisonStatus ?? attempt.transitionComparison?.status;
  const recoverySelected = attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected;
  return (
    <article
      aria-current={props.selected ? "true" : undefined}
      className={`automation-runtime-attempt-row ${props.selected ? "selected" : ""}`}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (!props.onSelect || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        props.onSelect();
      }}
      role={props.onSelect ? "button" : undefined}
      tabIndex={props.onSelect ? 0 : undefined}
    >
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
      {props.onSelect ? <ChevronRight aria-label="Open action details" size={16} /> : null}
    </article>
  );
}

function RuntimeActionDetailPanel(props: { attempt: any; index: number; view: "summary" | "data" | "effects" | "state" | "raw"; onClose(): void; onView(view: "summary" | "data" | "effects" | "state" | "raw"): void }) {
  const attempt = props.attempt;
  const stateRefs = attempt.metadata?.stateRefs ?? {};
  const views = [["summary", "Summary"], ["data", "Data"], ["effects", "Effects"], ["state", "State"], ["raw", "Raw JSON"]] as const;
  return (
    <aside className="automation-runtime-action-detail" aria-label={`Action ${props.index + 1} details`}>
      <header>
        <div><strong>Action #{props.index + 1}</strong><span>{attempt.nodeId ?? attempt.definitionId ?? "Action"}</span></div>
        <button aria-label="Close action details" className="automation-icon-button" onClick={props.onClose} title="Close action details" type="button"><X size={16} /></button>
      </header>
      <div className="automation-runtime-action-detail-tabs" aria-label="Action detail view" role="tablist">
        {views.map(([id, label]) => <button aria-selected={props.view === id} className={props.view === id ? "active" : ""} key={id} onClick={() => props.onView(id)} role="tab" type="button">{label}</button>)}
      </div>
      <div className="automation-runtime-action-detail-body">
        {props.view === "summary" ? <DataTable columns={["Field", "Value"]} rows={[
          ["Status", <StatusBadge key="status" value={attempt.status ?? "unknown"} />],
          ["Node", attempt.nodeId ?? "-"],
          ["Definition", attempt.definitionId ?? "-"],
          ["Route", attempt.route ?? "-"],
          ["Region", attempt.regionId ?? "-"],
          ["Started", formatRuntimeTimestamp(attempt.startedAt)],
          ["Duration", formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)],
          ["Message", attempt.message ?? attempt.policyDecision?.reason ?? "-"]
        ]} empty="No action summary." /> : null}
        {props.view === "data" ? <div className="automation-runtime-action-detail-stack"><section><strong>Inputs</strong><JsonPreview value={attempt.inputs ?? {}} /></section><section><strong>Outputs</strong><JsonPreview value={attempt.outputs ?? {}} /></section></div> : null}
        {props.view === "effects" ? <DataTable columns={["Type", "Payload"]} rows={(attempt.effects ?? []).map((effect: any, index: number) => [effect.type ?? `Effect ${index + 1}`, <JsonToggle key={index} label="Show payload" value={effect.payload ?? effect} />])} empty="No effects were emitted by this action." /> : null}
        {props.view === "state" ? <div className="automation-runtime-action-detail-stack"><section><strong>Before action</strong><JsonPreview value={stateRefs.beforeAction ?? {}} /></section><section><strong>After action</strong><JsonPreview value={stateRefs.afterAction ?? {}} /></section><section><strong>State diff</strong><JsonPreview value={stateRefs.stateDiff ?? attempt.metadata?.diffSummary ?? {}} /></section></div> : null}
        {props.view === "raw" ? <JsonPreview value={runtimeAttemptDetailsJson(attempt, attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected)} /> : null}
      </div>
    </aside>
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
