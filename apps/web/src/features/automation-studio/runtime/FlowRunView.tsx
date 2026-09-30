"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleCheck } from "lucide-react";
import type { AutomationStudioActionPermissionRequest } from "fluxiq/automation-studio/action-permissions";
import { RunHistory } from "./RunHistory";
import { RunPermissionRequest } from "./RunPermissionRequest";
import { RunControlBar } from "./RunControlBar";
import { useRunControl } from "./useRunControl";
import { commitRuntimeRunChanged } from "./run-commands";
import { sortRuntimeRunsForDebugView } from "./run-detail-model";
import {
  buildAutomationRuntimeRunPayload,
  createRuntimeReadinessRequestGate,
  isAutomationRuntimeExplicitLlmRunMode,
  parseRuntimeRunInputDocument,
  runtimeFlowInputPorts,
  runtimeFlowReadinessIssues,
  runtimeRunInputValues,
  runtimeTypedInputError,
  runtimeTypedInputErrors,
  updateRuntimeRunInputText,
  type AutomationRuntimeRunMode,
  type AutomationRuntimeUiRunMode,
  type RuntimeReadinessIssue
} from "./run-input-model";
import { useRuntimeDetailCommands, useRuntimeExecutionCommands, type RuntimeDetailCommands, type RuntimeExecutionCommands } from "./runtime-host";
import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { registerAutomationStudioRuntimeActions, updateAutomationStudioRuntimeActions } from "../workspace/studio-action-registry";
import { AUTOMATION_LLM_PROGRESS_LABELS } from "../authoring/blank-flow-authoring-model";
export type FlowRunViewProps = {
  projectId: string | null;
  /**
   * Whether this run panel is the visible one. Supplied by the canonical view
   * host, which owns the activity a mounted-but-hidden pane still has, so the
   * workspace header can resolve its Play and Stop to the panel in front of the
   * person rather than to the most recently registered one.
   */
  activeRef?: { current: boolean };
  flow?: any;
  pipelineArtifacts: any;
  timelines: any[];
  models: any[];
  policies: any[];
  runtimeSessions: any[];
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
  onOpenReadinessTarget?(target: RuntimeReadinessIssue["target"]): void;
};
/**
 * The run a permission request came back from, and what it ran with. Allowing
 * is honoured only while all of it still holds: the permission answers the
 * question this run asked, not one a changed Flow or changed inputs might ask.
 */
type RunPermissionContext = {
  projectId: string;
  flowId: string;
  runId: string;
  mode: AutomationRuntimeUiRunMode;
  inputText: string;
  maxSteps: string;
  runDetail: unknown;
};

/** How long a run whose request was cut short is read back for, and how often. */
const RUN_READ_BACK_LIMIT_MS = 15 * 60_000;
const RUN_READ_BACK_INTERVAL_MS = 2_000;
const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

/** The request timed out on its way back; the run it started is not known to have stopped. */
function requestWasCutShort(result: { status?: number; code?: string }): boolean {
  return result.status === 408 || result.status === 504 || result.code === "request_timeout";
}

/** The execute answer rebuilt from the run's own detail, as `run-runtime-session` builds it. */
function runResultFromDetail(runDetail: any) {
  const summary = runDetail?.summary ?? {};
  const adaptationIds: string[] = Array.isArray(runDetail?.adaptationIds) ? runDetail.adaptationIds : [];
  const attempts: any[] = Array.isArray(runDetail?.metadata?.runtimePatchAttempts) ? runDetail.metadata.runtimePatchAttempts : [];
  return {
    runtimeSession: { runId: summary.runId, flowId: summary.flowId, status: summary.status },
    runSummary: summary,
    runDetailLink: { runId: summary.runId },
    createdAdaptationIds: adaptationIds,
    interventionCount: summary.interventionCount ?? 0,
    terminalReason: summary.status,
    durableBehaviorChanged: adaptationIds.some((adaptationId) => attempts.some((attempt) => attempt?.adaptationId === adaptationId && attempt?.approvalDecision?.autoApply === true))
  };
}

export function FlowRunView(props: FlowRunViewProps) {
  const commands = useRuntimeExecutionCommands();
  const detailCommands = useRuntimeDetailCommands();
  return <FlowRunViewContent {...props} commands={commands} loadRunDetail={detailCommands.loadDetail} />;
}

