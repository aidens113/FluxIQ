"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button, DataTable, Modal, Segmented } from "../../programs/shared-ui";
import type { AutomationStudioCacheStats } from "../cache/data-cache";
import { useAutomationStudioDevelopmentSnapshot } from "./telemetry";

type ServerMetric = {
  kind: "sql" | "endpoint";
  recordedAt: number;
  elapsedMs: number;
  ok: boolean;
  repositoryKind?: string;
  databaseName?: string;
  operation?: string;
  statementType?: string;
  fingerprint?: string;
  rowsReturned?: number;
  rowsChanged?: number;
  possibleFullScan?: boolean;
  programId?: string;
  endpoint?: string;
  responseBytes?: number;
  sqlDurationMs?: number;
  sqlQueryCount?: number;
  sqlRowsReturned?: number;
  possibleFullScanCount?: number;
};

type PreloadMetric = {
  phase: "queued" | "task-started" | "task-finished" | "cancelled" | "drained";
  projectId: string;
  generation: number;
  endpoint?: string;
  taskId?: string;
  queuedTasks?: number;
  completedTasks?: number;
  aborted?: boolean;
  ok?: boolean;
  elapsedMs?: number;
};

type RecordedPreloadMetric = PreloadMetric & { recordedAt: number };

type PreloadSummary = {
  status: string;
  projectId: string;
  generation: string;
  queuedTasks: number;
  completedTasks: number;
  inFlightTasks: number;
  failedTasks: number;
  latestEvent: string;
  latestEndpoint: string;
};

type InspectorApi = {
  get<T>(endpoint: string): Promise<{ ok: boolean; payload?: T; error?: string }>;
  post<T>(endpoint: string, payload: Record<string, unknown>): Promise<{ ok: boolean; payload?: T; error?: string }>;
};

const MAX_PRELOAD_METRICS = 120;

type InspectorProps = {
  api: InspectorApi;
  activeProjectId?: string | null;
  cacheStats(): AutomationStudioCacheStats;
  onClose(): void;
};

