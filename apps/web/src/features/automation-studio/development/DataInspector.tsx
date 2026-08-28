"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, DataTable, Modal, Segmented } from "../../programs/shared-ui";
import type { AutomationStudioCacheStats } from "../controllers/useAutomationStudioCache";
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

type InspectorApi = {
  get<T>(endpoint: string): Promise<{ ok: boolean; payload?: T; error?: string }>;
};

export function AutomationStudioDataInspector(props: {
  api: InspectorApi;
  cacheStats(): AutomationStudioCacheStats;
  onClose(): void;
}) {
  const client = useAutomationStudioDevelopmentSnapshot();
  const [view, setView] = useState("Overview");
  const [serverMetrics, setServerMetrics] = useState<ServerMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await props.api.get<{ metrics?: ServerMetric[] }>("get-performance-metrics");
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Performance metrics could not be loaded.");
      return;
    }
    setServerMetrics(result.payload?.metrics ?? []);
  }, [props.api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const endpointMetrics = useMemo(() => serverMetrics.filter((metric) => metric.kind === "endpoint").slice(-100).reverse(), [serverMetrics]);
  const sqlMetrics = useMemo(() => serverMetrics.filter((metric) => metric.kind === "sql").slice(-100).reverse(), [serverMetrics]);
  const cache = client.cache.entryCount || client.cache.estimatedBytes ? client.cache : props.cacheStats();
  const latestRender = client.renderMetrics.at(-1);
  const recentLongTasks = client.longTasks.slice(-20).reverse();

  return <Modal className="automation-data-inspector" description="Live development telemetry for bounded data loading and browser work." onClose={props.onClose} title="Data Flow Inspector">
    <div className="automation-data-inspector-toolbar">
      <Segmented label="Inspector view" onChange={setView} options={["Overview", "Requests", "SQL", "Browser"]} value={view} />
      <Button busy={loading} onClick={() => void refresh()} size="compact"><RefreshCw size={14} aria-hidden />Refresh server</Button>
    </div>
    {error ? <div className="automation-data-inspector-error" role="alert">{error}</div> : null}
    <div className="automation-data-inspector-body">
      {view === "Overview" ? <>
        <div className="automation-data-inspector-summary">
          <Metric label="Active requests" value={String(client.activeRequests.length)} />
          <Metric label="Client responses" value={String(client.apiMetrics.length)} />
          <Metric label="SQL samples" value={String(sqlMetrics.length)} />
          <Metric label="Cache" value={formatBytes(cache.estimatedBytes)} />
          <Metric label="Mounted graph" value={client.graph ? `${client.graph.nodesMounted} nodes / ${client.graph.edgesMounted} edges` : "None"} />
          <Metric label="Long tasks" value={String(client.longTasks.length)} />
        </div>
        <InspectorSection title="Live ownership">
          <DataTable columns={["Resource", "Current state"]} compact rows={[
            ["Subscriptions", client.subscriptions.length ? client.subscriptions.map((item) => `${item.id} (${item.kind}${item.intervalMs ? `, ${item.intervalMs}ms` : ""})`).join(", ") : "None"],
            ["Worker queues", client.workerQueues.length ? client.workerQueues.map((item) => `${item.id}: ${item.queued} queued / ${item.active} active`).join(", ") : "None"],
            ["Query cache", `${cache.entryCount} entries across ${Object.keys(cache.scopes).length} scopes`],
            ["Graph cache", client.graph ? `${client.graph.nodesCached} nodes / ${client.graph.edgesCached} edges` : "None"],
            ["Latest render", latestRender ? `#${latestRender.count}, ${formatDuration(latestRender.commitDelayMs)} commit delay` : "No sample"]
          ]} />
        </InspectorSection>
        <InspectorSection title="Latest server endpoints">
          <EndpointTable metrics={endpointMetrics.slice(0, 8)} />
        </InspectorSection>
      </> : null}
      {view === "Requests" ? <>
        <InspectorSection title="Active requests">
          <DataTable columns={["Endpoint", "Method", "Running"]} compact empty="No active requests." rows={client.activeRequests.map((metric) => [
            `${metric.programId}/${metric.endpoint}`, metric.method, formatDuration(performance.now() - metric.startedAt)
          ])} />
        </InspectorSection>
        <InspectorSection title="Recent client responses">
          <DataTable columns={["Endpoint", "Type", "Time", "Bytes", "Result"]} compact empty="No response samples." rows={client.apiMetrics.slice(-100).reverse().map((metric) => [
            metric.endpoint, metric.classification, formatDuration(metric.elapsedMs), formatBytes(metric.responseBytes), metric.ok ? "OK" : "Failed"
          ])} />
        </InspectorSection>
        <InspectorSection title="Recent server endpoints"><EndpointTable metrics={endpointMetrics} /></InspectorSection>
      </> : null}
      {view === "SQL" ? <InspectorSection title="Recent SQL operations">
        <DataTable columns={["Repository", "Statement", "Time", "Rows", "Scan"]} compact empty={loading ? "Loading SQL metrics..." : "No SQL samples."} rows={sqlMetrics.map((metric) => [
          `${metric.repositoryKind ?? "unknown"} / ${metric.databaseName ?? "database"}`,
          `${metric.operation ?? "query"} ${metric.statementType ?? ""} [${metric.fingerprint ?? ""}]`,
          formatDuration(metric.elapsedMs),
          `${metric.rowsReturned ?? 0} read / ${metric.rowsChanged ?? 0} changed`,
          metric.possibleFullScan ? "Possible full scan" : "Bounded/unknown"
        ])} />
      </InspectorSection> : null}
      {view === "Browser" ? <>
        <InspectorSection title="Render and graph">
          <DataTable columns={["Metric", "Value"]} compact rows={[
            ["Automation Studio renders", latestRender ? String(latestRender.count) : "0"],
            ["Latest commit delay", latestRender ? formatDuration(latestRender.commitDelayMs) : "No sample"],
            ["Graph mounted", client.graph ? `${client.graph.nodesMounted} nodes / ${client.graph.edgesMounted} edges` : "None"],
            ["Graph cached", client.graph ? `${client.graph.nodesCached} nodes / ${client.graph.edgesCached} edges` : "None"],
            ["Cache estimate", `${cache.entryCount} entries / ${formatBytes(cache.estimatedBytes)}`]
          ]} />
        </InspectorSection>
        <InspectorSection title="Recent long tasks">
          <DataTable columns={["Scope", "Start", "Duration"]} compact empty="No long tasks recorded." rows={recentLongTasks.map((metric) => [
            metric.scope, formatDuration(metric.startTime), formatDuration(metric.duration)
          ])} />
        </InspectorSection>
        <InspectorSection title="Cache scopes">
          <DataTable columns={["Scope", "Entries"]} compact empty="Cache is empty." rows={Object.entries(cache.scopes).sort().map(([scope, count]) => [scope, String(count)])} />
        </InspectorSection>
      </> : null}
    </div>
  </Modal>;
}

function EndpointTable(props: { metrics: ServerMetric[] }) {
  return <DataTable columns={["Endpoint", "Time", "Bytes", "SQL", "Rows", "Result"]} compact empty="No endpoint samples." rows={props.metrics.map((metric) => [
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

function formatDuration(value: number): string {
  return value < 1 ? `${value.toFixed(2)} ms` : `${Math.round(value)} ms`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
