"use client";

import { ChevronLeft, ChevronRight, Database, KeyRound, LockKeyhole, RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useProgramApi } from "../program-api";
import { EmptyState, Field, KeyValue, LoadingState, Modal, StatusText, VisualAlert } from "../shared-ui";
import type { CurrentUser } from "../types";
import { digits, formatDbCell, formatTime, isSensitiveDatabaseStore, sensitiveStoreKey } from "./shared";
import { useDatabaseRecords } from "../database-records";

type SensitiveGrant = { grantId: string; expiresAtMs: number };
type SortField = "updated" | "created" | "id";

export function DatabaseManagerLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("database-manager");
  const identity = useRef({ api, userId: currentUser.id, generation: 0 });
  if (identity.current.api !== api || identity.current.userId !== currentUser.id) identity.current = { api, userId: currentUser.id, generation: identity.current.generation + 1 };
  const ownerCurrent = useCallback(() => identity.current.api === api && identity.current.userId === currentUser.id, [api, currentUser.id]);
  return <DatabaseWorkspace key={identity.current.generation} api={api} currentUser={currentUser} ownerCurrent={ownerCurrent} />;
}

function DatabaseWorkspace({ api, currentUser, ownerCurrent }: { api: ReturnType<typeof useProgramApi>; currentUser: CurrentUser; ownerCurrent(): boolean }) {
  const [kind, setKind] = useState("");
  const [selectedDatabase, setSelectedDatabase] = useState("global");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [sort, setSort] = useState<SortField>("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState("");
  const [credentialRecheck, setCredentialRecheck] = useState({ password: "", pin: "", totp: "" });
  const [grants, setGrants] = useState<Record<string, SensitiveGrant>>({});
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [recheckError, setRecheckError] = useState("");
  const recheckRef = useRef({ epoch: 0, busy: false, open: false });
  const apiRef = useRef(api);
  const grantApiRef = useRef(api);
  apiRef.current = api;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const recheckEpoch = recheckRef.current.epoch;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; recheckRef.current = { epoch: recheckRef.current.epoch + 1, busy: false, open: false }; }; }, []);
  const current = () => mounted.current && ownerCurrent();
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  const storeKey = sensitiveStoreKey(kind, selectedDatabase);
  const scopedGrants = grantApiRef.current === api ? grants : {};
  const activeGrant = scopedGrants[storeKey];
  const grantValid = Boolean(activeGrant && activeGrant.expiresAtMs > Date.now());
  const sensitive = isSensitiveDatabaseStore(kind);

  const query = useMemo(() => ({ kind, database: selectedDatabase, search, sort, direction }), [kind, selectedDatabase, search, sort, direction]);
  const queryRef = useRef({ query, searchInput }); queryRef.current = { query, searchInput };
  const queryCurrent = () => current() && queryRef.current.query === query && queryRef.current.searchInput === searchInput;
  const records = useDatabaseRecords({ api, owner: api, query, authority: activeGrant ?? null, ready: searchInput.trim() === search, authorized: () => current() && (!sensitive || Boolean(activeGrant && activeGrant.expiresAtMs > Date.now())), ...(activeGrant ? { grantId: activeGrant.grantId, expiresAtMs: activeGrant.expiresAtMs } : {}) });
  const sensitiveLocked = sensitive && (!grantValid || records.authorizationLost);
  useEffect(() => { if (records.authorizationLost) setGrants((value) => { const next = { ...value }; delete next[storeKey]; return next; }); }, [records.authorizationLost, storeKey]);
  const { metadata: snapshot, metadataLoading, metadataError, refreshMetadata: refresh, loading, refreshRows: loadRecords, inspectRecord, selectedRecord } = records;
  const targetRef = useRef({ snapshot, kind, selectedDatabase }); targetRef.current = { snapshot, kind, selectedDatabase };
  const targetPresent = Boolean(snapshot?.stores.some((store) => store.kind === kind) && (snapshot.databases.length ? snapshot.databases : ["global"]).includes(selectedDatabase));
  const targetCurrent = () => current() && targetRef.current.kind === kind && targetRef.current.selectedDatabase === selectedDatabase && Boolean(targetRef.current.snapshot?.stores.some((store) => store.kind === kind) && (targetRef.current.snapshot.databases.length ? targetRef.current.snapshot.databases : ["global"]).includes(selectedDatabase));
  const page = records.page ?? { records: [], total: 0, limit: 50, offset: 0 };
  useEffect(() => { if (!snapshot) return; const databases = snapshot.databases.length ? snapshot.databases : ["global"]; if (!snapshot.stores.some((store) => store.kind === kind)) { setKind(snapshot.stores[0]?.kind ?? ""); resetSensitiveRecheck(false); } if (!databases.includes(selectedDatabase)) { setSelectedDatabase(databases[0] ?? "global"); resetSensitiveRecheck(false); } }, [snapshot, selectedDatabase, kind]);
  useEffect(() => { if (!sensitive || !activeGrant || activeGrant.expiresAtMs > nowMs) return; setGrants((value) => { const next = { ...value }; delete next[storeKey]; return next; }); setStatus("Sensitive-store authorization expired"); }, [activeGrant, nowMs, sensitive, storeKey]);

  async function authorizeSensitiveStore() {
    if (!targetCurrent() || !recheckRef.current.open || recheckRef.current.busy || recheckRef.current.epoch !== recheckEpoch || apiRef.current !== api) return;
    const token = recheckRef.current.epoch;
    const current = () => targetCurrent() && token === recheckRef.current.epoch && recheckRef.current.open && apiRef.current === api;
    recheckRef.current.busy = true;
    setRecheckBusy(true); setRecheckError("");
    try {
      const result = await api.post<SensitiveGrant>("authorize-store", { kind, scope: selectedDatabase === "global" ? {} : { domainId: selectedDatabase }, authorizationPassword: credentialRecheck.password, authorizationPin: credentialRecheck.pin, authorizationTotp: credentialRecheck.totp });
      if (!current()) return;
      const grant = result.payload;
      if (!result.ok || !grant || typeof grant.grantId !== "string" || !grant.grantId.trim() || !Number.isFinite(grant.expiresAtMs) || grant.expiresAtMs <= Date.now()) {
        setRecheckError("Authorization could not be completed. Check your credentials and try again."); return;
      }
      setGrants((existing) => ({ ...existing, [storeKey]: grant }));
      resetSensitiveRecheck(false);
      setStatus("Sensitive store authorized for five minutes");
    } catch {
      if (current()) setRecheckError("Authorization could not be completed. Check your credentials and try again.");
    } finally {
      if (current()) { recheckRef.current.busy = false; setRecheckBusy(false); }
    }
  }

  function resetSensitiveRecheck(open: boolean) {
    recheckRef.current = { epoch: recheckRef.current.epoch + 1, busy: false, open };
    setRecheckOpen(open); setRecheckBusy(false); setRecheckError("");
    setCredentialRecheck({ password: "", pin: "", totp: "" });
  }
  const handlers = useRef({ selectStore, requestSensitiveRecheck }); handlers.current = { selectStore, requestSensitiveRecheck };
  function requestSensitiveRecheck() { if (targetCurrent() && handlers.current.requestSensitiveRecheck === requestSensitiveRecheck) resetSensitiveRecheck(true); }
  function dismissRecheck() { if (targetCurrent() && recheckRef.current.epoch === recheckEpoch) resetSensitiveRecheck(false); }
  function selectStore(database: string, storeKind: string) {
    if (!current() || handlers.current.selectStore !== selectStore || !snapshot?.stores.some((store) => store.kind === storeKind)) return;
    setSelectedDatabase(database); setKind(storeKind); setSearchInput(""); setSearch(""); setStatus("");
    resetSensitiveRecheck(isSensitiveDatabaseStore(storeKind));
  }

  const stores = snapshot?.stores ?? [];
  const databases: string[] = snapshot?.databases?.length ? snapshot.databases : ["global"];
  const allColumns = useMemo(() => {
    const keys = new Set<string>(["id"]);
    for (const record of page.records) for (const key of Object.keys(record.data ?? {})) keys.add(key);
    return [...keys].filter((column) => !columnFilter || column.toLocaleLowerCase().includes(columnFilter.toLocaleLowerCase()));
  }, [columnFilter, page.records]);
  const columns = allColumns.slice(0, 30);
  const hiddenColumnCount = Math.max(0, allColumns.length - columns.length);
  const selectedData = selectedRecord?.data ?? null;
  const rawEligible = Boolean(selectedRecord && !records.detailLoading && !records.detailError && !records.detailMissing && !sensitiveLocked && targetPresent && searchInput.trim() === search);
  const rawAuthority = activeGrant ?? null;
  const rawOwner = useRef({ record: selectedRecord, query, authority: rawAuthority, eligible: rawEligible, generation: 0 });
  if (rawOwner.current.record !== selectedRecord || rawOwner.current.query !== query || rawOwner.current.authority !== rawAuthority || rawOwner.current.eligible !== rawEligible) {
    rawOwner.current = { record: selectedRecord, query, authority: rawAuthority, eligible: rawEligible, generation: rawOwner.current.generation + 1 };
  }
  const rawGeneration = rawOwner.current.generation;
  const [expandedGeneration, setExpandedGeneration] = useState<number | null>(null);
  const rawExpanded = rawEligible && expandedGeneration === rawGeneration;
  const rawJson = useMemo(() => rawExpanded && selectedRecord ? JSON.stringify(selectedRecord.data, null, 2) : null, [rawExpanded, selectedRecord?.data]);
  function toggleRaw(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!current() || !targetCurrent() || !queryCurrent() || rawOwner.current.generation !== rawGeneration || rawOwner.current.record !== selectedRecord || !rawOwner.current.eligible || records.authorizationLost || (sensitive && (!activeGrant || activeGrant.expiresAtMs <= Date.now()))) return;
    setExpandedGeneration(event.currentTarget.open ? rawGeneration : null);
  }
  const pageNumber = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  if (!snapshot) return metadataLoading ? <LoadingState label="Loading databases" detail="Reading store metadata without loading record collections." /> : <EmptyState title="Database Manager unavailable" description={metadataError || "No metadata confirmed."} action={<button className="button" onClick={() => void refresh()} type="button">Retry metadata</button>} />;

  return (
    <>{metadataError ? <VisualAlert tone="error" title="Metadata refresh failed" message={metadataError} /> : null}{metadataError ? <button type="button" className="button" onClick={() => void refresh()}>Retry metadata</button> : null}<section className="db-explorer-shell">
      <aside className="db-sidebar"><div className="db-sidebar-heading"><strong>Databases</strong><span>{databases.length}</span><button aria-label="Refresh database metadata" className="icon-button" type="button" onClick={() => void refresh()}><RefreshCcw aria-hidden size={15} /></button></div><div className="db-tree">{databases.map((database) => <div className="db-tree-group" key={database}><button className={selectedDatabase === database ? "db-node selected" : "db-node"} onClick={() => selectStore(database, kind || stores[0]?.kind || "")} type="button"><Database size={14} aria-hidden /><strong>{database === "global" ? "Global" : database}</strong></button><div className="db-table-list">{stores.map((store) => <button className={kind === store.kind && selectedDatabase === database ? "db-table-node selected" : "db-table-node"} key={database + ":" + store.kind} onClick={() => selectStore(database, store.kind)} type="button"><span className="db-icon table">T</span><span>{store.kind}</span><small>{isSensitiveDatabaseStore(store.kind) ? <><LockKeyhole size={11} aria-hidden />Locked</> : store.recordCount ?? "-"}</small></button>)}</div></div>)}</div></aside>
      <section className="db-main">
        <div className="db-toolbar"><label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search rows" disabled={sensitiveLocked} onChange={(event) => { if (queryCurrent()) setSearchInput(event.target.value); }} placeholder="Search IDs and stored values" type="search" value={searchInput} /></label><Field label="Columns"><input value={columnFilter} onChange={(event) => setColumnFilter(event.target.value)} placeholder="Filter visible columns" /></Field><Field label="Sort"><select value={sort} onChange={(event) => { if (queryCurrent()) setSort(event.target.value as SortField); }}><option value="updated">Updated</option><option value="created">Created</option><option value="id">Record ID</option></select></Field><Field label="Direction"><select value={direction} onChange={(event) => { if (queryCurrent()) setDirection(event.target.value as "asc" | "desc"); }}><option value="desc">Descending</option><option value="asc">Ascending</option></select></Field><button aria-label="Refresh rows" className="icon-button" onClick={() => sensitiveLocked ? requestSensitiveRecheck() : void loadRecords()} title="Refresh rows" type="button"><RefreshCcw size={15} aria-hidden /></button></div>
        {!sensitiveLocked && records.rowsError ? <><VisualAlert tone="error" title="Rows could not be loaded" message={records.rowsError} /><button type="button" className="button" onClick={() => void loadRecords()}>Retry rows</button><p role="status">Previously confirmed rows, if shown, may be stale.</p></> : null}{searchInput.trim() !== search ? <p role="status">Waiting for the current search.</p> : null}{records.requestedOffset !== page.offset ? <p role="status">Requested page {Math.floor(records.requestedOffset / 50) + 1}. Showing confirmed page {pageNumber} until the request succeeds.</p> : null}{sensitiveLocked ? <section className="db-locked-state"><VisualAlert tone="warning" title="Sensitive store locked" message="Identity credentials and encrypted secrets never enter summary caches. Complete a fresh security check for a five-minute view grant." /><button className="button button-primary" onClick={requestSensitiveRecheck} type="button"><KeyRound size={14} aria-hidden />Authorize View</button></section> : <><div aria-busy={loading} className="db-grid-wrap">{hiddenColumnCount ? <div className="db-column-notice" role="status">Showing the first 30 matching columns. {hiddenColumnCount} more {hiddenColumnCount === 1 ? "column is" : "columns are"} available in record detail.</div> : null}<table className="db-grid" aria-label={`${kind || "Database"} records in ${selectedDatabase === "global" ? "Global" : selectedDatabase}`}><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{page.records.map((record) => <tr className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id}>{columns.map((column) => <td key={column}>{column === "id" ? <button className="link-button" onClick={() => void inspectRecord(record.id)} type="button">{record.id}</button> : formatDbCell(record.data?.[column])}</td>)}</tr>)}{!loading && records.page && !records.rowsError && !page.records.length ? <tr><td className="empty-cell" colSpan={Math.max(1, columns.length)}>{search ? "No rows match this search." : "This store has no rows."}</td></tr> : null}</tbody></table>{loading ? <LoadingState compact label="Loading rows" /> : null}</div><footer className="db-page-footer"><span>{page.total ? page.offset + 1 : 0}-{Math.min(page.total, page.offset + page.records.length)} of {page.total}</span><div className="inline-actions"><button aria-label="Previous page" className="icon-button" disabled={page.offset === 0 || loading} onClick={() => records.navigate(Math.max(0, page.offset - page.limit))} title="Previous page" type="button"><ChevronLeft size={15} aria-hidden /></button><span>Page {pageNumber} of {pageCount}</span><button aria-label="Next page" className="icon-button" disabled={page.offset + page.limit >= page.total || loading} onClick={() => records.navigate(page.offset + page.limit)} title="Next page" type="button"><ChevronRight size={15} aria-hidden /></button></div></footer></>}
      </section>
      <aside className="db-inspector"><div className="db-sidebar-heading"><strong>Record Detail</strong><span>{selectedRecord?.id ?? "none"}</span></div>{records.detailLoading ? <LoadingState compact label="Loading record detail" /> : records.detailError ? <><VisualAlert tone="error" title="Record detail unavailable" message={records.detailError} /><button type="button" className="button" onClick={() => void records.retryDetail()}>Retry detail</button></> : records.detailMissing ? <EmptyState compact title="Record not found" description="The selected record is no longer available." /> : selectedRecord ? <><KeyValue rows={[["ID", selectedRecord.id], ["Store", selectedRecord.kind], ["Database", selectedRecord.scope?.domainId ?? "global"], ["Created", formatTime(selectedRecord.createdAtMs)], ["Updated", formatTime(selectedRecord.updatedAtMs)]]} />{selectedData ? <div className="kv-explorer">{Object.entries(selectedData).map(([key, value]) => <div key={key}><span className="db-icon key">K</span><strong>{key}</strong><code>{formatDbCell(value)}</code></div>)}</div> : null}<details className="db-raw-record" key={rawGeneration} open={rawExpanded} onToggle={toggleRaw}><summary>Detailed JSON</summary>{rawExpanded ? <pre>{rawJson}</pre> : null}</details></> : <EmptyState compact title="No record selected" description="Choose a record ID to load its full detail." />}<StatusText value={status} />{grantValid && activeGrant ? <small className="db-grant-status">Sensitive grant expires in {formatGrantCountdown(activeGrant.expiresAtMs, nowMs)}</small> : null}</aside>
      {recheckOpen && targetPresent ? <Modal title="Authorize Sensitive Store" description={"Grant five minutes of access to " + kind + " in " + selectedDatabase + "."} onClose={dismissRecheck}>
        <VisualAlert tone="warning" title="Fresh recheck required" message="Encrypted and credential records remain excluded from summaries and browser caches until authorization succeeds." />
        {recheckError ? <VisualAlert tone="error" title="Authorization failed" message={recheckError} /> : null}
        <div aria-busy={recheckBusy} className="dialog-form">
          <Field label="Password" required><input autoComplete="current-password" data-autofocus disabled={recheckBusy} type="password" value={credentialRecheck.password} onChange={(event) => { if (targetCurrent() && recheckRef.current.epoch === recheckEpoch && !recheckRef.current.busy) setCredentialRecheck({ ...credentialRecheck, password: event.target.value }); }} /></Field>
          {currentUser.pinConfigured ? <Field label="PIN" required><input disabled={recheckBusy} inputMode="numeric" value={credentialRecheck.pin} onChange={(event) => { if (targetCurrent() && recheckRef.current.epoch === recheckEpoch && !recheckRef.current.busy) setCredentialRecheck({ ...credentialRecheck, pin: digits(event.target.value) }); }} /></Field> : null}
          {currentUser.totpEnabled ? <Field label="2FA code" required><input autoComplete="one-time-code" disabled={recheckBusy} inputMode="numeric" value={credentialRecheck.totp} onChange={(event) => { if (targetCurrent() && recheckRef.current.epoch === recheckEpoch && !recheckRef.current.busy) setCredentialRecheck({ ...credentialRecheck, totp: digits(event.target.value).slice(0, 6) }); }} /></Field> : null}
        </div>
        {recheckBusy ? <p role="status">Checking authorization...</p> : null}
        <div className="modal-actions"><button className="button" onClick={dismissRecheck} type="button">Cancel</button><button className="button button-primary" disabled={recheckBusy || !credentialRecheck.password || (currentUser.pinConfigured && credentialRecheck.pin.length < 4) || (currentUser.totpEnabled && credentialRecheck.totp.length !== 6)} onClick={() => void authorizeSensitiveStore()} type="button">Authorize for 5 Minutes</button></div>
      </Modal> : null}
    </section></>
  );
}

export function formatGrantCountdown(expiresAtMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + ":" + String(remainder).padStart(2, "0");
}
