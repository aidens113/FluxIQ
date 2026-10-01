"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionRun, ProductionRunnerSnapshotResponse } from "fluxiq/production-runner";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Panel, Segmented, StatusBadge, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { digits, flattenRunLogs, formatTime, type ProductionLogRow } from "./shared";
import { useOperationLock } from "../use-operation-lock";


export function ProductionRunnerLive() {
  const api = useProgramApi("production-runner");
  const [snapshot, setSnapshot] = useState<ApiResponse<ProductionRunnerSnapshotResponse> | null>(null);
  const [targetType, setTargetType] = useState("task");
  const [targetId, setTargetId] = useState("");
  const [loops, setLoops] = useState("1");
  const [waitMs, setWaitMs] = useState("0");
  const [initialDelayMs, setInitialDelayMs] = useState("0");
  const [parameterDraft, setParameterDraft] = useState<{ targetKey: string; values: Record<string, string> }>({ targetKey: "", values: {} });
  const [launchError, setLaunchError] = useState("");
  const [runOperations, setRunOperations] = useState<Record<string, { busy: boolean; error: string }>>({});
  const pendingRuns = useRef(new Set<string>());
  const mounted = useRef(false);
  const refreshGeneration = useRef(0);
  const launch = useOperationLock();
  const [selectedRunId, setSelectedRunId] = useState("");
  const [consoleView, setConsoleView] = useState<"workloads" | "logs">("workloads");
  const [logFilter, setLogFilter] = useState("all");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = ++refreshGeneration.current;
    const result = await api.get<ProductionRunnerSnapshotResponse>("snapshot", signal ? { signal } : {});
    if (mounted.current && generation === refreshGeneration.current && !result.aborted) setSnapshot(result);
  }, [api]);
  useEffect(() => { mounted.current = true; const controller = new AbortController(); void refresh(controller.signal); return () => { mounted.current = false; ++refreshGeneration.current; controller.abort(); }; }, [refresh]);

  const targets = snapshot?.payload?.targets ?? [];
  const runs = snapshot?.payload?.runs ?? [];
  const targetOptions = targets.filter((target) => target.type === targetType);
  const selectedTarget = targetOptions.find((target) => target.id === targetId) ?? targetOptions[0];
  const targetKey = selectedTarget ? JSON.stringify([selectedTarget.type, selectedTarget.id]) : "";
  const parameterValues = parameterDraft.targetKey === targetKey ? parameterDraft.values : {};
  useEffect(() => {
    setParameterDraft((draft) => draft.targetKey === targetKey ? draft : { targetKey, values: {} });
  }, [targetKey]);
  const setParameterValues = (values: Record<string, string>) => setParameterDraft({ targetKey, values });
  const activeRuns = runs.filter((run) => ["running", "scheduled", "starting"].includes(run.status));
  const allLogRows = newestProductionLogRows(runs, logFilter);
  const logRows = allLogRows.slice(0, 500);
  const selectedRun = runs.find((run) => run.id === selectedRunId);

  async function startRun() {
    if (!selectedTarget) return;
    await launch.run("start", async () => {
      setLaunchError("");
      try {
        const result = await api.post("start", {
          name: selectedTarget.name,
          targetType: selectedTarget.type,
          targetId: selectedTarget.id,
          loopsTotal: Number(loops) || 1,
          waitMs: Number(waitMs) || 0,
          initialDelayMs: Number(initialDelayMs) || 0,
          metadata: buildProductionParameters(selectedTarget.metadata?.parameterSchema, parameterValues)
        });
        if (!mounted.current) return;
        setStatus(result.ok ? `Run started for ${selectedTarget.name}` : result.error ?? "Run failed");
        if (!result.ok) { setLaunchError(result.error ?? "Run failed. Try again."); return; }
        await refresh();
      } catch {
        if (mounted.current) setLaunchError("The workload could not be started. Try again.");
      }
    });
  }

  async function changeRun(action: "advance" | "cancel", runId: string) {
    if (pendingRuns.current.has(runId)) return;
    pendingRuns.current.add(runId);
    setRunOperations((current) => ({ ...current, [runId]: { busy: true, error: "" } }));
    try {
      const result = await api.post(action, { runId });
      if (!mounted.current) return;
      if (!result.ok) {
        setRunOperations((current) => ({ ...current, [runId]: { busy: false, error: result.error ?? "The workload action was refused. Try again." } }));
        return;
      }
      await refresh();
    } catch {
      if (mounted.current) setRunOperations((current) => ({ ...current, [runId]: { busy: false, error: "The workload could not be updated. Try again." } }));
    } finally {
      pendingRuns.current.delete(runId);
      if (mounted.current) setRunOperations((current) => ({ ...current, [runId]: { busy: false, error: current[runId]?.error ?? "" } }));
    }
  }

  if (!snapshot) return <LoadingState label="Loading Production Runner" detail="Reading targets, active workloads, and recent execution summaries." />;
  if (!snapshot.ok) return <EmptyState title="Production Runner unavailable" description={snapshot.error ?? "Production state could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="program-workspace-grid">
      <Panel title="Launch Workload" action={<button aria-busy={launch.busy} className="button button-primary" disabled={!selectedTarget || launch.busy} onClick={startRun} type="button">Run {targetType}</button>}>
        {launchError ? <VisualAlert tone="error" title="Workload not started" message={launchError} /> : null}
        {!targets.length ? <EmptyState compact title="No production targets" description="Register a routine, task, or interface target before launching a workload." /> : null}
        <Segmented value={targetType} onChange={setTargetType} options={["routine", "task", "interface"]} />
        <div className="field-row dense-fields">
          <Field label="Target"><select value={selectedTarget?.id ?? ""} onChange={(event) => { setTargetId(event.target.value); setParameterValues({}); }}>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <Field label="Loops"><input inputMode="numeric" value={loops} onChange={(event) => setLoops(digits(event.target.value))} /></Field>
          <Field label="Loop delay ms"><input inputMode="numeric" value={waitMs} onChange={(event) => setWaitMs(digits(event.target.value))} /></Field>
          <Field label="Start delay ms"><input inputMode="numeric" value={initialDelayMs} onChange={(event) => setInitialDelayMs(digits(event.target.value))} /></Field>
        </div>
        <ProductionParameterFields schema={selectedTarget?.metadata?.parameterSchema} values={parameterValues} onChange={setParameterValues} />
      </Panel>
      <Panel title="Console" action={<div className="inline-actions"><button className={consoleView === "workloads" ? "button button-primary" : "button"} onClick={() => setConsoleView("workloads")} type="button">Workloads</button><button className={consoleView === "logs" ? "button button-primary" : "button"} onClick={() => setConsoleView("logs")} type="button">Logs</button><button className="button" onClick={() => void refresh()} type="button">Refresh</button></div>}>
        <SummaryStrip items={[["Active", activeRuns.length], ["Runs", runs.length], ["Targets", targets.length], ["Failures", runs.filter((run) => run.status === "failed").length]]} />
        {consoleView === "workloads" ? <WorkloadBoard runs={activeRuns} operations={runOperations} onSelect={setSelectedRunId} onAdvance={(runId) => changeRun("advance", runId)} onCancel={(runId) => changeRun("cancel", runId)} /> : <>
          <div className="field-row dense-fields"><Field label="Log filter"><select value={logFilter} onChange={(event) => setLogFilter(event.target.value)}><option value="all">All</option><option value="task">Tasks</option><option value="routine">Routines</option><option value="interface">Interfaces</option><option value="failed">Failed</option><option value="success">Success</option></select></Field></div>
          {allLogRows.length > logRows.length ? <VisualAlert tone="warning" title="Log view limited" message={"Showing the newest 500 of " + allLogRows.length + " matching execution entries."} /> : null}
          <DataTable label="Production execution logs" columns={["Time", "Target", "Loop", "Status", "Message"]} rowKeys={logRows.map((entry) => entry.id)} rows={logRows.map((entry) => [formatTime(entry.atMs), entry.target, entry.loop, entry.status, entry.message])} empty="No execution logs yet." />
        </>}
        {selectedRun ? <section className="production-run-detail"><div className="panel-heading"><h3 className="panel-title">Selected Run</h3><StatusBadge value={selectedRun.status} /></div><KeyValue rows={[["Run ID", selectedRun.id], ["Target", selectedRun.name], ["Type", selectedRun.targetType ?? "task"], ["Progress", String(selectedRun.loopsCompleted ?? 0) + "/" + String(selectedRun.loopsTotal ?? 1)], ["Started", formatTime(selectedRun.startedAtMs)], ["Updated", formatTime(selectedRun.updatedAtMs)]]} /></section> : null}
        <StatusText value={status} />
      </Panel>
      <Panel title="Targets">
        <DataTable label="Production targets" columns={["Target", "Type", "Domain", "Description"]} rows={targets.map((target) => [target.name, target.type, target.domainId ?? "global", target.description ?? "-"])} empty="No production targets are registered." />
      </Panel>
    </section>
  );
}