export function FlowRunViewContent(props: FlowRunViewProps & { commands: RuntimeExecutionCommands; loadRunDetail?: RuntimeDetailCommands["loadDetail"] }) {
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  const [inputText, setInputText] = useState("{}");
  const [maxSteps, setMaxSteps] = useState("50");
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<any | null>(null);
  const [localRunIds, setLocalRunIds] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStartedAt, setActiveRunStartedAt] = useState<number | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<AutomationRuntimeUiRunMode>("fully_adaptive");
  const [runPermission, setRunPermission] = useState<RunPermissionContext | null>(null);
  const runGenerationRef = useRef(0);
  const [readiness, setReadiness] = useState<{ loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string }>({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" });
  const readinessRequestGateRef = useRef<ReturnType<typeof createRuntimeReadinessRequestGate> | null>(null);
  const studioRuntimeActionId = React.useId();
  if (!readinessRequestGateRef.current) readinessRequestGateRef.current = createRuntimeReadinessRequestGate();
  const runtimeRunCount = useMemo(() => {
    const persistedIds = new Set(props.runtimeSessions.map((session) => session?.runId).filter((runId): runId is string => typeof runId === "string"));
    return props.runtimeSessions.length + localRunIds.filter((runId) => !persistedIds.has(runId)).length;
  }, [localRunIds, props.runtimeSessions]);
  const rememberLocalRun = (runId: string) => setLocalRunIds((current) => current.includes(runId) ? current : [...current, runId]);
  const loadReadiness = useCallback(async () => {
    if (!props.projectId || !props.flow?.flowId) {
      readinessRequestGateRef.current!.invalidate();
      setReadiness({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" });
      return;
    }
    const requestId = readinessRequestGateRef.current!.begin();
    setReadiness((current) => ({ ...current, loading: true, error: "" }));
    const result = await props.commands.loadReadiness({ projectId: props.projectId, flowId: props.flow.flowId });
    if (!readinessRequestGateRef.current!.isCurrent(requestId)) return;
    setReadiness({ loading: false, ...result });
  }, [props.commands, props.flow?.flowId, props.projectId]);
  useEffect(() => {
    const defaults = Object.fromEntries(runtimeFlowInputPorts(props.flow).filter((port) => port.defaultValue !== undefined).map((port) => [port.id, port.defaultValue]));
    setInputText(JSON.stringify(defaults));
    setLocalRunIds([]);
    runGenerationRef.current += 1;
    setRunPermission(null);
  }, [props.flow?.flowId, props.projectId]);
  useEffect(() => {
    void loadReadiness();
    if (!props.projectId || !props.flow?.flowId) return;
    return subscribeToAutomationStudioMutations(() => void loadReadiness(), {
      kinds: ["instruction.changed", "router.changed", "subflow.changed", "flow-settings.changed"],
      projectId: props.projectId,
      flowId: props.flow.flowId
    });
  }, [loadReadiness, props.flow?.flowId, props.projectId]);
  // A run that stopped to ask carries the question in its run detail, not in
  // the execute answer. The compact detail keeps the run's metadata, which is
  // where Core writes it. A later run, or another Flow, supersedes the read.
  const readRunPermission = async (generation: number, context: Omit<RunPermissionContext, "runDetail">, loaded?: any) => {
    let runDetail: any = loaded;
    if (runDetail === undefined) {
      if (!props.loadRunDetail) return;
      try {
        const detail = await props.loadRunDetail({ projectId: context.projectId, runId: context.runId, compact: true });
        runDetail = detail.ok ? detail.payload?.runDetail : undefined;
      } catch {
        /* best-effort: the run is already shown, and its detail stays readable in Previous Runs */
        return;
      }
    }
    if (runGenerationRef.current !== generation || runDetail?.metadata?.permissionRequest === undefined) return;
    setRunPermission({ ...context, runDetail });
  };
  // A command gets 30 seconds, and an exploring recovery takes longer. When
  // the request that started a run is cut short, the run goes on in Core, so
  // it is read back by its id until it ends -- otherwise its result, and any
  // question it came back with, would never reach the person. `null` is a run
  // still unfinished at the limit, or one this view no longer shows.
  const readRunBack = async (generation: number, runId: string): Promise<any | null> => {
    if (!props.loadRunDetail || !props.projectId) return null;
    const deadline = Date.now() + RUN_READ_BACK_LIMIT_MS;
    while (Date.now() < deadline && runGenerationRef.current === generation) {
      await new Promise((resolve) => setTimeout(resolve, RUN_READ_BACK_INTERVAL_MS));
      try {
        const detail = await props.loadRunDetail({ projectId: props.projectId, runId, compact: true });
        const runDetail = detail.ok ? detail.payload?.runDetail : undefined;
        if (TERMINAL_RUN_STATUSES.has(runDetail?.summary?.status)) return runDetail;
      } catch {
        /* best-effort: a run not written yet, or one failed read, is read again until the limit */
      }
    }
    return null;
  };
  /**
   * `permittedConsequences` is present only when a person allowed a run's
   * request, and is then exactly that request's `missing` classes: the run is
   * permitted what was asked and nothing more. A run started any other way
   * carries none. A model-assisted run needs nothing else: pressing Run calls
   * the endpoint.
   */
  const runFlow = async (mode: AutomationRuntimeUiRunMode, permittedConsequences?: AutomationStudioActionPermissionRequest["missing"]) => {
    const explicitLlmMode = isAutomationRuntimeExplicitLlmRunMode(mode);
    const runtimeMode: AutomationRuntimeRunMode = explicitLlmMode ? "manual_approval" : mode;
    const generation = ++runGenerationRef.current;
    const ranWith = { projectId: props.projectId ?? "", flowId: props.flow?.flowId ?? "", mode, inputText, maxSteps };
    setRunPermission(null);
    setRunningMode(mode);
    setRunError("");
    const inputErrors = runtimeTypedInputErrors(props.flow, runtimeRunInputValues(inputText));
    if (inputErrors.length) { setRunError(inputErrors[0] ?? "Run inputs are invalid."); setRunningMode(null); return; }
    const payload = buildAutomationRuntimeRunPayload({ projectId: props.projectId, flowId: props.flow?.flowId, mode: runtimeMode, inputText, maxSteps });
    if (!payload.ok) { setRunError(payload.error); setRunningMode(null); return; }
    setLastMode(mode);
    if (explicitLlmMode) {
      // Named here rather than by Core, so the run can be read back if this
      // request is cut short (Core's `newRunId`).
      const newRunId = globalThis.crypto.randomUUID();
      const result = await props.commands.execute({
        ...payload.payload,
        runIntent: mode,
        ...(permittedConsequences?.length ? { permittedConsequences: [...permittedConsequences] } : {}),
        newRunId
      });
      const runId = result.payload?.runtimeSession?.runId;
      if (result.ok && result.payload?.runtimeSession && runId) {
        setRunningMode(null);
        rememberLocalRun(runId);
        commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
        setLiveRunId(runId);
        setLastRun(result.payload);
        await readRunPermission(generation, { ...ranWith, runId });
        return;
      }
      if (!requestWasCutShort(result)) { setRunningMode(null); setRunError("The LLM-assisted run could not be completed."); return; }
      rememberLocalRun(newRunId);
      setLiveRunId(newRunId);
      const runDetail = await readRunBack(generation, newRunId);
      setRunningMode(null);
      commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId: newRunId });
      if (!runDetail) { if (runGenerationRef.current === generation) setRunError("The run is still going on the server. Open it in Previous Runs when it ends."); return; }
      setLastRun(runResultFromDetail(runDetail));
      await readRunPermission(generation, { ...ranWith, runId: newRunId }, runDetail);
      return;
    }
    const queued = await props.commands.start({ projectId: payload.payload.projectId, flowId: payload.payload.flowId, inputs: payload.payload.inputs });
    if (!queued.ok || !queued.payload?.runtimeSession?.runId) { setRunningMode(null); setRunError(queued.error ?? "Runtime session could not be queued."); return; }
    const runId = queued.payload.runtimeSession.runId;
    rememberLocalRun(runId);
    commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
    setActiveRunId(runId);
    setActiveRunStartedAt(Date.now());
    setLiveRunId(runId);
    const result = await props.commands.execute({ ...payload.payload, runId });
    const readBack = !result.ok && requestWasCutShort(result) ? await readRunBack(generation, runId) : undefined;
    setRunningMode(null);
    setActiveRunId(null);
    setActiveRunStartedAt(null);
    commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
    if (readBack) {
      setLastRun(runResultFromDetail(readBack));
      await readRunPermission(generation, { ...ranWith, runId }, readBack);
      return;
    }
    if (!result.ok || !result.payload?.runtimeSession) { setRunError(result.error ?? "Runtime session could not be completed."); return; }
    setLastRun(result.payload);
    await readRunPermission(generation, { ...ranWith, runId });
  };
  const requestRun = (mode: AutomationRuntimeUiRunMode) => { void runFlow(mode); };
  // Allow and run again: the same run intent, permitted exactly the missing
  // classes, and only while the Flow and inputs are the ones the run
  // asked with. Don't allow sends nothing and only forgets the question.
  const allowRunPermission = (request: AutomationStudioActionPermissionRequest) => {
    const pending = runPermission;
    if (!pending || !isAutomationRuntimeExplicitLlmRunMode(pending.mode)) return;
    if (pending.projectId !== (props.projectId ?? "") || pending.flowId !== (props.flow?.flowId ?? "") || pending.inputText !== inputText || pending.maxSteps !== maxSteps) {
      setRunPermission(null);
      setRunError("The Flow or its run inputs changed since this run asked. Run it again before allowing anything.");
      return;
    }
    setRunError("");
    void runFlow(pending.mode, request.missing);
  };
  const stopRun = async () => {
    if (!props.projectId || !activeRunId) return;
    const result = await props.commands.cancel({ projectId: props.projectId, runId: activeRunId });
    if (!result.ok) setRunError(result.error ?? "Run could not be stopped.");
    else commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId: activeRunId });
  };
  // The run a person can pause: the one this panel started, or an authorized
  // run whose id is known while its request is still open.
  const controlledRunId = activeRunId ?? (runningMode ? liveRunId : null);
  const runControl = useRunControl({ projectId: props.projectId, runId: controlledRunId, commands: props.commands });
  const studioRuntimeActions = {
    // The header's Play and Stop drive the run panel a person is looking at, not
    // whichever one mounted last. The object-scoped view ids make a Run and test
    // tab per Flow routine, so without this the header answered an invisible
    // panel. `FlowGraphCanvas` resolves graph actions the same way.
    active: () => props.activeRef?.current ?? true,
    canPlay: Boolean(props.projectId && props.flow?.flowId && !runningMode && !activeRunId),
    canPause: runControl.canPause,
    canStop: Boolean(props.projectId && activeRunId),
    play: () => { requestRun(lastMode); },
    pause: () => { void runControl.pause(false); },
    stop: () => { void stopRun(); }
  };
  useEffect(() => registerAutomationStudioRuntimeActions(studioRuntimeActionId, studioRuntimeActions), [studioRuntimeActionId]);
  useEffect(() => updateAutomationStudioRuntimeActions(studioRuntimeActionId, studioRuntimeActions));
  return (
    <section className="automation-runtime-stage">
      <header className="automation-runtime-stage-header">
        <div>
          <span>Run and test</span>
          <strong>{props.flow?.name ?? props.flow?.flowId ?? "Select a Flow"}</strong>
          <p>Start a controlled run, then inspect its actions, decisions, and state changes.</p>
        </div>
        <span>{runtimeRunCount} {runtimeRunCount === 1 ? "run" : "runs"}</span>
      </header>
      <RuntimeRunControlPanel
        disabled={!props.projectId || !props.flow?.flowId || Boolean(runningMode)}
        readiness={readiness}
        flow={props.flow}
        inputText={inputText}
        maxSteps={maxSteps}
        runningMode={runningMode}
        onInputText={setInputText}
        onMaxSteps={setMaxSteps}
        onRun={requestRun}
        activeRunId={activeRunId}
        activeRunStartedAt={activeRunStartedAt}
        canRetry={Boolean(lastRun || runError)}
        onStop={() => void stopRun()}
        onRetry={() => requestRun(lastMode)}
        onRetryReadiness={() => void loadReadiness()}
        onOpenLiveLog={() => activeRunId && setLiveRunId(activeRunId)}
        {...(props.onOpenReadinessTarget ? { onOpenTarget: props.onOpenReadinessTarget } : {})}
      />
      {controlledRunId ? <RunControlBar control={runControl} /> : null}
      {runError ? <p className="automation-runtime-message" role="alert">{runError}</p> : null}
      {lastRun ? <RuntimePostRunSummary result={lastRun} {...(props.onOpenAdaptation ? { onOpenAdaptation: props.onOpenAdaptation } : {})} {...(runPermission && runPermission.runId === lastRun.runtimeSession?.runId ? { permission: {
        runDetail: runPermission.runDetail,
        busy: Boolean(runningMode),
        onDismiss: () => setRunPermission(null),
        ...(isAutomationRuntimeExplicitLlmRunMode(runPermission.mode) ? { onAllow: allowRunPermission } : {})
      } } : {})} /> : null}
      <RuntimeHistoryAndReplays
        flowId={props.flow?.flowId}
        focusRunId={liveRunId ?? lastRun?.runtimeSession?.runId}
        projectId={props.projectId}
        replays={props.pipelineArtifacts?.replayResults ?? []}
        sessions={orderedSessions}
      />
    </section>
  );
}

