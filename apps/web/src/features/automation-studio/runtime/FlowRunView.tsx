"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
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
  runtimeRunInputValues,
  runtimeTypedInputError,
  runtimeTypedInputErrors,
  updateRuntimeRunInputText,
  type AutomationRuntimeRunMode,
  type RuntimeReadinessIssue
} from "./run-input-model";
import { useRuntimeExecutionCommands, type RuntimeExecutionCommands } from "./runtime-host";
import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
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
  const [lastMode, setLastMode] = useState<AutomationRuntimeRunMode>("fully_adaptive");
  const [readiness, setReadiness] = useState<{ loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string }>({ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" });
  const readinessRequestGateRef = useRef<ReturnType<typeof createRuntimeReadinessRequestGate> | null>(null);
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
  const runFlow = async (mode: AutomationRuntimeRunMode) => {
    setRunningMode(mode);
    setRunError("");
    const inputErrors = runtimeTypedInputErrors(props.flow, runtimeRunInputValues(inputText));
    if (inputErrors.length) { setRunError(inputErrors[0] ?? "Run inputs are invalid."); setRunningMode(null); return; }
    const payload = buildAutomationRuntimeRunPayload({ projectId: props.projectId, flowId: props.flow?.flowId, mode, inputText, maxSteps });
    if (!payload.ok) { setRunError(payload.error); setRunningMode(null); return; }
    setLastMode(mode);
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
  const stopRun = async () => {
    if (!props.projectId || !activeRunId) return;
    const result = await props.commands.cancel({ projectId: props.projectId, runId: activeRunId });
    if (!result.ok) setRunError(result.error ?? "Run could not be stopped.");
    else commitRuntimeRunChanged({ projectId: props.projectId, flowId: props.flow?.flowId, runId: activeRunId });
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
        onRetryReadiness={() => void loadReadiness()}
        onOpenLiveLog={() => activeRunId && setLiveRunId(activeRunId)}
        {...(props.onOpenReadinessTarget ? { onOpenTarget: props.onOpenReadinessTarget } : {})}
      />
      {runError ? <p className="automation-runtime-message">{runError}</p> : null}
      {lastRun ? <RuntimePostRunSummary result={lastRun} {...(props.onOpenAdaptation ? { onOpenAdaptation: props.onOpenAdaptation } : {})} /> : null}
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

function runtimeModeDescription(mode: AutomationRuntimeRunMode): string {
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
  onRun(mode: AutomationRuntimeRunMode): void;
}) {
  const [selectedMode, setSelectedMode] = useState<AutomationRuntimeRunMode>("fully_adaptive");
  const runModes: Array<{ mode: AutomationRuntimeRunMode; label: string; detail: string }> = [
    { mode: "fully_adaptive", label: "Fully adaptive", detail: "Use the saved policy and auto-apply safe validated adaptations." },
    { mode: "manual_approval", label: "Manual approval", detail: "Allow LLM help but queue every adaptation for review." },
    { mode: "no_llm_intervention", label: "No LLM intervention", detail: "Run only saved deterministic behavior." }
  ];
  const warnings = [
    props.flow?.metadata?.trainingMode === "continuous_adaptive" ? "Continuous adaptive mode can create runtime adaptations." : "",
    props.flow?.metadata?.adaptationPolicySettings?.preset === "autonomous" ? "Autonomous policy can promote eligible validated adaptations." : ""
  ].filter(Boolean);
  const declaredInputs = runtimeFlowInputPorts(props.flow);
  const inputValues = runtimeRunInputValues(props.inputText);
  const inputErrors = runtimeTypedInputErrors(props.flow, inputValues);
  const inputDocument = parseRuntimeRunInputDocument(props.inputText);
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
      {props.readiness.loading ? <div className="automation-settings-inline-notice"><span aria-hidden className="automation-inline-spinner" /><span>Checking Flow readiness...</span></div> : props.readiness.error ? <div className="automation-runtime-readiness" role="alert"><AlertTriangle size={17} aria-hidden /><div><strong>Readiness check failed</strong><span>{props.readiness.error}</span></div><div><button className="button" onClick={props.onRetryReadiness} type="button">Retry</button></div></div> : readinessIssues.length ? <div className="automation-runtime-readiness" role="status"><AlertTriangle size={17} aria-hidden /><div><strong>Complete setup before running</strong>{readinessIssues.map((issue) => <span key={issue.label}>{issue.label}</span>)}</div><div>{readinessIssues.map((issue) => <button className="button" key={issue.target} onClick={() => props.onOpenTarget?.(issue.target)} type="button">{issue.action}</button>)}</div></div> : <div className="automation-settings-inline-notice"><CircleCheck size={17} aria-hidden /><span>Flow is ready to run.</span></div>}
      <div className="automation-runtime-run-command">
        <fieldset className="automation-runtime-mode-control">
          <legend>Run mode</legend>
          <div>{runModes.map((mode) => <button aria-pressed={selectedMode === mode.mode} className={selectedMode === mode.mode ? "selected" : ""} disabled={Boolean(props.runningMode)} key={mode.mode} onClick={() => setSelectedMode(mode.mode)} type="button"><strong>{mode.label}</strong><span>{mode.detail}</span></button>)}</div>
          <small>{runtimeModeDescription(selectedMode)}</small>
        </fieldset>
        <button className="button button-primary" disabled={props.disabled || props.readiness.loading || Boolean(props.readiness.error) || readinessIssues.length > 0 || inputErrors.length > 0 || !inputDocument.ok} onClick={() => props.onRun(selectedMode)} type="button">
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
  return <section className="automation-runs-workspace">
    <header><div><strong>History</strong><span>{section === "runs" ? "Flow execution history" : "Recording replay validation"}</span></div><div aria-label="Runtime history type" className="automation-runs-view-control" role="group"><button aria-pressed={section === "runs"} className={section === "runs" ? "button button-primary" : "button"} onClick={() => setSection("runs")} type="button">Runs</button><button aria-pressed={section === "replays"} className={section === "replays" ? "button button-primary" : "button"} onClick={() => setSection("replays")} type="button">Replays</button></div></header>
    {section === "runs" ? <RunHistory {...(props.flowId ? { flowId: props.flowId } : {})} {...(props.focusRunId ? { focusRunId: props.focusRunId } : {})} projectId={props.projectId} initialSessions={props.sessions} /> : <DataTable label="Replay validation history" columns={["Replay", "Status", "Recording", "Flow", "Matched", "Warnings"]} rows={replays.map((replay: any) => [replay.replayId, <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />, replay.recordingId, replay.policyId ?? replay.flowId ?? "-", `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`, replay.timingWarnings?.length ?? 0])} empty="No replay validations generated yet." />}
  </section>;
}

export function RuntimePostRunSummary(props: { result: any; onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void }) {
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
      <DataTable label="Run result summary" columns={["Field", "Value"]} rows={[
        ["Terminal reason", props.result.terminalReason ?? session.trace?.message ?? session.status ?? "-"],
        ["Run detail", props.result.runDetailLink?.runId ?? session.runId ?? "-"],
        ["Adaptations", props.result.createdAdaptationIds?.length ? props.result.createdAdaptationIds.map((adaptationId: string) => <button className="automation-runtime-row-action" key={adaptationId} onClick={() => props.onOpenAdaptation?.(props.result.runSummary?.flowId ?? session.flowId, adaptationId)} type="button">{adaptationId}</button>) : "-"]
      ]} empty="No run result." />
    </section>
  );
}