function WorkloadBoard(props: { runs: ProductionRun[]; operations: Record<string, { busy: boolean; error: string }>; onSelect(runId: string): void; onAdvance(runId: string): Promise<unknown>; onCancel(runId: string): Promise<unknown> }) {
  if (!props.runs.length) return <div className="production-empty-state"><strong>No active workloads</strong><span>Launch a routine, task, or interface to populate the operations table.</span></div>;
  const groups = ["routine", "task", "interface"];
  return <div className="workload-board">
    <div className="workload-board-header"><span>Runtime</span>{groups.map((group) => <span key={group}>{group}s</span>)}</div>
    <div className="workload-board-row">
      <div className="workload-runtime"><strong>Framework runtime</strong><small>Local execution</small></div>
      {groups.map((group) => <div className="workload-cell" key={group}>
        {props.runs.filter((run) => (run.targetType ?? "task") === group).map((run) => {
          const operation = props.operations[run.id];
          return <article className="workload-chip" key={run.id}>
            <header><strong>{run.name}</strong><StatusBadge value={run.status} /></header>
            <div className="progress-track"><span style={{ width: `${Math.round(((run.loopsCompleted ?? 0) / Math.max(1, run.loopsTotal ?? 1)) * 100)}%` }} /></div>
            <footer><span>{run.loopsCompleted ?? 0}/{run.loopsTotal ?? 1}</span><span>{formatTime(run.nextRunAtMs)}</span></footer>
            <div className="inline-actions">
              <button className="button" onClick={() => props.onSelect(run.id)} type="button">Details</button>
              <button aria-busy={operation?.busy ?? false} className="button" disabled={operation?.busy ?? false} onClick={() => void props.onAdvance(run.id)} type="button">Advance</button>
              <button aria-busy={operation?.busy ?? false} className="button" disabled={operation?.busy ?? false} onClick={() => void props.onCancel(run.id)} type="button">Cancel</button>
            </div>
            {operation?.error ? <p role="alert">{operation.error}</p> : null}
          </article>;
        })}
      </div>)}
    </div>
  </div>;
}

function ProductionParameterFields(props: { schema: unknown; values: Record<string, string>; onChange(value: Record<string, string>): void }) {
  const fields = productionParameterFields(props.schema);
  if (!fields.length) return null;
  return <div className="production-parameter-grid">{fields.map((field) => <Field key={field.name} label={field.label}>{field.type === "boolean" ? <select value={props.values[field.name] ?? String(field.defaultValue ?? false)} onChange={(event) => props.onChange({ ...props.values, [field.name]: event.target.value })}><option value="false">No</option><option value="true">Yes</option></select> : <input inputMode={field.type === "number" ? "decimal" : undefined} value={props.values[field.name] ?? String(field.defaultValue ?? "")} onChange={(event) => props.onChange({ ...props.values, [field.name]: event.target.value })} />}</Field>)}</div>;
}

export function newestProductionLogRows(runs: ProductionRun[], filter = "all"): ProductionLogRow[] {
  return flattenRunLogs(runs)
    .filter((entry) => filter === "all" || entry.status === filter || entry.type === filter)
    .sort((left, right) => right.atMs - left.atMs || right.id.localeCompare(left.id));
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