function runtimeModeDescription(mode: AutomationRuntimeUiRunMode): string {
  if (mode === "diagnosis_only") return "Ask the assistant once to explain what went wrong. It changes nothing, retries nothing, and publishes nothing.";
  if (mode === "diagnose_and_adapt") return "Work out what went wrong and write one suggested fix, held for you to approve. Nothing is applied on its own.";
  if (mode === "explore_and_adapt") return "If a step fails, look at the live page to find a fix and hold it for you to approve. Anything with a lasting effect asks you first.";
  if (mode === "manual_approval") return "Let the assistant help, but hold every change it suggests for you to approve.";
  if (mode === "no_llm_intervention") return "Run only the saved steps. No assistance, and no changes suggested.";
  return "Run it, and let it fix itself when the page changes. Safe, checked fixes are applied for you.";
}

export function RuntimeRunControlPanel(props: {
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
  onRetryReadiness(): void;
  onOpenLiveLog(): void;
  onOpenTarget?(target: RuntimeReadinessIssue["target"]): void;
  onInputText(value: string): void;
  onMaxSteps(value: string): void;
  onRun(mode: AutomationRuntimeUiRunMode): void;
}) {
  const [selectedMode, setSelectedMode] = useState<AutomationRuntimeUiRunMode>("fully_adaptive");
  const runModes: Array<{ mode: AutomationRuntimeUiRunMode; label: string }> = [
    { mode: "fully_adaptive", label: "Fully adaptive" },
    { mode: "manual_approval", label: "Manual approval" },
    { mode: "no_llm_intervention", label: "No LLM intervention" },
    { mode: "diagnosis_only", label: "LLM diagnosis" },
    { mode: "diagnose_and_adapt", label: "Diagnose and propose adaptation" },
    { mode: "explore_and_adapt", label: "Explore and adapt" }
  ];
  const warnings = [
    props.flow?.metadata?.trainingMode === "continuous_adaptive" ? "Continuous adaptive mode can create runtime adaptations." : "",
    props.flow?.metadata?.adaptationPolicySettings?.preset === "autonomous" ? "Autonomous policy can promote eligible validated adaptations." : ""
  ].filter(Boolean);
  const declaredInputs = runtimeFlowInputPorts(props.flow);
  const inputValues = runtimeRunInputValues(props.inputText);
  const inputErrors = runtimeTypedInputErrors(props.flow, inputValues);
  const inputDocument = parseRuntimeRunInputDocument(props.inputText);
  const readinessIssues = runtimeFlowReadinessIssues(props.flow, props.readiness, selectedMode);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => { if (!props.activeRunStartedAt) { setElapsedSeconds(0); return; } const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - props.activeRunStartedAt!) / 1000))); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [props.activeRunStartedAt]);
  return (
    <section className="automation-runtime-run-panel">
      <header>
        <div>
          <strong>New run</strong>
          <span>Try this automation and watch what it does.</span>
        </div>
        {!props.readiness.loading && !props.readiness.error && !readinessIssues.length ? <span className="automation-runtime-ready"><CircleCheck size={15} aria-hidden />Ready</span> : null}
      </header>
      {warnings.length ? <div className="automation-runtime-message">{warnings.join(" ")}</div> : null}
      <div className="automation-runtime-run-command">
        <div className="automation-runtime-mode-summary">
          <strong>{runModes.find((mode) => mode.mode === selectedMode)?.label ?? ""}</strong>
          <span>{runtimeModeDescription(selectedMode)}</span>
        </div>
        <div className="automation-runtime-run-actions">
          <label><span>Step limit</span><input min={1} type="number" value={props.maxSteps} onChange={(event) => props.onMaxSteps(event.target.value)} /></label>
          <button className="button button-primary" disabled={props.disabled || props.readiness.loading || Boolean(props.readiness.error) || readinessIssues.length > 0 || inputErrors.length > 0 || !inputDocument.ok} onClick={() => props.onRun(selectedMode)} type="button">
            {props.runningMode === "diagnose_and_adapt" ? `${AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal}...` : props.runningMode === "explore_and_adapt" ? `${AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}...` : props.runningMode ? "Running..." : "Run"}
          </button>
        </div>
      </div>
      <details className="automation-runtime-advanced-mode">
        <summary>Advanced</summary>
        <fieldset className="automation-runtime-mode-control">
          <legend>Change how it runs</legend>
          <div>{runModes.map((mode) => <button aria-pressed={selectedMode === mode.mode} className={selectedMode === mode.mode ? "selected" : ""} disabled={Boolean(props.runningMode)} key={mode.mode} onClick={() => setSelectedMode(mode.mode)} type="button">{mode.label}</button>)}</div>
          <small>{runtimeModeDescription(selectedMode)}</small>
        </fieldset>
      </details>
      {props.readiness.loading ? <div className="automation-runtime-readiness-check"><span aria-hidden className="automation-inline-spinner" /><span>Checking whether this is ready to run...</span></div> : props.readiness.error ? <div className="automation-runtime-readiness" role="alert"><AlertTriangle size={17} aria-hidden /><div><strong>We could not check this automation</strong><span>{props.readiness.error}</span></div><div><button className="button" onClick={props.onRetryReadiness} type="button">Retry</button></div></div> : readinessIssues.length ? <div className="automation-runtime-readiness" role="status"><AlertTriangle size={17} aria-hidden /><div><strong>Not ready yet</strong>{readinessIssues.map((issue) => <span key={issue.label}>{issue.label}</span>)}</div><div>{readinessIssues.map((issue) => <button className="button" key={issue.target} onClick={() => props.onOpenTarget?.(issue.target)} type="button">{issue.action}</button>)}</div></div> : null}
      {declaredInputs.length ? <div className="automation-runtime-input-fields">
        <header><strong>Values to use</strong><span>Fill these in before the run starts</span></header>
        <div>
          {declaredInputs.map((port) => {
            const value = inputValues[port.id];
            const kind = port.valueType?.kind ?? "json";
            const error = runtimeTypedInputError(port, value);
            return <label key={port.id}><span>{port.name}{port.required ? " (required)" : ""}</span>{kind === "boolean" ? <select aria-invalid={Boolean(error)} value={value === true ? "true" : value === false ? "false" : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value === "" ? undefined : event.target.value === "true"))}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select> : kind === "number" ? <input aria-invalid={Boolean(error)} type="number" value={typeof value === "number" ? value : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value === "" ? undefined : Number(event.target.value)))} /> : kind === "string" ? <input aria-invalid={Boolean(error)} value={typeof value === "string" ? value : ""} onChange={(event) => props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, event.target.value))} /> : <textarea aria-invalid={Boolean(error)} rows={3} value={value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2)} onChange={(event) => { let next: any = event.target.value; try { next = JSON.parse(event.target.value); } catch {} props.onInputText(updateRuntimeRunInputText(props.inputText, port.id, next)); }} />}{port.description ? <small>{port.description}</small> : null}{error ? <small className="automation-field-error">{error}</small> : null}</label>;
          })}
        </div>
      </div> : <div className="automation-runtime-input-preview">
        <strong>Nothing to fill in</strong>
        <span>This automation runs with the values already saved on it.</span>
      </div>}
      {props.activeRunId ? <div className="automation-runtime-live-control" role="status"><span className="automation-inline-spinner" aria-hidden /><div><strong>Run in progress</strong><span>{elapsedSeconds}s elapsed | {props.activeRunId}</span></div><button className="button" onClick={props.onOpenLiveLog} type="button">Open Live Log</button><button className="button danger" onClick={props.onStop} type="button">Stop</button></div> : props.canRetry ? <div className="automation-runtime-retry-control"><span>Run it again with the same values.</span><button className="button" disabled={props.disabled} onClick={props.onRetry} type="button">Retry Run</button></div> : null}
      <details className="automation-runtime-advanced-inputs">
        <summary>Raw values</summary>
        <label><span>Every value for this run, as JSON</span><textarea aria-invalid={!inputDocument.ok} rows={8} spellCheck={false} value={props.inputText} onChange={(event) => props.onInputText(event.target.value)} />{!inputDocument.ok ? <small className="automation-field-error" role="alert">{inputDocument.error}</small> : <small>This stays in step with the fields above.</small>}</label>
      </details>
    </section>
  );
}