export function AutomationStudioDataInspector(props: InspectorProps) {
  const projectId = props.activeProjectId ?? null;
  const identity = useRef({ api: props.api, projectId, generation: 0 });
  if (identity.current.api !== props.api || identity.current.projectId !== projectId) identity.current = { api: props.api, projectId, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const ownerCurrent = useCallback(() => identity.current.generation === generation, [generation]);
  return <InspectorWorkspace key={generation} {...props} ownerCurrent={ownerCurrent} />;
}

function InspectorWorkspace(props: InspectorProps & { ownerCurrent(): boolean }) {
  const client = useAutomationStudioDevelopmentSnapshot();
  const preloadMetrics = useAutomationStudioPreloadMetrics();
  const [view, setView] = useState("Overview");
  const [server, setServer] = useState({ metrics: [] as ServerMetric[], confirmed: false, pending: true, error: "" });
  const serverRef = useRef(server); serverRef.current = server;
  const [pendingOperation, setPendingOperation] = useState<"read" | "clear" | null>(null);
  const [clearFeedback, setClearFeedback] = useState({ text: "", uncertain: false });
  const operation = useRef({ epoch: 0, kind: null as "read" | "clear" | null });
  const mounted = useRef(false);
  const latest = useRef(props); latest.current = props;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; ++operation.current.epoch; }; }, []);
  const current = () => mounted.current && props.ownerCurrent();
  function begin(kind: "read" | "clear") {
    if (!current() || operation.current.kind) return null;
    operation.current = { epoch: operation.current.epoch + 1, kind };
    setPendingOperation(kind); return operation.current.epoch;
  }
  function finish(epoch: number) {
    if (!current() || operation.current.epoch !== epoch) return false;
    operation.current.kind = null; setPendingOperation(null); return true;
  }
  const clearUiCache = useCallback(async () => {
    if (!props.activeProjectId || serverRef.current.pending) return;
    const epoch = begin("clear"); if (epoch === null) return;
    const valid = () => current() && operation.current.epoch === epoch;
    setClearFeedback({ text: "UI cache clear request is pending.", uncertain: false });
    try {
      const result = await props.api.post("delete-project-ui-cache", { projectId: props.activeProjectId });
      if (valid()) setClearFeedback(result?.ok === true ? { text: "UI cache clear was acknowledged.", uncertain: false } : { text: "UI cache clear was not confirmed. It may have completed.", uncertain: true });
    } catch { if (valid()) setClearFeedback({ text: "UI cache clear was not confirmed. It may have completed.", uncertain: true }); }
    finally { finish(epoch); }
  }, [props.api, props.activeProjectId, props.ownerCurrent]);
  const refresh = useCallback(async () => {
    const epoch = begin("read"); if (epoch === null) return;
    const valid = () => current() && operation.current.epoch === epoch;
    setServer((value) => ({ ...value, pending: true, error: "" }));
    try {
      const result = await props.api.get<{ metrics?: ServerMetric[] }>("get-performance-metrics");
      if (!valid()) return;
      const metrics = result?.ok === true ? readMetrics(result.payload) : null;
      if (metrics === null) { setServer((value) => ({ ...value, error: "Server metrics could not be loaded. Refresh server to try again." })); return; }
      setServer({ metrics, confirmed: true, pending: true, error: "" });
    } catch { if (valid()) setServer((value) => ({ ...value, error: "Server metrics could not be loaded. Refresh server to try again." })); }
    finally { if (finish(epoch)) setServer((value) => ({ ...value, pending: false })); }
  }, [props.api, props.ownerCurrent]);
  useEffect(() => { void refresh(); }, [refresh]);

  const serverMetrics = server.metrics;
  const loading = server.pending || pendingOperation !== null;
  const lastConfirmed = server.confirmed && (server.pending || Boolean(server.error));
  const endpointEmpty = !server.confirmed ? "Server metrics are not confirmed." : lastConfirmed ? "No endpoint samples in the last confirmed read." : "No endpoint samples.";
  const sqlEmpty = !server.confirmed ? "Server metrics are not confirmed." : lastConfirmed ? "No SQL samples in the last confirmed read." : "No SQL samples.";

  const endpointMetrics = useMemo(() => serverMetrics.filter((metric) => metric.kind === "endpoint").slice(-100).reverse(), [serverMetrics]);
  const sqlMetrics = useMemo(() => serverMetrics.filter((metric) => metric.kind === "sql").slice(-100).reverse(), [serverMetrics]);
  const preloadSummary = useMemo(() => summarizePreloadMetrics(preloadMetrics), [preloadMetrics]);
  const recentPreloadMetrics = useMemo(() => preloadMetrics.slice(-80).reverse(), [preloadMetrics]);
  const cache = client.cache.entryCount || client.cache.estimatedBytes ? client.cache : props.cacheStats();
  const latestRender = client.renderMetrics.at(-1);
  const recentLongTasks = client.longTasks.slice(-20).reverse();

  return <Modal className="automation-data-inspector" description="Live development telemetry for bounded data loading and browser work." onClose={() => { if (current()) latest.current.onClose(); }} title="Data Flow Inspector">
    <div className="automation-data-inspector-toolbar">
      <Segmented label="Inspector view" onChange={setView} options={["Overview", "Requests", "SQL", "Browser", "Preload"]} value={view} />
      <Button busy={loading} onClick={() => void refresh()} size="compact"><RefreshCw size={14} aria-hidden />Refresh server</Button>
      {props.activeProjectId ? <Button busy={loading} onClick={() => void clearUiCache()} size="compact"><Trash2 size={14} aria-hidden />Clear UI cache</Button> : null}
    </div>
    {server.pending ? <p role="status">Loading server metrics...</p> : null}
    {server.error ? <div className="automation-data-inspector-error" role="alert">{server.error}</div> : null}
    {lastConfirmed ? <p role="status">Showing the last confirmed server samples; they may be stale.</p> : null}
    {clearFeedback.text ? <p className={clearFeedback.uncertain ? "automation-data-inspector-error" : undefined} role={clearFeedback.uncertain ? "alert" : "status"}>{clearFeedback.text}</p> : null}
    <div className="automation-data-inspector-body">
      {view === "Overview" ? <>
        <div className="automation-data-inspector-summary">
          <Metric label="Active requests" value={String(client.activeRequests.length)} />
          <Metric label="Client responses" value={String(client.apiMetrics.length)} />
          <Metric label="SQL samples" value={server.confirmed ? String(sqlMetrics.length) : server.pending ? "Loading" : "Unavailable"} />
          <Metric label="Cache" value={formatBytes(cache.estimatedBytes)} />
          <Metric label="Mounted graph" value={client.graph ? `${client.graph.nodesMounted} nodes / ${client.graph.edgesMounted} edges` : "None"} />
          <Metric label="Long tasks" value={String(client.longTasks.length)} />
          <Metric label="Preload queue" value={preloadSummary.status} />
        </div>
        <InspectorSection title="Live ownership">
          <DataTable label="Studio live ownership" columns={["Resource", "Current state"]} compact rows={[
            ["Subscriptions", client.subscriptions.length ? client.subscriptions.map((item) => `${item.id} (${item.kind}${item.intervalMs ? `, ${item.intervalMs}ms` : ""})`).join(", ") : "None"],
            ["Worker queues", client.workerQueues.length ? client.workerQueues.map((item) => `${item.id}: ${item.queued} queued / ${item.active} active`).join(", ") : "None"],
            ["Query cache", `${cache.entryCount} entries across ${Object.keys(cache.scopes).length} scopes`],
            ["Graph cache", client.graph ? `${client.graph.nodesCached} nodes / ${client.graph.edgesCached} edges` : "None"],
            ["Lazy preload", preloadSummary.latestEvent === "None" ? "No preload events recorded." : `${preloadSummary.status}, ${preloadSummary.completedTasks}/${preloadSummary.queuedTasks} completed`],
            ["Latest render", latestRender ? `#${latestRender.count}, ${formatDuration(latestRender.commitDelayMs)} commit delay` : "No sample"]
          ]} />
        </InspectorSection>
        <InspectorSection title="Latest server endpoints">
          <EndpointTable metrics={endpointMetrics.slice(0, 8)} loading={server.pending} empty={endpointEmpty} />
        </InspectorSection>
      </> : null}
      {view === "Requests" ? <>
        <InspectorSection title="Active requests">
          <DataTable label="Active Studio requests" columns={["Endpoint", "Method", "Running"]} compact empty="No active requests." rows={client.activeRequests.map((metric) => [
            `${metric.programId}/${metric.endpoint}`, metric.method, formatDuration(performance.now() - metric.startedAt)
          ])} />
        </InspectorSection>
        <InspectorSection title="Recent client responses">
          <DataTable label="Recent Studio client responses" columns={["Endpoint", "Type", "Time", "Bytes", "Result"]} compact empty="No response samples." rows={client.apiMetrics.slice(-100).reverse().map((metric) => [
            metric.endpoint, metric.classification, formatDuration(metric.elapsedMs), formatBytes(metric.responseBytes), metric.ok ? "OK" : "Failed"
          ])} />
        </InspectorSection>
        <InspectorSection title="Recent server endpoints"><EndpointTable metrics={endpointMetrics} loading={server.pending} empty={endpointEmpty} /></InspectorSection>
      </> : null}
      {view === "SQL" ? <InspectorSection title="Recent SQL operations">
        <DataTable label="Recent Studio SQL operations" columns={["Repository", "Statement", "Time", "Rows", "Scan"]} compact loading={server.pending} empty={sqlEmpty} rows={sqlMetrics.map((metric) => [
          `${metric.repositoryKind ?? "unknown"} / ${metric.databaseName ?? "database"}`,
          `${metric.operation ?? "query"} ${metric.statementType ?? ""} [${metric.fingerprint ?? ""}]`,
          formatDuration(metric.elapsedMs),
          `${metric.rowsReturned ?? 0} read / ${metric.rowsChanged ?? 0} changed`,
          metric.possibleFullScan ? "Possible full scan" : "Bounded/unknown"
        ])} />
      </InspectorSection> : null}
      {view === "Browser" ? <>
        <InspectorSection title="Render and graph">
          <DataTable label="Studio browser and graph metrics" columns={["Metric", "Value"]} compact rows={[
            ["Automation Studio renders", latestRender ? String(latestRender.count) : "0"],
            ["Latest commit delay", latestRender ? formatDuration(latestRender.commitDelayMs) : "No sample"],
            ["Graph mounted", client.graph ? `${client.graph.nodesMounted} nodes / ${client.graph.edgesMounted} edges` : "None"],
            ["Graph cached", client.graph ? `${client.graph.nodesCached} nodes / ${client.graph.edgesCached} edges` : "None"],
            ["Cache estimate", `${cache.entryCount} entries / ${formatBytes(cache.estimatedBytes)}`]
          ]} />
        </InspectorSection>
        <InspectorSection title="Recent long tasks">
          <DataTable label="Recent Studio long tasks" columns={["Scope", "Start", "Duration"]} compact empty="No long tasks recorded." rows={recentLongTasks.map((metric) => [
            metric.scope, formatDuration(metric.startTime), formatDuration(metric.duration)
          ])} />
        </InspectorSection>
        <InspectorSection title="Cache scopes">
          <DataTable label="Studio cache scopes" columns={["Scope", "Entries"]} compact empty="Cache is empty." rows={Object.entries(cache.scopes).sort().map(([scope, count]) => [scope, String(count)])} />
        </InspectorSection>
      </> : null}
      {view === "Preload" ? <>
        <InspectorSection title="Lazy preload queue">
          <DataTable label="Studio lazy preload metrics" columns={["Metric", "Value"]} compact rows={[
            ["Status", preloadSummary.status],
            ["Project", preloadSummary.projectId],
            ["Generation", preloadSummary.generation],
            ["Queued tasks", String(preloadSummary.queuedTasks)],
            ["Completed tasks", String(preloadSummary.completedTasks)],
            ["In flight", String(preloadSummary.inFlightTasks)],
            ["Failed tasks", String(preloadSummary.failedTasks)],
            ["Latest endpoint", preloadSummary.latestEndpoint]
          ]} />
        </InspectorSection>
        <InspectorSection title="Recent preload events">
          <DataTable label="Recent Studio preload events" columns={["Phase", "Task", "Queue", "Time", "Result"]} compact empty="No preload events recorded yet." rows={recentPreloadMetrics.map((metric) => [
            metric.phase,
            metric.endpoint ? `${metric.endpoint}${metric.taskId ? ` / ${metric.taskId}` : ""}` : metric.taskId ?? "Run",
            `${metric.completedTasks ?? "-"}/${metric.queuedTasks ?? "-"}`,
            formatTimestamp(metric.recordedAt),
            preloadMetricResult(metric)
          ])} />
        </InspectorSection>
        <InspectorSection title="Recovery">
          <DataTable label="Studio inspector recovery actions" columns={["Action", "State"]} compact rows={[
            ["Clear UI cache", props.activeProjectId ? "Available for the active project." : "Open a project to enable cache clearing."],
            ["Metrics capture", "Only active while this development inspector is open."],
            ["Event buffer", `${preloadMetrics.length}/${MAX_PRELOAD_METRICS} recent preload events`]
          ]} />
        </InspectorSection>
      </> : null}
    </div>
  </Modal>;
}

