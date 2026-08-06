"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { DatabaseManagerSnapshotResponse, RecordEnvelope } from "fluxiq/database-manager";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";


export function DatabaseManagerLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("database-manager");
  const [snapshot, setSnapshot] = useState<ApiResponse<DatabaseManagerSnapshotResponse> | null>(null);
  const [records, setRecords] = useState<RecordEnvelope[]>([]);
  const [kind, setKind] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<RecordEnvelope | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState("global");
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [status, setStatus] = useState("");
  const [credentialRecheck, setCredentialRecheck] = useState({ password: "", pin: "", totp: "" });
  const [authorizedStores, setAuthorizedStores] = useState<string[]>([]);
  const [recheckOpen, setRecheckOpen] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.get<DatabaseManagerSnapshotResponse>("snapshot");
    setSnapshot(next);
    const firstKind = next.payload?.stores?.[0]?.kind ?? "";
    setKind((current) => current || firstKind);
  }, [api]);
  const loadRecords = useCallback(async (storeKind = kind, authorization?: typeof credentialRecheck) => {
    if (!storeKind) return;
    const sensitive = isSensitiveDatabaseStore(storeKind);
    if (sensitive) {
      const authorized = authorizedStores.includes(sensitiveStoreKey(storeKind, selectedDatabase));
      if (!authorized) {
        setRecords([]);
        setSelectedRecord(null);
        setStatus("");
        setRecheckOpen(true);
        return;
      }
      if (!authorization) return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post<RecordEnvelope[]>("list-records", {
      kind: storeKind,
      scope,
      ...(sensitive && authorization ? {
        authorizationPassword: authorization.password,
        authorizationPin: authorization.pin,
        authorizationTotp: authorization.totp
      } : {})
    });
    if (!result.ok) {
      setRecords([]);
      setSelectedRecord(null);
      setStatus(result.error ?? "Unable to load records.");
      return;
    }
    setStatus("");
    setRecords(result.payload ?? []);
  }, [api, kind, selectedDatabase, authorizedStores]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => void loadRecords(), [loadRecords]);

  async function inspectRecord(id: string) {
    if (isSensitiveDatabaseStore(kind)) {
      setSelectedRecord(records.find((record) => record.id === id) ?? null);
      return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post<RecordEnvelope | null>("get-record", {
      kind,
      id,
      scope
    });
    if (!result.ok) {
      setStatus(result.error ?? "Unable to inspect record.");
      setSelectedRecord(null);
      return;
    }
    setSelectedRecord(result.payload ?? null);
  }

  async function authorizeSensitiveStore() {
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post<RecordEnvelope[]>("list-records", {
      kind,
      scope,
      authorizationPassword: credentialRecheck.password,
      authorizationPin: credentialRecheck.pin,
      authorizationTotp: credentialRecheck.totp
    });
    if (!result.ok) {
      setStatus(result.error ?? "Recheck failed.");
      return;
    }
    setAuthorizedStores((items) => [...new Set([...items, sensitiveStoreKey(kind, selectedDatabase)])]);
    setRecheckOpen(false);
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setStatus("");
    setRecords(result.payload ?? []);
  }

  function requestSensitiveRecheck() {
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setRecheckOpen(true);
  }

  function selectStore(database: string, storeKind: string) {
    setSelectedDatabase(database);
    setKind(storeKind);
    setSelectedRecord(null);
    setRecords([]);
    setStatus("");
    if (isSensitiveDatabaseStore(storeKind)) {
      setRecheckOpen(true);
    }
  }

  const stores = snapshot?.payload?.stores ?? [];
  const databases: string[] = snapshot?.payload?.databases?.length ? snapshot.payload.databases : ["global"];
  const columns = useMemo(() => {
    const keys = new Set<string>(["id"]);
    for (const record of records) {
      for (const key of Object.keys(record.data ?? {})) keys.add(key);
    }
    return [...keys].filter((column) => !columnFilter || column.toLowerCase().includes(columnFilter.toLowerCase()));
  }, [records, columnFilter]);
  const visibleRows = records.filter((record) => {
    const haystack = `${record.id} ${JSON.stringify(record.data ?? {})}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });
  const selectedData = selectedRecord?.data ?? null;
  const sensitiveLocked = isSensitiveDatabaseStore(kind) && !authorizedStores.includes(sensitiveStoreKey(kind, selectedDatabase));

  return (
    <section className="db-explorer-shell">
      <aside className="db-sidebar">
        <div className="db-sidebar-heading"><strong>Databases</strong><span>{databases.length}</span></div>
        <div className="db-tree">
          {databases.map((database) => (
            <div className="db-tree-group" key={database}>
              <button className={selectedDatabase === database ? "db-node selected" : "db-node"} onClick={() => setSelectedDatabase(database)} type="button"><span className="db-icon">DB</span><strong>{database === "global" ? "Global" : database}</strong></button>
              <div className="db-table-list">
                {stores.map((store) => (
                  <button className={kind === store.kind && selectedDatabase === database ? "db-table-node selected" : "db-table-node"} key={`${database}:${store.kind}`} onClick={() => selectStore(database, store.kind)} type="button"><span className="db-icon table">T</span>{store.kind}<small>{isSensitiveDatabaseStore(store.kind) ? "Locked" : store.recordCount}</small></button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="db-main">
        <div className="db-toolbar">
          <Field label="Search rows"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IDs and values" /></Field>
          <Field label="Filter columns"><input value={columnFilter} onChange={(event) => setColumnFilter(event.target.value)} placeholder="Column name" /></Field>
          <button className="button" onClick={() => sensitiveLocked || isSensitiveDatabaseStore(kind) ? requestSensitiveRecheck() : void loadRecords()} type="button">Refresh</button>
        </div>
        {sensitiveLocked ? <section className="db-locked-state">
          <VisualAlert tone="warning" title="Credential store locked" message="This table contains identity credential records and requires a fresh security check." />
          <button className="button button-primary" onClick={requestSensitiveRecheck} type="button">Authorize View</button>
        </section> : <div className="db-grid-wrap">
          <table className="db-grid">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((record) => (
                <tr className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id} onClick={() => void inspectRecord(record.id)}>
                  {columns.map((column) => <td key={column}>{column === "id" ? record.id : formatDbCell(record.data?.[column])}</td>)}
                </tr>
              ))}
              {!visibleRows.length ? <tr><td className="empty-cell" colSpan={Math.max(1, columns.length)}>No rows found.</td></tr> : null}
            </tbody>
          </table>
        </div>}
      </main>
      <aside className="db-inspector">
        <div className="db-sidebar-heading"><strong>Inspector</strong><span>{selectedRecord?.id ?? "none"}</span></div>
        {selectedRecord ? <KeyValue rows={[["ID", selectedRecord.id], ["Table", selectedRecord.kind], ["Database", selectedRecord.scope?.domainId ?? "global"], ["Created", formatTime(selectedRecord.createdAtMs)], ["Updated", formatTime(selectedRecord.updatedAtMs)]]} /> : <p className="muted-text">Select a row to inspect its keys and values.</p>}
        {selectedData ? <div className="kv-explorer">{Object.entries(selectedData).map(([key, value]) => <div key={key}><span className="db-icon key">K</span><strong>{key}</strong><code>{formatDbCell(value)}</code></div>)}</div> : null}
        <StatusText value={status} />
      </aside>
      {recheckOpen ? <Modal title="Authorize Credential Store" onClose={() => setRecheckOpen(false)}>
        <VisualAlert tone="warning" title="Fresh recheck required" message="Enter your active security factors before viewing identity credential records." />
        <Field label="Password"><input autoFocus type="password" value={credentialRecheck.password} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, password: event.target.value })} /></Field>
        {currentUser.pinConfigured ? <Field label="PIN"><input value={credentialRecheck.pin} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="2FA code"><input value={credentialRecheck.totp} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRecheckOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialRecheck.password || (currentUser.pinConfigured && credentialRecheck.pin.length < 4) || (currentUser.totpEnabled && credentialRecheck.totp.length !== 6)} onClick={() => void authorizeSensitiveStore()} type="button">Authorize View</button></div>
      </Modal> : null}
    </section>
  );
}
