"use client";

import { ChevronLeft, ChevronRight, Database, KeyRound, LockKeyhole, RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatabaseManagerSnapshotResponse, RecordEnvelope } from "fluxiq/database-manager";
import { useProgramApi, type ApiResponse } from "../program-api";
import { EmptyState, Field, KeyValue, LoadingState, Modal, StatusText, VisualAlert } from "../shared-ui";
import type { CurrentUser } from "../types";
import { digits, formatDbCell, formatTime, isSensitiveDatabaseStore, sensitiveStoreKey } from "./shared";

type RecordPage = { records: RecordEnvelope[]; total: number; limit: number; offset: number };
type SensitiveGrant = { grantId: string; expiresAtMs: number };
type SortField = "updated" | "created" | "id";

export function DatabaseManagerLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("database-manager");
  const [snapshot, setSnapshot] = useState<ApiResponse<DatabaseManagerSnapshotResponse> | null>(null);
  const [page, setPage] = useState<RecordPage>({ records: [], total: 0, limit: 50, offset: 0 });
  const [kind, setKind] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<RecordEnvelope | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState("global");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [sort, setSort] = useState<SortField>("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [credentialRecheck, setCredentialRecheck] = useState({ password: "", pin: "", totp: "" });
  const [grants, setGrants] = useState<Record<string, SensitiveGrant>>({});
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await api.get<DatabaseManagerSnapshotResponse>("snapshot", signal ? { signal } : {});
    if (next.aborted) return;
    setSnapshot(next);
    setKind((current) => current || next.payload?.stores?.[0]?.kind || "");
  }, [api]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  const storeKey = sensitiveStoreKey(kind, selectedDatabase);
  const activeGrant = grants[storeKey];
  const grantValid = Boolean(activeGrant && activeGrant.expiresAtMs > nowMs);
  const sensitive = isSensitiveDatabaseStore(kind);
  const sensitiveLocked = sensitive && !grantValid;

  const loadRecords = useCallback(async () => {
    if (!kind) return;
    const currentGrant = grants[sensitiveStoreKey(kind, selectedDatabase)];
    if (isSensitiveDatabaseStore(kind) && (!currentGrant || currentGrant.expiresAtMs <= Date.now())) {
      setPage({ records: [], total: 0, limit: 50, offset: 0 });
      setSelectedRecord(null);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    const result = await api.post<RecordPage>("list-records", {
      kind,
      scope: selectedDatabase === "global" ? {} : { domainId: selectedDatabase },
      limit: 50,
      offset: page.offset,
      search,
      sort,
      direction,
      ...(currentGrant ? { grantId: currentGrant.grantId } : {})
    });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok || !result.payload) {
      setPage({ records: [], total: 0, limit: 50, offset: 0 });
      setSelectedRecord(null);
      setStatus(result.error ?? "Unable to load records.");
      if (result.error?.toLocaleLowerCase().includes("authorization") || result.error?.toLocaleLowerCase().includes("expired")) setGrants((current) => { const next = { ...current }; delete next[sensitiveStoreKey(kind, selectedDatabase)]; return next; });
      return;
    }
    setStatus("");
    setPage(result.payload);
    if (result.payload.offset >= result.payload.total && result.payload.offset > 0) setPage((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }));
  }, [api, direction, grants, kind, page.offset, search, selectedDatabase, sort]);
  useEffect(() => void loadRecords(), [loadRecords]);
  useEffect(() => { if (!sensitive || !activeGrant || activeGrant.expiresAtMs > nowMs) return; setGrants((current) => { const next = { ...current }; delete next[storeKey]; return next; }); setPage({ records: [], total: 0, limit: 50, offset: 0 }); setSelectedRecord(null); setStatus("Sensitive-store authorization expired"); }, [activeGrant, nowMs, sensitive, storeKey]);

  async function inspectRecord(id: string) {
    const requestId = ++detailRequestRef.current;
    const requestedStoreKey = storeKey;
    setSelectedRecord(null);
    const currentGrant = grants[storeKey];
    const result = await api.post<RecordEnvelope | null>("get-record", { kind, id, scope: selectedDatabase === "global" ? {} : { domainId: selectedDatabase }, ...(currentGrant ? { grantId: currentGrant.grantId } : {}) });
    if (requestId !== detailRequestRef.current || requestedStoreKey !== sensitiveStoreKey(kind, selectedDatabase)) return;
    if (!result.ok) { setStatus(result.error ?? "Unable to inspect record."); setSelectedRecord(null); return; }
    setSelectedRecord(result.payload ?? null);
  }

  async function authorizeSensitiveStore() {
    const result = await api.post<SensitiveGrant>("authorize-store", { kind, scope: selectedDatabase === "global" ? {} : { domainId: selectedDatabase }, authorizationPassword: credentialRecheck.password, authorizationPin: credentialRecheck.pin, authorizationTotp: credentialRecheck.totp });
    if (!result.ok || !result.payload) { setStatus(result.error ?? "Recheck failed."); return; }
    setGrants((current) => ({ ...current, [storeKey]: result.payload! }));
    setRecheckOpen(false);
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setStatus("Sensitive store authorized for five minutes");
  }

  function requestSensitiveRecheck() { setCredentialRecheck({ password: "", pin: "", totp: "" }); setRecheckOpen(true); }
  function selectStore(database: string, storeKind: string) {
    requestRef.current += 1;
    detailRequestRef.current += 1;
    setSelectedDatabase(database); setKind(storeKind); setSelectedRecord(null); setPage({ records: [], total: 0, limit: 50, offset: 0 }); setSearchInput(""); setSearch(""); setStatus("");
    if (isSensitiveDatabaseStore(storeKind)) setRecheckOpen(true);
  }
  useEffect(() => () => {
    requestRef.current += 1;
    detailRequestRef.current += 1;
  }, []);

  const stores = snapshot?.payload?.stores ?? [];
  const databases: string[] = snapshot?.payload?.databases?.length ? snapshot.payload.databases : ["global"];
  const allColumns = useMemo(() => {
    const keys = new Set<string>(["id"]);
    for (const record of page.records) for (const key of Object.keys(record.data ?? {})) keys.add(key);
    return [...keys].filter((column) => !columnFilter || column.toLocaleLowerCase().includes(columnFilter.toLocaleLowerCase()));
  }, [columnFilter, page.records]);
  const columns = allColumns.slice(0, 30);
  const hiddenColumnCount = Math.max(0, allColumns.length - columns.length);
  const selectedData = selectedRecord?.data ?? null;
  const pageNumber = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  if (!snapshot) return <LoadingState label="Loading databases" detail="Reading store metadata without loading record collections." />;
  if (!snapshot.ok) return <EmptyState title="Database Manager unavailable" description={snapshot.error ?? "Database metadata could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="db-explorer-shell">
      <aside className="db-sidebar"><div className="db-sidebar-heading"><strong>Databases</strong><span>{databases.length}</span></div><div className="db-tree">{databases.map((database) => <div className="db-tree-group" key={database}><button className={selectedDatabase === database ? "db-node selected" : "db-node"} onClick={() => selectStore(database, kind || stores[0]?.kind || "")} type="button"><Database size={14} aria-hidden /><strong>{database === "global" ? "Global" : database}</strong></button><div className="db-table-list">{stores.map((store) => <button className={kind === store.kind && selectedDatabase === database ? "db-table-node selected" : "db-table-node"} key={database + ":" + store.kind} onClick={() => selectStore(database, store.kind)} type="button"><span className="db-icon table">T</span><span>{store.kind}</span><small>{isSensitiveDatabaseStore(store.kind) ? <><LockKeyhole size={11} aria-hidden />Locked</> : store.recordCount ?? "-"}</small></button>)}</div></div>)}</div></aside>
      <section className="db-main">
        <div className="db-toolbar"><label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search rows" disabled={sensitiveLocked} onChange={(event) => { setSearchInput(event.target.value); setPage((current) => ({ ...current, offset: 0 })); }} placeholder="Search IDs and stored values" type="search" value={searchInput} /></label><Field label="Columns"><input value={columnFilter} onChange={(event) => setColumnFilter(event.target.value)} placeholder="Filter visible columns" /></Field><Field label="Sort"><select value={sort} onChange={(event) => { setSort(event.target.value as SortField); setPage((current) => ({ ...current, offset: 0 })); }}><option value="updated">Updated</option><option value="created">Created</option><option value="id">Record ID</option></select></Field><Field label="Direction"><select value={direction} onChange={(event) => { setDirection(event.target.value as "asc" | "desc"); setPage((current) => ({ ...current, offset: 0 })); }}><option value="desc">Descending</option><option value="asc">Ascending</option></select></Field><button aria-label="Refresh rows" className="icon-button" onClick={() => sensitiveLocked ? requestSensitiveRecheck() : void loadRecords()} title="Refresh rows" type="button"><RefreshCcw size={15} aria-hidden /></button></div>
        {sensitiveLocked ? <section className="db-locked-state"><VisualAlert tone="warning" title="Sensitive store locked" message="Identity credentials and encrypted secrets never enter summary caches. Complete a fresh security check for a five-minute view grant." /><button className="button button-primary" onClick={requestSensitiveRecheck} type="button"><KeyRound size={14} aria-hidden />Authorize View</button></section> : <><div aria-busy={loading} className="db-grid-wrap">{hiddenColumnCount ? <div className="db-column-notice" role="status">Showing the first 30 matching columns. {hiddenColumnCount} more {hiddenColumnCount === 1 ? "column is" : "columns are"} available in record detail.</div> : null}<table className="db-grid"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{page.records.map((record) => <tr className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id}>{columns.map((column) => <td key={column}>{column === "id" ? <button className="link-button" onClick={() => void inspectRecord(record.id)} type="button">{record.id}</button> : formatDbCell(record.data?.[column])}</td>)}</tr>)}{!loading && !page.records.length ? <tr><td className="empty-cell" colSpan={Math.max(1, columns.length)}>{search ? "No rows match this search." : "This store has no rows."}</td></tr> : null}</tbody></table>{loading ? <LoadingState compact label="Loading rows" /> : null}</div><footer className="db-page-footer"><span>{page.total ? page.offset + 1 : 0}-{Math.min(page.total, page.offset + page.records.length)} of {page.total}</span><div className="inline-actions"><button aria-label="Previous page" className="icon-button" disabled={page.offset === 0 || loading} onClick={() => setPage((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))} title="Previous page" type="button"><ChevronLeft size={15} aria-hidden /></button><span>Page {pageNumber} of {pageCount}</span><button aria-label="Next page" className="icon-button" disabled={page.offset + page.limit >= page.total || loading} onClick={() => setPage((current) => ({ ...current, offset: current.offset + current.limit }))} title="Next page" type="button"><ChevronRight size={15} aria-hidden /></button></div></footer></>}
      </section>
      <aside className="db-inspector"><div className="db-sidebar-heading"><strong>Record Detail</strong><span>{selectedRecord?.id ?? "none"}</span></div>{selectedRecord ? <><KeyValue rows={[["ID", selectedRecord.id], ["Store", selectedRecord.kind], ["Database", selectedRecord.scope?.domainId ?? "global"], ["Created", formatTime(selectedRecord.createdAtMs)], ["Updated", formatTime(selectedRecord.updatedAtMs)]]} />{selectedData ? <div className="kv-explorer">{Object.entries(selectedData).map(([key, value]) => <div key={key}><span className="db-icon key">K</span><strong>{key}</strong><code>{formatDbCell(value)}</code></div>)}</div> : null}<details className="db-raw-record"><summary>Detailed JSON</summary><pre>{JSON.stringify(selectedRecord.data, null, 2)}</pre></details></> : <EmptyState compact title="No record selected" description="Choose a record ID to load its full detail." />}<StatusText value={status} />{grantValid && activeGrant ? <small className="db-grant-status">Sensitive grant expires in {formatGrantCountdown(activeGrant.expiresAtMs, nowMs)}</small> : null}</aside>
      {recheckOpen ? <Modal title="Authorize Sensitive Store" description={"Grant five minutes of access to " + kind + " in " + selectedDatabase + "."} onClose={() => setRecheckOpen(false)}><VisualAlert tone="warning" title="Fresh recheck required" message="Encrypted and credential records remain excluded from summaries and browser caches until authorization succeeds." /><div className="dialog-form"><Field label="Password" required><input autoComplete="current-password" data-autofocus type="password" value={credentialRecheck.password} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, password: event.target.value })} /></Field>{currentUser.pinConfigured ? <Field label="PIN" required><input inputMode="numeric" value={credentialRecheck.pin} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, pin: digits(event.target.value) })} /></Field> : null}{currentUser.totpEnabled ? <Field label="2FA code" required><input autoComplete="one-time-code" inputMode="numeric" value={credentialRecheck.totp} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}</div><div className="modal-actions"><button className="button" onClick={() => setRecheckOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialRecheck.password || (currentUser.pinConfigured && credentialRecheck.pin.length < 4) || (currentUser.totpEnabled && credentialRecheck.totp.length !== 6)} onClick={() => void authorizeSensitiveStore()} type="button">Authorize for 5 Minutes</button></div></Modal> : null}
    </section>
  );
}

export function formatGrantCountdown(expiresAtMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + ":" + String(remainder).padStart(2, "0");
}
