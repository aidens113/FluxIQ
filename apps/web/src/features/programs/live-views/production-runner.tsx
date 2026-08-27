"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductionRun, ProductionRunnerSnapshotResponse } from "fluxiq/production-runner";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Panel, Segmented, StatusBadge, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { digits, flattenRunLogs, formatTime } from "./shared";


export function ProductionRunnerLive() {
  const api = useProgramApi("production-runner");
  const [snapshot, setSnapshot] = useState<ApiResponse<ProductionRunnerSnapshotResponse> | null>(null);
  const [targetType, setTargetType] = useState("task");
  const [targetId, setTargetId] = useState("");
  const [loops, setLoops] = useState("1");
  const [waitMs, setWaitMs] = useState("0");
  const [initialDelayMs, setInitialDelayMs] = useState("0");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [selectedRunId, setSelectedRunId] = useState("");
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
  const allLogRows = flattenRunLogs(runs).filter((entry) => logFilter === "all" || entry.status === logFilter || entry.type === logFilter);
  const logRows = allLogRows.slice(0, 500);
  const selectedRun = runs.find((run) => run.id === selectedRunId);

  async function startRun() {
    const result = await api.post("start", {
      name: selectedTarget?.name ?? "Manual Run",
      targetType: selectedTarget?.type ?? targetType,
      targetId: selectedTarget?.id,
      loopsTotal: Number(loops) || 1,
      waitMs: Number(waitMs) || 0,
      initialDelayMs: Number(initialDelayMs) || 0,
      metadata: buildProductionParameters(selectedTarget?.metadata?.parameterSchema, parameterValues)
    });
    setStatus(result.ok ? "Run started" : result.error ?? "Run failed");
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Launch Workload" action={<button className="button button-primary" disabled={!selectedTarget} onClick={startRun} type="button">Run {targetType}</button>}>
        <Segmented value={targetType} onChange={setTargetType} options={["routine", "task", "interface"]} />
        <div className="field-row dense-fields">
          <Field label="Target"><select value={selectedTarget?.id ?? ""} onChange={(event) => { setTargetId(event.target.value); setParameterValues({}); }}>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <Field label="Loops"><input inputMode="numeric" value={loops} onChange={(event) => setLoops(digits(event.target.value))} /></Field>
          <Field label="Loop delay ms"><input inputMode="numeric" value={waitMs} onChange={(event) => setWaitMs(digits(event.target.value))} /></Field>
          <Field label="Start delay ms"><input inputMode="numeric" value={initialDelayMs} onChange={(event) => setInitialDelayMs(digits(event.target.value))} /></Field>
        </div>
        <ProductionParameterFields schema={selectedTarget?.metadata?.parameterSchema} values={parameterValues} onChange={setParameterValues} />
      </Panel>
      <Panel title="Console" action={<div className="inline-actions"><button className={consoleView === "workloads" ? "button button-primary" : "button"} onClick={() => setConsoleView("workloads")} type="button">Workloads</button><button className={consoleView === "logs" ? "button button-primary" : "button"} onClick={() => setConsoleView("logs")} type="button">Logs</button><button className="button" onClick={refresh} type="button">Refresh</button></div>}>
        <SummaryStrip items={[["Active", activeRuns.length], ["Runs", runs.length], ["Targets", targets.length], ["Failures", runs.filter((run) => run.status === "failed").length]]} />
        {consoleView === "workloads" ? <WorkloadBoard runs={activeRuns} onSelect={setSelectedRunId} onAdvance={(runId) => api.post("advance", { runId }).then(refresh)} onCancel={(runId) => api.post("cancel", { runId }).then(refresh)} /> : <>
          <div className="field-row dense-fields"><Field label="Log filter"><select value={logFilter} onChange={(event) => setLogFilter(event.target.value)}><option value="all">All</option><option value="task">Tasks</option><option value="routine">Routines</option><option value="interface">Interfaces</option><option value="failed">Failed</option><option value="success">Success</option></select></Field></div>
          {allLogRows.length > logRows.length ? <VisualAlert tone="warning" title="Log view limited" message={"Showing the newest 500 of " + allLogRows.length + " matching execution entries."} /> : null}
          <DataTable columns={["Time", "Target", "Loop", "Status", "Message"]} rows={logRows.map((entry) => [formatTime(entry.atMs), entry.target, entry.loop, entry.status, entry.message])} empty="No execution logs yet." />
        </>}
        {selectedRun ? <section className="production-run-detail"><div className="panel-heading"><h3 className="panel-title">Selected Run</h3><StatusBadge value={selectedRun.status} /></div><KeyValue rows={[["Run ID", selectedRun.id], ["Target", selectedRun.name], ["Type", selectedRun.targetType ?? "task"], ["Progress", String(selectedRun.loopsCompleted ?? 0) + "/" + String(selectedRun.loopsTotal ?? 1)], ["Started", formatTime(selectedRun.startedAtMs)], ["Updated", formatTime(selectedRun.updatedAtMs)]]} /></section> : null}
        <StatusText value={status} />
      </Panel>
      <Panel title="Targets">
        <DataTable columns={["Target", "Type", "Domain", "Description"]} rows={targets.map((target) => [target.name, target.type, target.domainId ?? "global", target.description ?? "-"])} />
      </Panel>
    </section>
  );
}

