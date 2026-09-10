"use client";

import { DataTable, Modal, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleCheck } from "lucide-react";
import { RunHistory } from "./RunHistory";
import { commitRuntimeRunChanged } from "./run-commands";
import { sortRuntimeRunsForDebugView } from "./run-detail-model";
import {
  buildAutomationRuntimeRunPayload,
  createRuntimeReadinessRequestGate,
  parseRuntimeRunInputDocument,
  runtimeFlowInputPorts,
  runtimeFlowReadinessIssues,
  runtimeLlmExecutionRequestFromFlow,
  runtimeRunInputValues,
  runtimeTypedInputError,
  runtimeTypedInputErrors,
  updateRuntimeRunInputText,
  type AutomationRuntimeExplicitLlmRunMode,
  type AutomationRuntimeRunMode,
  type AutomationRuntimeUiRunMode,
  type RuntimeReadinessIssue
} from "./run-input-model";
import { useRuntimeExecutionCommands, type RuntimeExecutionCommands } from "./runtime-host";
import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { registerAutomationStudioRuntimeActions, updateAutomationStudioRuntimeActions } from "../workspace/studio-action-registry";
import { BlankFlowAuthoringPanel } from "../authoring";
import { AUTOMATION_LLM_PROGRESS_LABELS, llmRequestRequiresHighTokenWarning } from "../authoring/blank-flow-authoring-model";
export type FlowRunViewProps = {
  projectId: string | null;
  flow?: any;
  pipelineArtifacts: any;
  timelines: any[];
  models: any[];
  policies: any[];
  runtimeSessions: any[];
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
  onOpenReadinessTarget?(target: RuntimeReadinessIssue["target"]): void;
};
export function FlowRunView(props: FlowRunViewProps) {
  const commands = useRuntimeExecutionCommands();
  return <FlowRunViewContent {...props} commands={commands} />;
}

