"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { ProductionRun, ProductionRunnerSnapshotResponse } from "fluxiq/production-runner";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";


export function ProductionRunnerLive() {
  const api = useProgramApi("production-runner");
  const [snapshot, setSnapshot] = useState<ApiResponse<ProductionRunnerSnapshotResponse> | null>(null);
  const [targetType, setTargetType] = useState("task");
  const [targetId, setTargetId] = useState("");
  const [loops, setLoops] = useState("1");
  const [waitMs, setWaitMs] = useState("0");
  const [initialDelayMs, setInitialDelayMs] = useState("0");
  const [parametersText, setParametersText] = useState("{}");
  const [showParameters, setShowParameters] = useState(false);
  const [consoleView, setConsoleView] = useState<"workloads" | "logs">("workloads");
  const [logFilter, setLogFilter] = useState("all");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get<ProductionRunnerSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const targets = snapshot?.payload?.targets ?? [];
  const runs = snapshot?.payload?.runs ?? [];
  const targetOptions = targets.filter((target) => target.type === targetType);
  const selectedTarget = targetOptions.find((target) => target.id === targetId) ?? targetOptions[0];
  const activeRuns = runs.filter((run) => ["running", "scheduled", "starting"].includes(run.status));
  const logRows = flattenRunLogs(runs).filter((entry) => logFilter === "all" || entry.status === logFilter || entry.type === logFilter);

  async function startRun() {
    const params = parseJsonObject(parametersText);
    if (!params.ok) { setStatus(params.error); return; }
    const result = await api.post("start", {
      name: selectedTarget?.name ?? "Manual Run",
      targetType: selectedTarget?.type ?? targetType,
      targetId: selectedTarget?.id,
      loopsTotal: Number(loops) || 1,
      waitMs: Number(waitMs) || 0,
      initialDelayMs: Number(initialDelayMs) || 0,
      metadata: params.value
    });
    setStatus(result.ok ? "Run started" : result.error ?? "Run failed");
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Launch Workload" action={<button className="button button-primary" disabled={!selectedTarget} onClick={startRun} type="button">Run {targetType}</button>}>
        <Segmented value={targetType} onChange={setTargetType} options={["routine", "task", "interface"]} />
        <div className="field-row dense-fields">
          <Field label="Target"><select value={selectedTarget?.id ?? ""} onChange={(event) => setTargetId(event.target.value)}>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <Field label="Loops"><input inputMode="numeric" value={loops} onChange={(event) => setLoops(digits(event.target.value))} /></Field>
          <Field label="Loop delay ms"><input inputMode="numeric" value={waitMs} onChange={(event) => setWaitMs(digits(event.target.value))} /></Field>
          <Field label="Start delay ms"><input inputMode="numeric" value={initialDelayMs} onChange={(event) => setInitialDelayMs(digits(event.target.value))} /></Field>
          <button className="button" onClick={() => setShowParameters((value) => !value)} type="button">{showParameters ? "Hide parameters" : "Parameters"}</button>
        </div>
        {showParameters ? <Field label="Parameters JSON"><textarea className="json-editor compact" value={parametersText} onChange={(event) => setParametersText(event.target.value)} spellCheck={false} /></Field> : null}
      </Panel>
      <Panel title="Console" action={<div className="inline-actions"><button className={consoleView === "workloads" ? "button button-primary" : "button"} onClick={() => setConsoleView("workloads")} type="button">Workloads</button><button className={consoleView === "logs" ? "button button-primary" : "button"} onClick={() => setConsoleView("logs")} type="button">Logs</button><button className="button" onClick={refresh} type="button">Refresh</button></div>}>
        <SummaryStrip items={[["Active", activeRuns.length], ["Runs", runs.length], ["Targets", targets.length], ["Failures", runs.filter((run) => run.status === "failed").length]]} />
        {consoleView === "workloads" ? <WorkloadBoard runs={activeRuns} onAdvance={(runId) => api.post("advance", { runId }).then(refresh)} onCancel={(runId) => api.post("cancel", { runId }).then(refresh)} /> : <>
          <div className="field-row dense-fields"><Field label="Log filter"><select value={logFilter} onChange={(event) => setLogFilter(event.target.value)}><option value="all">All</option><option value="task">Tasks</option><option value="routine">Routines</option><option value="interface">Interfaces</option><option value="failed">Failed</option><option value="success">Success</option></select></Field></div>
          <DataTable columns={["Time", "Target", "Loop", "Status", "Message"]} rows={logRows.map((entry) => [formatTime(entry.atMs), entry.target, entry.loop, entry.status, entry.message])} empty="No execution logs yet." />
        </>}
        <StatusText value={status} />
      </Panel>
      <Panel title="Targets">
        <DataTable columns={["Target", "Type", "Domain", "Description"]} rows={targets.map((target) => [target.name, target.type, target.domainId ?? "global", target.description ?? "-"])} />
      </Panel>
    </section>
  );
}

function WorkloadBoard(props: { runs: ProductionRun[]; onAdvance(runId: string): Promise<unknown>; onCancel(runId: string): Promise<unknown> }) {
  if (!props.runs.length) return <div className="production-empty-state"><strong>No active workloads</strong><span>Launch a routine, task, or interface to populate the operations table.</span></div>;
  const groups = ["routine", "task", "interface"];
  return <div className="workload-board"><div className="workload-board-header"><span>Runtime</span>{groups.map((group) => <span key={group}>{group}s</span>)}</div><div className="workload-board-row"><div className="workload-runtime"><strong>Framework runtime</strong><small>Local execution</small></div>{groups.map((group) => <div className="workload-cell" key={group}>{props.runs.filter((run) => (run.targetType ?? "task") === group).map((run) => <article className="workload-chip" key={run.id}><header><strong>{run.name}</strong><StatusBadge value={run.status} /></header><div className="progress-track"><span style={{ width: `${Math.round(((run.loopsCompleted ?? 0) / Math.max(1, run.loopsTotal ?? 1)) * 100)}%` }} /></div><footer><span>{run.loopsCompleted ?? 0}/{run.loopsTotal ?? 1}</span><span>{formatTime(run.nextRunAtMs)}</span></footer><div className="inline-actions"><button className="button" onClick={() => void props.onAdvance(run.id)} type="button">Advance</button><button className="button" onClick={() => void props.onCancel(run.id)} type="button">Cancel</button></div></article>)}</div>)}</div></div>;
}