function WorkloadBoard(props: { runs: ProductionRun[]; onSelect(runId: string): void; onAdvance(runId: string): Promise<unknown>; onCancel(runId: string): Promise<unknown> }) {
  if (!props.runs.length) return <div className="production-empty-state"><strong>No active workloads</strong><span>Launch a routine, task, or interface to populate the operations table.</span></div>;
  const groups = ["routine", "task", "interface"];
  return <div className="workload-board"><div className="workload-board-header"><span>Runtime</span>{groups.map((group) => <span key={group}>{group}s</span>)}</div><div className="workload-board-row"><div className="workload-runtime"><strong>Framework runtime</strong><small>Local execution</small></div>{groups.map((group) => <div className="workload-cell" key={group}>{props.runs.filter((run) => (run.targetType ?? "task") === group).map((run) => <article className="workload-chip" key={run.id}><header><strong>{run.name}</strong><StatusBadge value={run.status} /></header><div className="progress-track"><span style={{ width: `${Math.round(((run.loopsCompleted ?? 0) / Math.max(1, run.loopsTotal ?? 1)) * 100)}%` }} /></div><footer><span>{run.loopsCompleted ?? 0}/{run.loopsTotal ?? 1}</span><span>{formatTime(run.nextRunAtMs)}</span></footer><div className="inline-actions"><button className="button" onClick={() => props.onSelect(run.id)} type="button">Details</button><button className="button" onClick={() => void props.onAdvance(run.id)} type="button">Advance</button><button className="button" onClick={() => void props.onCancel(run.id)} type="button">Cancel</button></div></article>)}</div>)}</div></div>;
}

function ProductionParameterFields(props: { schema: unknown; values: Record<string, string>; onChange(value: Record<string, string>): void }) {
  const fields = productionParameterFields(props.schema);
  if (!fields.length) return null;
  return <div className="production-parameter-grid">{fields.map((field) => <Field key={field.name} label={field.label}>{field.type === "boolean" ? <select value={props.values[field.name] ?? String(field.defaultValue ?? false)} onChange={(event) => props.onChange({ ...props.values, [field.name]: event.target.value })}><option value="false">No</option><option value="true">Yes</option></select> : <input inputMode={field.type === "number" ? "decimal" : undefined} value={props.values[field.name] ?? String(field.defaultValue ?? "")} onChange={(event) => props.onChange({ ...props.values, [field.name]: event.target.value })} />}</Field>)}</div>;
}

export function productionParameterFields(schema: unknown): Array<{ name: string; label: string; type: string; defaultValue?: unknown }> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const properties = (schema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).slice(0, 30).map(([name, value]) => { const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; return { name, label: String(item.title ?? name), type: String(item.type ?? "string"), ...("default" in item ? { defaultValue: item.default } : {}) }; });
}

function buildProductionParameters(schema: unknown, values: Record<string, string>): JsonObject {
  const result: JsonObject = {};
  for (const field of productionParameterFields(schema)) { const raw = values[field.name] ?? String(field.defaultValue ?? ""); result[field.name] = field.type === "number" || field.type === "integer" ? Number(raw) : field.type === "boolean" ? raw === "true" : raw; }
  return result;
}