function readMetrics(payload: unknown): ServerMetric[] | null {
  if (payload == null) return [];
  if (typeof payload !== "object" || Array.isArray(payload)) return null;
  const metrics = (payload as { metrics?: unknown }).metrics;
  if (metrics == null) return [];
  if (!Array.isArray(metrics)) return null;
  const accepted: ServerMetric[] = [];
  const textFields = ["repositoryKind", "databaseName", "operation", "statementType", "fingerprint", "programId", "endpoint"];
  const numberFields = ["rowsReturned", "rowsChanged", "responseBytes", "sqlDurationMs", "sqlQueryCount", "sqlRowsReturned"];
  for (const value of metrics) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const metric = value as Record<string, unknown>;
    if (typeof metric.kind !== "string") return null;
    if (metric.kind !== "sql" && metric.kind !== "endpoint") continue;
    if (typeof metric.elapsedMs !== "number" || !Number.isFinite(metric.elapsedMs) || typeof metric.ok !== "boolean") return null;
    if (textFields.some((field) => metric[field] != null && typeof metric[field] !== "string")) return null;
    if (numberFields.some((field) => metric[field] != null && (typeof metric[field] !== "number" || !Number.isFinite(metric[field])))) return null;
    if (metric.possibleFullScan != null && typeof metric.possibleFullScan !== "boolean") return null;
    accepted.push(value as ServerMetric);
  }
  return accepted;
}