function RuntimeHistoryAndReplays(props: { projectId: string | null; flowId?: string; focusRunId?: string | null; sessions: any[]; replays: any[] }) {
  const [section, setSection] = useState<"runs" | "replays">("runs");
  const replays = props.flowId
    ? props.replays.filter((replay) => !replay.flowId || replay.flowId === props.flowId)
    : props.replays;
  return <section className="automation-runtime-history">
    <header><div><strong>{section === "runs" ? "Previous Runs" : "Replay History"}</strong><span>{section === "runs" ? "Inspect previous executions" : "Compare recording replays"}</span></div><div aria-label="Runtime history type" className="automation-runs-view-control" role="tablist"><button aria-selected={section === "runs"} className={section === "runs" ? "active" : ""} onClick={() => setSection("runs")} role="tab" type="button">Runs</button><button aria-selected={section === "replays"} className={section === "replays" ? "active" : ""} onClick={() => setSection("replays")} role="tab" type="button">Replays</button></div></header>
    <div className="automation-runtime-history-body" role="tabpanel">{section === "runs" ? <RunHistory {...(props.flowId ? { flowId: props.flowId } : {})} {...(props.focusRunId ? { focusRunId: props.focusRunId } : {})} projectId={props.projectId} initialSessions={props.sessions} /> : <div className="automation-runs-replay-view"><DataTable label="Replay validation history" columns={["Replay", "Status", "Recording", "Flow", "Matched", "Warnings"]} rows={replays.map((replay: any) => [replay.replayId, <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />, replay.recordingId, replay.policyId ?? replay.flowId ?? "-", `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`, replay.timingWarnings?.length ?? 0])} empty="No replay validations generated yet." /></div>}</div>
  </section>;
}