export function FlowRunViewContent(props: FlowRunViewProps & { commands: RuntimeExecutionCommands }) {
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  const [inputText, setInputText] = useState("{}");
  const [maxSteps, setMaxSteps] = useState("50");
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<any | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStartedAt, setActiveRunStartedAt] = useState<number | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<AutomationRuntimeUiRunMode>("fully_adaptive");
  const [llmAuthorizationMode, setLlmAuthorizationMode] = useState<AutomationRuntimeExplicitLlmRunMode | null>(null);
  const [llmAuthorizationError, setLlmAuthorizationError] = useState("");
  const [llmAuthorizing, setLlmAuthorizing] = useState(false);
  const [readiness, setReadiness] = useState<{ loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string }>({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" });
  const readinessRequestGateRef = useRef<ReturnType<typeof createRuntimeReadinessRequestGate> | null>(null);
  const studioRuntimeActionId = React.useId();
  if (!readinessRequestGateRef.current) readinessRequestGateRef.current = createRuntimeReadinessRequestGate();
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
  }, [props.flow?.flowId]);
  useEffect(() => {
    void loadReadiness();
    if (!props.projectId || !props.flow?.flowId) return;
    return subscribeToAutomationStudioMutations(() => void loadReadiness(), {
      kinds: ["instruction.changed", "router.changed", "subflow.changed", "flow-settings.changed"],
      projectId: props.projectId,
      flowId: props.flow.flowId
    });
  }, [loadReadiness, props.flow?.flowId, props.projectId]);
  const closeLlmAuthorization = () => {
    if (llmAuthorizing) return;
    setLlmAuthorizationError("");
    setLlmAuthorizationMode(null);
  };
  const runFlow = async (mode: AutomationRuntimeUiRunMode, llmExecutionGrantId?: string) => {
    const explicitLlmMode = mode === "diagnosis_only" || mode === "diagnose_and_adapt";
    const runtimeMode: AutomationRuntimeRunMode = explicitLlmMode ? "manual_approval" : mode;
    setRunningMode(mode);
    setRunError("");
    const inputErrors = runtimeTypedInputErrors(props.flow, runtimeRunInputValues(inputText));
    if (inputErrors.length) { setRunError(inputErrors[0] ?? "Run inputs are invalid."); setRunningMode(null); return; }
    const payload = buildAutomationRuntimeRunPayload({ projectId: props.projectId, flowId: props.flow?.flowId, mode: runtimeMode, inputText, maxSteps });
    if (!payload.ok) { setRunError(payload.error); setRunningMode(null); return; }
    setLastMode(mode);
    if (explicitLlmMode) {
      const result = await props.commands.execute({
        ...payload.payload,
        ...(llmExecutionGrantId ? { runIntent: mode, llmExecutionGrantId } : {})
      });
      setRunningMode(null);
      const runId = result.payload?.runtimeSession?.runId;
      if (!result.ok || !result.payload?.runtimeSession || !runId) { setRunError("The authorized LLM run could not be completed."); return; }
      commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
      setLiveRunId(runId);
      setLastRun(result.payload);
      return;
    }
    const queued = await props.commands.start({ projectId: payload.payload.projectId, flowId: payload.payload.flowId, inputs: payload.payload.inputs });
    if (!queued.ok || !queued.payload?.runtimeSession?.runId) { setRunningMode(null); setRunError(queued.error ?? "Runtime session could not be queued."); return; }
    const runId = queued.payload.runtimeSession.runId;
    commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
    setActiveRunId(runId);
    setActiveRunStartedAt(Date.now());
    setLiveRunId(runId);
    const result = await props.commands.execute({ ...payload.payload, runId });
    setRunningMode(null);
    setActiveRunId(null);
    setActiveRunStartedAt(null);
    commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId });
    if (!result.ok || !result.payload?.runtimeSession) { setRunError(result.error ?? "Runtime session could not be completed."); return; }
    setLastRun(result.payload);
  };
  const requestRun = (mode: AutomationRuntimeUiRunMode) => {
    if (mode !== "diagnosis_only" && mode !== "diagnose_and_adapt") { void runFlow(mode); return; }
    const request = runtimeLlmExecutionRequestFromFlow(props.projectId, props.flow, mode);
    if (!request.ok) { setRunError(request.error); return; }
    setLlmAuthorizationError("");
    void authorizeLlm(mode, false);
  };
  const authorizeLlm = async (mode: AutomationRuntimeExplicitLlmRunMode, highTokenConfirmation = false) => {
    const request = runtimeLlmExecutionRequestFromFlow(props.projectId, props.flow, mode);
    if (!request.ok) { setLlmAuthorizationError(request.error); return; }
    setLlmAuthorizing(true);
    setLlmAuthorizationError("");
    try {
      const preflight = await props.commands.preflightLlm(request.payload);
      if (!preflight.ok) {
        const message = "LLM execution preflight was rejected. Review the saved Flow limits and key selection.";
        setLlmAuthorizationError(message);
        setRunError(message);
        return;
      }
      if (llmRequestRequiresHighTokenWarning(preflight.payload) && !highTokenConfirmation) { setLlmAuthorizationMode(mode); return; }
      const maxUses = mode === "diagnose_and_adapt" ? 2 : 1;
      const issued = await props.commands.issueLlmGrant({ ...request.payload, ...(highTokenConfirmation ? { highTokenConfirmation: true } : {}), maxUses });
      const grantId = issued.payload?.grant?.grantId;
      if (!issued.ok || !grantId) {
        const message = "LLM execution authorization failed. Verify your session and enabled key.";
        setLlmAuthorizationError(message);
        setRunError(message);
        return;
      }
      setLlmAuthorizationMode(null);
      setLlmAuthorizationError("");
      await runFlow(mode, grantId);
    } catch {
      const message = "LLM execution authorization could not be completed.";
      setLlmAuthorizationError(message);
      setRunError(message);
    } finally {
      setLlmAuthorizing(false);
    }
  };  const stopRun = async () => {
    if (!props.projectId || !activeRunId) return;
    const result = await props.commands.cancel({ projectId: props.projectId, runId: activeRunId });
    if (!result.ok) setRunError(result.error ?? "Run could not be stopped.");
    else commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId: activeRunId });
  };
  const studioRuntimeActions = {
    canPlay: Boolean(props.projectId && props.flow?.flowId && !runningMode && !activeRunId),
    canPause: false,
    canStop: Boolean(props.projectId && activeRunId),
    play: () => { requestRun(lastMode); },
    pause: () => undefined,
    stop: () => { void stopRun(); }
  };
  useEffect(() => registerAutomationStudioRuntimeActions(studioRuntimeActionId, studioRuntimeActions), [studioRuntimeActionId]);
  useEffect(() => updateAutomationStudioRuntimeActions(studioRuntimeActionId, studioRuntimeActions));
  return (
    <section className="automation-runtime-stage">
      <header className="automation-runtime-stage-header">
        <div>
          <span>Runtime Debug</span>
          <strong>{props.flow?.name ?? props.flow?.flowId ?? "Select a Flow"}</strong>
          <p>Start a controlled run, then inspect its actions, decisions, and state changes.</p>
        </div>
        <span>{props.runtimeSessions.length} {props.runtimeSessions.length === 1 ? "run" : "runs"}</span>
      </header>
      <BlankFlowAuthoringPanel commands={props.commands} flow={props.flow} projectId={props.projectId} readiness={readiness} {...(props.onOpenAdaptation ? { onOpenAdaptation: props.onOpenAdaptation } : {})} />
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
      {runError ? <p className="automation-runtime-message" role="alert">{runError}</p> : null}
      {lastRun ? <RuntimePostRunSummary result={lastRun} {...(props.onOpenAdaptation ? { onOpenAdaptation: props.onOpenAdaptation } : {})} /> : null}
      {llmAuthorizationMode ? <Modal busy={llmAuthorizing} closeOnEscape={!llmAuthorizing} title="Confirm high-token LLM Execution" onClose={closeLlmAuthorization}><div className="automation-modal-form"><p className="automation-router-modal-intro">This request can use more than 100,000 tokens. Review the configured limits before continuing.</p>{llmAuthorizationError ? <p className="automation-runtime-message" role="alert">{llmAuthorizationError}</p> : null}<div className="modal-actions"><button className="button" disabled={llmAuthorizing} onClick={closeLlmAuthorization} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={llmAuthorizing} onClick={() => void authorizeLlm(llmAuthorizationMode, true)} type="button">{llmAuthorizing ? "Starting..." : "Continue high-token execution"}</button></div></div></Modal> : null}
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
  if (mode === "diagnosis_only") return "Run one bounded DeepSeek diagnosis call; no patching, retry, promotion, or external side effects.";
  if (mode === "diagnose_and_adapt") return "Diagnose once, generate one bounded runtime patch, and queue any resulting adaptation for manual review; nothing is auto-applied.";
  if (mode === "manual_approval") return "Use LLM assistance, but keep generated adaptations queued for review.";
  if (mode === "no_llm_intervention") return "Run without LLM intervention or adaptation creation.";
  return "Use this Flow's adaptive policy and auto-apply safe validated adaptations.";
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
    { mode: "diagnose_and_adapt", label: "Diagnose and propose adaptation" }
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
          <span>Choose how this Flow should execute.</span>
        </div>
        {!props.readiness.loading && !props.readiness.error && !readinessIssues.length ? <span className="automation-runtime-ready"><CircleCheck size={15} aria-hidden />Ready</span> : null}
      </header>
      {warnings.length ? <div className="automation-runtime-message">{warnings.join(" ")}</div> : null}
      <div className="automation-runtime-run-command">
        <fieldset className="automation-runtime-mode-control">
          <legend>Execution mode</legend>
          <div>{runModes.map((mode) => <button aria-pressed={selectedMode === mode.mode} className={selectedMode === mode.mode ? "selected" : ""} disabled={Boolean(props.runningMode)} key={mode.mode} onClick={() => setSelectedMode(mode.mode)} type="button">{mode.label}</button>)}</div>
          <small>{runtimeModeDescription(selectedMode)}</small>
        </fieldset>
        <div className="automation-runtime-run-actions">
          <label><span>Step limit</span><input min={1} type="number" value={props.maxSteps} onChange={(event) => props.onMaxSteps(event.target.value)} /></label>
          <button className="button button-primary" disabled={props.disabled || props.readiness.loading || Boolean(props.readiness.error) || readinessIssues.length > 0 || inputErrors.length > 0 || !inputDocument.ok} onClick={() => props.onRun(selectedMode)} type="button">
            {props.runningMode === "diagnose_and_adapt" ? `${AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal}...` : props.runningMode ? "Running..." : "Run"}
          </button>
        </div>
      </div>
      {props.readiness.loading ? <div className="automation-runtime-readiness-check"><span aria-hidden className="automation-inline-spinner" /><span>Checking Flow readiness...</span></div> : props.readiness.error ? <div className="automation-runtime-readiness" role="alert"><AlertTriangle size={17} aria-hidden /><div><strong>Readiness check failed</strong><span>{props.readiness.error}</span></div><div><button className="button" onClick={props.onRetryReadiness} type="button">Retry</button></div></div> : readinessIssues.length ? <div className="automation-runtime-readiness" role="status"><AlertTriangle size={17} aria-hidden /><div><strong>Complete setup before running</strong>{readinessIssues.map((issue) => <span key={issue.label}>{issue.label}</span>)}</div><div>{readinessIssues.map((issue) => <button className="button" key={issue.target} onClick={() => props.onOpenTarget?.(issue.target)} type="button">{issue.action}</button>)}</div></div> : null}
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
      <details className="automation-runtime-advanced-inputs">
        <summary>Advanced JSON</summary>
        <label><span>Complete run input object</span><textarea aria-invalid={!inputDocument.ok} rows={8} spellCheck={false} value={props.inputText} onChange={(event) => props.onInputText(event.target.value)} />{!inputDocument.ok ? <small className="automation-field-error" role="alert">{inputDocument.error}</small> : <small>Changes here stay synchronized with the fields above.</small>}</label>
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

export function RuntimePostRunSummary(props: { result: any; onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void }) {
  const session = props.result.runtimeSession ?? {};
  const adaptationIds = Array.isArray(props.result.createdAdaptationIds) ? props.result.createdAdaptationIds : [];
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Last Run</strong><span>{session.runId ?? "-"}</span></header>
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