function useAutomationStudioPreloadMetrics(): RecordedPreloadMetric[] {
  const [metrics, setMetrics] = useState<RecordedPreloadMetric[]>([]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    const onMetric = (event: Event) => {
      const detail = (event as CustomEvent<PreloadMetric>).detail;
      if (!isPreloadMetric(detail)) return;
      setMetrics((current) => current.concat({ ...detail, recordedAt: performance.now() }).slice(-MAX_PRELOAD_METRICS));
    };
    window.addEventListener("automation-studio:preload-metric", onMetric);
    return () => window.removeEventListener("automation-studio:preload-metric", onMetric);
  }, []);
  return metrics;
}

export function summarizePreloadMetrics(metrics: RecordedPreloadMetric[]): PreloadSummary {
  const latest = metrics.at(-1);
  if (!latest) {
    return {
      status: "No events",
      projectId: "None",
      generation: "None",
      queuedTasks: 0,
      completedTasks: 0,
      inFlightTasks: 0,
      failedTasks: 0,
      latestEvent: "None",
      latestEndpoint: "None"
    };
  }

  const generationMetrics = metrics.filter((metric) => metric.projectId === latest.projectId && metric.generation === latest.generation);
  const taskStarts = new Set(generationMetrics.filter((metric) => metric.phase === "task-started" && metric.taskId).map((metric) => metric.taskId!));
  const taskFinishes = generationMetrics.filter((metric) => metric.phase === "task-finished");
  const completedTasks = latest.completedTasks ?? taskFinishes.length;
  const queuedTasks = latest.queuedTasks ?? generationMetrics.find((metric) => metric.phase === "queued")?.queuedTasks ?? Math.max(completedTasks, taskStarts.size);
  const failedTasks = taskFinishes.filter((metric) => metric.ok === false && metric.aborted !== true).length;
  const inFlightTasks = Math.max(0, taskStarts.size - taskFinishes.filter((metric) => metric.taskId && taskStarts.has(metric.taskId)).length);

  return {
    status: latest.phase === "drained" ? "Drained" : latest.phase === "cancelled" ? "Cancelled" : latest.phase === "queued" ? "Queued" : "Running",
    projectId: latest.projectId,
    generation: String(latest.generation),
    queuedTasks,
    completedTasks,
    inFlightTasks,
    failedTasks,
    latestEvent: latest.phase,
    latestEndpoint: latest.endpoint ?? latest.taskId ?? "None"
  };
}