export function RuntimePostRunSummary(props: {
  result: any;
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
  /** The run's own detail and the answers to a permission request it may carry. */
  permission?: { runDetail: unknown; busy: boolean; onAllow?(request: AutomationStudioActionPermissionRequest): void; onDismiss(): void };
}) {
  const session = props.result.runtimeSession ?? {};
  const adaptationIds = Array.isArray(props.result.createdAdaptationIds) ? props.result.createdAdaptationIds : [];
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Last Run</strong><span>{session.runId ?? "-"}</span></header>
      {props.permission ? <RunPermissionRequest busy={props.permission.busy} onDismiss={props.permission.onDismiss} runDetail={props.permission.runDetail} {...(props.permission.onAllow ? { onAllow: props.permission.onAllow } : {})} /> : null}
      {adaptationIds.length ? <p className="automation-runtime-message" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.readyForReview}.</strong> {adaptationIds.length === 1 ? "One adaptation" : `${adaptationIds.length} adaptations`} must be reviewed and approved before applying.</p> : null}
      <SummaryStrip items={[
        ["Status", session.status ?? "-"],
        ["Actions", props.result.runSummary?.actionAttemptCount ?? session.trace?.attempts?.length ?? 0],
        ["Recovery", props.result.runSummary?.metadata?.recoveryAttemptCount ?? 0],
        ["Interventions", props.result.interventionCount ?? 0],
        ["Adaptations", adaptationIds.length],
        ["Durable", props.result.durableBehaviorChanged ? "yes" : "no"]
      ]} />
      <DataTable label="Run result summary" columns={["Field", "Value"]} rows={[
        ["Terminal reason", props.result.terminalReason ?? session.trace?.message ?? session.status ?? "-"],
        ["Run detail", props.result.runDetailLink?.runId ?? session.runId ?? "-"],
        ["Adaptations", adaptationIds.length ? adaptationIds.map((adaptationId: string) => <button aria-label={`Review ${adaptationId}`} className="automation-runtime-row-action" key={adaptationId} onClick={() => props.onOpenAdaptation?.(props.result.runSummary?.flowId ?? session.flowId, adaptationId)} type="button">Review {adaptationId}</button>) : "-"]
      ]} empty="No run result." />
    </section>
  );
}
