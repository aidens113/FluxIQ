"use client";

import { RefreshCcw, Search, Server } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComputeCommand, ComputeControlSnapshotResponse, ComputeNode } from "fluxiq/compute-control";
import { useProgramApi, type ApiResponse } from "../program-api";
import { EmptyState, KeyValue, LoadingState, StatusBadge, StatusText } from "../shared-ui";
import { formatTime, shortJson } from "./shared";

type HealthFilter = "all" | "healthy" | "degraded" | "offline";

export function ComputeControlLive() {
  const api = useProgramApi("compute-control");
  const [snapshot, setSnapshot] = useState<ApiResponse<ComputeControlSnapshotResponse> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [capability, setCapability] = useState("all");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get<ComputeControlSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 10000); return () => window.clearInterval(timer); }, []);

  const nodes = snapshot?.payload?.nodes ?? [];
  const commands = snapshot?.payload?.commands ?? [];
  const leases = snapshot?.payload?.leases ?? [];
  const capabilities = useMemo(() => [...new Set(nodes.flatMap((node) => node.capabilities))].sort(), [nodes]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return nodes.filter((node) => {
      const health = computeNodeHealth(node, nowMs);
      return (healthFilter === "all" || health === healthFilter) && (capability === "all" || node.capabilities.includes(capability)) && (!needle || (node.label + " " + node.id + " " + (node.host ?? "") + " " + node.domainIds.join(" ")).toLocaleLowerCase().includes(needle));
    });
  }, [capability, healthFilter, nodes, nowMs, search]);
  const selected = nodes.find((node) => node.id === selectedId) ?? filtered[0];
  const nodeCommands = commands.filter((command) => command.targetComputeId === selected?.id).slice(0, 50);
  const nodeLeases = leases.filter((lease) => lease.computeId === selected?.id);

  if (!snapshot) return <LoadingState label="Loading compute nodes" detail="Reading node health and capabilities." />;
  if (!snapshot.ok) return <EmptyState title="Compute Control unavailable" description={snapshot.error ?? "Compute state could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return <section className="compute-control-shell">
    <header className="compute-control-toolbar"><label className="program-search-field"><Search aria-hidden size={14} /><input aria-label="Search compute nodes" onChange={(event) => setSearch(event.target.value)} placeholder="Search nodes, hosts, or domains" type="search" value={search} /></label><select aria-label="Filter node health" onChange={(event) => setHealthFilter(event.target.value as HealthFilter)} value={healthFilter}><option value="all">All health</option><option value="healthy">Healthy</option><option value="degraded">Degraded</option><option value="offline">Offline</option></select><select aria-label="Filter node capability" onChange={(event) => setCapability(event.target.value)} value={capability}><option value="all">All capabilities</option>{capabilities.map((item) => <option key={item} value={item}>{item}</option>)}</select><button aria-label="Refresh compute nodes" className="icon-button" onClick={() => void refresh()} title="Refresh compute nodes" type="button"><RefreshCcw aria-hidden size={15} /></button></header>
    <aside className="compute-node-list"><div className="db-sidebar-heading"><strong>Compute Nodes</strong><span>{filtered.length}</span></div>{filtered.map((node) => { const health = computeNodeHealth(node, nowMs); return <button className={selected?.id === node.id ? "compute-node-row selected" : "compute-node-row"} key={node.id} onClick={() => { setSelectedId(node.id); setStatus(""); }} type="button"><Server aria-hidden size={16} /><span><strong>{node.label || node.id}</strong><small>{node.host ?? node.id}</small></span><StatusBadge value={health} /></button>; })}{!filtered.length ? <EmptyState compact title={nodes.length ? "No matching nodes" : "No compute connected"} description={nodes.length ? "Change the search or filters." : "Connected compute nodes will appear here after registration and heartbeat."} /> : null}</aside>
    <main className="compute-node-detail">{selected ? <><header className="compute-detail-heading"><div><h2>{selected.label || selected.id}</h2><p>{selected.host ?? "Host not reported"}</p></div><StatusBadge value={computeNodeHealth(selected, nowMs)} /></header>{computeNodeHealth(selected, nowMs) === "degraded" ? <p className="inline-notice warning" role="status">Heartbeat is stale or the node reports a transitional/error state.</p> : null}<KeyValue rows={[["Node ID", selected.id], ["Reported status", selected.status], ["Last heartbeat", formatTime(selected.lastHeartbeatMs)], ["Heartbeat age", heartbeatAge(selected.lastHeartbeatMs, nowMs)], ["Domains", selected.domainIds.join(", ") || "None"], ["Active leases", String(nodeLeases.length)]]} /><section className="compute-detail-section"><h3>Capabilities</h3><div className="compute-token-list">{selected.capabilities.length ? selected.capabilities.map((item) => <span key={item}>{item}</span>) : <small>No capabilities reported.</small>}</div></section><section className="compute-detail-section"><h3>Node Metadata</h3><div className="compute-metadata-grid">{Object.entries(selected.metadata ?? {}).map(([key, value]) => <div key={key}><strong>{key}</strong><span>{shortJson(value)}</span></div>)}{!Object.keys(selected.metadata ?? {}).length ? <small>No metadata reported.</small> : null}</div></section></> : <EmptyState title="No node selected" description="Choose a compute node to inspect health and capabilities." />}</main>
    <aside className="compute-activity-panel"><div className="db-sidebar-heading"><strong>Activity</strong><span>{nodeCommands.length}</span></div>{nodeCommands.map((command) => <ComputeCommandRow command={command} key={command.id} />)}{selected && !nodeCommands.length ? <EmptyState compact title="No recent commands" description="Commands sent to this node will appear here." /> : null}{nodeLeases.length ? <section className="compute-detail-section"><h3>Active Leases</h3>{nodeLeases.map((lease) => <div className="compute-lease-row" key={lease.id}><strong>{lease.purpose}</strong><small>{lease.holder} / expires {formatTime(lease.expiresAtMs)}</small></div>)}</section> : null}<StatusText value={status} /></aside>
  </section>;
}

function ComputeCommandRow({ command }: { command: ComputeCommand }) {
  return <div className="compute-command-row"><span><strong>{command.kind.replaceAll("_", " ")}</strong><small>{formatTime(command.createdAtMs)}</small></span><StatusBadge value={command.status ?? "queued"} />{command.error ? <small className="error-text">{command.error}</small> : null}</div>;
}

export function computeNodeHealth(node: Pick<ComputeNode, "status"> & { lastHeartbeatMs?: number }, nowMs: number): HealthFilter {
  if (node.status === "offline" || !node.lastHeartbeatMs || nowMs - node.lastHeartbeatMs > 300000) return "offline";
  if (node.status === "online" && nowMs - node.lastHeartbeatMs <= 120000) return "healthy";
  return "degraded";
}

function heartbeatAge(value: number | undefined, nowMs: number): string {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((nowMs - value) / 1000));
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  return Math.floor(seconds / 3600) + "h";
}