function isPreloadMetric(value: unknown): value is PreloadMetric {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<PreloadMetric>;
  return typeof metric.projectId === "string"
    && typeof metric.generation === "number"
    && (metric.phase === "queued" || metric.phase === "task-started" || metric.phase === "task-finished" || metric.phase === "cancelled" || metric.phase === "drained");
}

function EndpointTable(props: { metrics: ServerMetric[]; loading: boolean; empty: string }) {
  return <DataTable label="Studio server endpoint metrics" columns={["Endpoint", "Time", "Bytes", "SQL", "Rows", "Result"]} compact loading={props.loading} empty={props.empty} rows={props.metrics.map((metric) => [
    `${metric.programId ?? "program"}/${metric.endpoint ?? "endpoint"}`,
    formatDuration(metric.elapsedMs),
    formatBytes(metric.responseBytes ?? 0),
    `${metric.sqlQueryCount ?? 0} / ${formatDuration(metric.sqlDurationMs ?? 0)}`,
    String(metric.sqlRowsReturned ?? 0),
    metric.ok ? "OK" : "Failed"
  ])} />;
}

function InspectorSection(props: { title: string; children: React.ReactNode }) {
  return <section className="automation-data-inspector-section"><h3>{props.title}</h3>{props.children}</section>;
}

function Metric(props: { label: string; value: string }) {
  return <div><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function preloadMetricResult(metric: RecordedPreloadMetric): string {
  if (metric.aborted) return "Aborted";
  if (metric.phase !== "task-finished") return "-";
  return metric.ok ? "OK" : "Failed";
}

function formatDuration(value: number): string {
  return value < 1 ? `${value.toFixed(2)} ms` : `${Math.round(value)} ms`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTimestamp(value: number): string {
  return `${Math.round(value)} ms`;
}
