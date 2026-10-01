"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FluxIQRuntimeSnapshot } from "fluxiq/runtime";
import { EmptyState, LoadingState, Panel, SummaryStrip, VisualAlert } from "../../components";
import { useProgramApi } from "../../program-api";
import { reconcileVisibleSelection } from "../../program-selection";
import { projectRuntimeSnapshot, RuntimeInventory, RuntimeRunDetail } from ".";

const sections = ["clients", "capabilities", "runs", "dispatch", "transports"] as const;
type Section = typeof sections[number];
type Snapshot = NonNullable<ReturnType<typeof projectRuntimeSnapshot>>;
const labels: Record<Section, string> = { clients: "Clients", capabilities: "Capabilities", runs: "Runs", dispatch: "Dispatch", transports: "Transports and adapters" };
const PAGE_SIZE = 50;

export function RuntimeLive() {
  const api = useProgramApi("runtime");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [section, setSection] = useState<Section>("clients");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState("");
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const apiRef = useRef(api);
  const refresh = useCallback(async () => {
    if (!activeRef.current || apiRef.current !== api) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const result = await api.get<FluxIQRuntimeSnapshot>("snapshot", { signal: controller.signal });
      if (controller.signal.aborted || request !== requestRef.current) return;
      const projected = result.ok ? projectRuntimeSnapshot(result.payload) : null;
      if (!projected) setError(result.status === 403 ? "You do not have permission to inspect Runtime. Retry after access is restored." : "Runtime could not be loaded. Retry to read the current snapshot.");
      else { setSnapshot(projected); setLoadedAt(Date.now()); }
    } catch { if (!controller.signal.aborted && request === requestRef.current) setError("Runtime could not be loaded. Retry to read the current snapshot."); }
    finally { if (!controller.signal.aborted && request === requestRef.current) setLoading(false); }
  }, [api]);
  useEffect(() => {
    activeRef.current = true; apiRef.current = api;
    setSnapshot(null); setLoadedAt(null); setSelectedKey(""); setOffset(0);
    void refresh();
    return () => { activeRef.current = false; ++requestRef.current; controllerRef.current?.abort(); };
  }, [refresh]);

  const rows = snapshot?.[section] ?? [];
  const filtered = useMemo(() => rows.filter((entry) => (filter === "all" || (section === "clients" || section === "runs" || section === "dispatch" ? entry.status : entry.kind) === filter) && entry.search.includes(search.trim().toLocaleLowerCase())), [rows, filter, search, section]);
  const pageOffset = Math.min(offset, Math.max(0, Math.floor((filtered.length - 1) / PAGE_SIZE) * PAGE_SIZE));
  const page = filtered.slice(pageOffset, pageOffset + PAGE_SIZE);
  const visibleKey = reconcileVisibleSelection(page, selectedKey, (entry) => entry.key);
  const selected = page.find((entry) => entry.key === visibleKey);
  const choices = [...new Set(rows.map((entry) => section === "clients" || section === "runs" || section === "dispatch" ? entry.status : entry.kind))].sort();

  if (!snapshot || apiRef.current !== api) return loading || apiRef.current !== api ? <LoadingState label="Loading Runtime" detail="Reading the global runtime inventory." /> : <EmptyState title="Runtime unavailable" description={error} action={<button type="button" className="button" onClick={() => void refresh()}>Retry Runtime</button>} />;
  return <Panel title="Runtime" action={<button type="button" className="button" onClick={() => void refresh()}>Refresh Runtime</button>}>
    <section aria-label="Global Runtime workspace" aria-busy={loading}>
      <SummaryStrip items={[["Clients", snapshot.clients.length], ["Capability entries", snapshot.capabilities.length], ["Runs", snapshot.runs.length], ["Dispatch attempts", snapshot.dispatch.length]]} />
      <p>Global runtime inventory: {snapshot.runtimeId}. Snapshot loaded at {loadedAt === null ? "-" : new Date(loadedAt).toLocaleTimeString()}. Use Refresh for current state.</p>
      <p>Pages show 50 entries from the returned global snapshot. The Runtime API returns the full inventory; these are client-side pages.</p>
      {loading ? <LoadingState compact label="Refreshing Runtime; displayed snapshot may be stale" /> : null}
      {error ? <VisualAlert tone="error" title="Displayed snapshot is stale" message={error} /> : null}
      <nav aria-label="Runtime sections">{sections.map((value) => <button key={value} type="button" aria-pressed={section === value} onClick={() => { setSection(value); setSearch(""); setFilter("all"); setOffset(0); setSelectedKey(""); }}>{labels[value]}</button>)}</nav>
      <label>Search {labels[section]}<input type="search" aria-label="Search Runtime entries" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); setSelectedKey(""); }} /></label>
      <label>Filter {labels[section]}<select aria-label="Filter Runtime entries" value={filter} onChange={(event) => { setFilter(event.target.value); setOffset(0); setSelectedKey(""); }}><option value="all">All</option>{choices.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <RuntimeInventory label={labels[section]} rows={page} selected={selected} onSelect={setSelectedKey} showDetail={section !== "runs"} />
      <footer><span>{filtered.length ? pageOffset + 1 : 0}-{Math.min(filtered.length, pageOffset + PAGE_SIZE)} of {filtered.length} matching entries</span><button type="button" disabled={pageOffset === 0} onClick={() => { setOffset(Math.max(0, pageOffset - PAGE_SIZE)); setSelectedKey(""); }}>Previous Runtime page</button><button type="button" disabled={pageOffset + PAGE_SIZE >= filtered.length} onClick={() => { setOffset(pageOffset + PAGE_SIZE); setSelectedKey(""); }}>Next Runtime page</button></footer>
      {section === "runs" && selected ? <RuntimeRunDetail key={selected.key} run={selected} scope={snapshot} attempts={snapshot.dispatch.filter((entry) => entry.runId === selected.id)} /> : null}
    </section>
  </Panel>;
}
