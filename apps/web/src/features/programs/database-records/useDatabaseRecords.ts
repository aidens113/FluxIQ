"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DatabaseManagerSnapshotResponse, RecordEnvelope } from "fluxiq/database-manager";
import type { useProgramApi } from "../program-api";

type Query = { kind: string; database: string; search: string; sort: "updated" | "created" | "id"; direction: "asc" | "desc" };
type Page = { records: RecordEnvelope[]; total: number; limit: number; offset: number };
type Options = { api: ReturnType<typeof useProgramApi>; owner: object; query: Query; authority: object | null; ready: boolean; authorized(): boolean; grantId?: string; expiresAtMs?: number };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const validMetadata = (value: unknown): value is DatabaseManagerSnapshotResponse => object(value) && Array.isArray(value.stores) && value.stores.every((store) => object(store) && typeof store.kind === "string" && Boolean(store.kind)) && Array.isArray(value.databases) && value.databases.every((database) => typeof database === "string" && Boolean(database));
const validRecord = (value: unknown, query: Query, id?: string): value is RecordEnvelope => object(value) && typeof value.id === "string" && Boolean(value.id) && (!id || value.id === id) && value.kind === query.kind && object(value.data) && (value.scope === undefined || object(value.scope)) && (object(value.scope) ? value.scope.domainId ?? "global" : "global") === query.database;
const validPage = (value: unknown, query: Query, offset: number): value is Page => object(value) && value.limit === 50 && value.offset === offset && Number.isInteger(value.total) && Number(value.total) >= 0 && Array.isArray(value.records) && value.records.length <= 50 && value.records.length <= Number(value.total) && value.records.every((record) => validRecord(record, query)) && new Set(value.records.map((record) => record.id)).size === value.records.length;

/** Read-only browsing lifecycle. Grants/credentials and authorization remain in the view. */
export function useDatabaseRecords(options: Options) {
  const { api, owner, query, authority, ready, expiresAtMs } = options;
  const latest = useRef(options); latest.current = options;
  const mounted = useRef(false);
  const work = useRef({ metadata: { epoch: 0, controller: null as AbortController | null }, rows: { epoch: 0, controller: null as AbortController | null }, detail: { epoch: 0, controller: null as AbortController | null } });
  const [metadata, setMetadata] = useState({ owner, data: null as DatabaseManagerSnapshotResponse | null, loading: true, error: "" });
  const metadataRef = useRef(metadata); metadataRef.current = metadata;
  const [navigation, setNavigation] = useState({ query, offset: 0 });
  const requestedOffset = navigation.query === query ? navigation.offset : 0;
  const requested = useRef({ query, offset: requestedOffset }); requested.current = { query, offset: requestedOffset };
  const [rows, setRows] = useState({ owner, query, authority, page: null as Page | null, loading: false, error: "" });
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const [detail, setDetail] = useState({ owner, query, authority, id: "", record: null as RecordEnvelope | null, loading: false, error: "", missing: false });
  const selectedId = useRef("");
  const blockedAuthority = useRef<object | null>(null);
  const ownerCurrent = () => mounted.current && latest.current.owner === owner && latest.current.api === api;
  const queryCurrent = () => ownerCurrent() && latest.current.query === query && latest.current.authority === authority;
  const canRead = () => queryCurrent() && (authority === null || blockedAuthority.current !== authority) && latest.current.ready && latest.current.authorized() && (latest.current.expiresAtMs === undefined || latest.current.expiresAtMs > Date.now()) && metadataRef.current.owner === owner && Boolean(metadataRef.current.data?.stores.some((store) => store.kind === query.kind)) && Boolean((metadataRef.current.data?.databases.length ? metadataRef.current.data.databases : ["global"]).includes(query.database));
  const cancel = (channel: keyof typeof work.current) => { const job = work.current[channel]; ++job.epoch; job.controller?.abort(); job.controller = null; };
  const clearDetail = () => { cancel("detail"); selectedId.current = ""; setDetail({ owner, query, authority, id: "", record: null, loading: false, error: "", missing: false }); };
  const denyAuthority = () => { blockedAuthority.current = authority; cancel("rows"); clearDetail(); const next = { owner, query, authority, page: null, loading: false, error: "" }; rowsRef.current = next; setRows(next); };

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel("metadata"); cancel("rows"); cancel("detail"); }; }, [owner]);
  const refreshMetadata = useCallback(async () => {
    if (!ownerCurrent()) return;
    cancel("metadata"); const job = work.current.metadata, epoch = job.epoch; const controller = new AbortController(); job.controller = controller;
    const current = () => ownerCurrent() && epoch === job.epoch && !controller.signal.aborted;
    setMetadata((previous) => ({ owner, data: previous.owner === owner ? previous.data : null, loading: true, error: "" }));
    try {
      await Promise.resolve(); if (!current()) return;
      const result = await api.get<DatabaseManagerSnapshotResponse>("snapshot", { signal: controller.signal });
      if (!current()) return;
      if (!result.ok || !validMetadata(result.payload)) { setMetadata((previous) => ({ ...previous, error: "Database metadata could not be loaded. Retry metadata." })); return; }
      const next = { owner, data: result.payload, loading: false, error: "" }; metadataRef.current = next; setMetadata(next);
    } catch { if (current()) setMetadata((previous) => ({ ...previous, error: "Database metadata could not be loaded. Retry metadata." })); }
    finally { if (current()) setMetadata((previous) => ({ ...previous, loading: false })); }
  }, [api, owner]);
  useEffect(() => { void refreshMetadata(); return () => cancel("metadata"); }, [refreshMetadata]);

  const refreshRows = useCallback(async () => {
    if (!canRead() || requested.current.query !== query || requested.current.offset !== requestedOffset) return;
    cancel("rows"); const job = work.current.rows, epoch = job.epoch; const controller = new AbortController(); job.controller = controller;
    const current = () => canRead() && epoch === job.epoch && !controller.signal.aborted;
    setRows((previous) => ({ owner, query, authority, page: previous.owner === owner && previous.query === query && previous.authority === authority ? previous.page : null, loading: true, error: "" }));
    try {
      await Promise.resolve(); if (!current()) return;
      const result = await api.post<Page>("list-records", { kind: query.kind, scope: query.database === "global" ? {} : { domainId: query.database }, limit: 50, offset: requestedOffset, search: query.search, sort: query.sort, direction: query.direction, ...(options.grantId ? { grantId: options.grantId } : {}) }, { signal: controller.signal });
      if (!current()) return;
      if (!result.ok && authority && (result.status === 403 || result.requiresRecheck || /authorization|expired/i.test(result.error ?? ""))) { denyAuthority(); return; }
      if (!result.ok || !validPage(result.payload, query, requestedOffset)) { setRows((previous) => ({ ...previous, error: "Rows could not be loaded. Retry rows." })); return; }
      if (result.payload.offset > 0 && result.payload.offset >= result.payload.total) { const offset = Math.max(0, Math.ceil(result.payload.total / 50) - 1) * 50; requested.current = { query, offset }; setNavigation({ query, offset }); return; }
      const next = { owner, query, authority, page: result.payload, loading: false, error: "" }; rowsRef.current = next; setRows(next);
      if (selectedId.current && !result.payload.records.some((record) => record.id === selectedId.current)) clearDetail();
    } catch { if (current()) setRows((previous) => ({ ...previous, error: "Rows could not be loaded. Retry rows." })); }
    finally { if (current()) setRows((previous) => ({ ...previous, loading: false })); }
  }, [api, owner, query, authority, requestedOffset, ready, metadata.data]);
  useEffect(() => {
    if (!canRead()) { cancel("rows"); clearDetail(); const next = { owner, query, authority, page: null, loading: false, error: "" }; rowsRef.current = next; setRows(next); return; }
    void refreshRows(); return () => cancel("rows");
  }, [refreshRows]);
  useEffect(() => { clearDetail(); return () => cancel("detail"); }, [owner, query, authority, ready]);
  useEffect(() => {
    if (expiresAtMs === undefined) return;
    const expire = () => { if (!queryCurrent()) return; cancel("rows"); clearDetail(); const next = { owner, query, authority, page: null, loading: false, error: "" }; rowsRef.current = next; setRows(next); };
    const timer = setTimeout(expire, Math.max(0, expiresAtMs - Date.now())); return () => clearTimeout(timer);
  }, [owner, query, authority, expiresAtMs]);

  const confirmedPage = rows.owner === owner && rows.query === query && rows.authority === authority && canRead() ? rows.page : null;
  const inspectRecord = useCallback(async (id: string) => {
    if (!canRead() || rowsRef.current.page !== confirmedPage || !confirmedPage?.records.some((record) => record.id === id)) return;
    cancel("detail"); selectedId.current = id;
    const job = work.current.detail, epoch = job.epoch; const controller = new AbortController(); job.controller = controller;
    const current = () => canRead() && selectedId.current === id && epoch === job.epoch && !controller.signal.aborted;
    setDetail({ owner, query, authority, id, record: null, loading: true, error: "", missing: false });
    try {
      await Promise.resolve(); if (!current()) return;
      const result = await api.post<RecordEnvelope | null>("get-record", { kind: query.kind, id, scope: query.database === "global" ? {} : { domainId: query.database }, ...(options.grantId ? { grantId: options.grantId } : {}) }, { signal: controller.signal });
      if (!current()) return;
      if (!result.ok && authority && (result.status === 403 || result.requiresRecheck || /authorization|expired/i.test(result.error ?? ""))) { denyAuthority(); return; }
      if (!result.ok || (result.payload !== null && !validRecord(result.payload, query, id))) { setDetail((previous) => ({ ...previous, error: "Record detail could not be loaded. Retry detail." })); return; }
      setDetail({ owner, query, authority, id, record: result.payload, loading: false, error: "", missing: result.payload === null });
    } catch { if (current()) setDetail((previous) => ({ ...previous, error: "Record detail could not be loaded. Retry detail." })); }
    finally { if (current()) setDetail((previous) => ({ ...previous, loading: false })); }
  }, [api, owner, query, authority, confirmedPage]);
  const retryDetail = useCallback(() => selectedId.current === detail.id ? inspectRecord(detail.id) : Promise.resolve(), [detail.id, inspectRecord]);
  const navigate = useCallback((offset: number) => {
    if (!canRead() || rowsRef.current.page !== confirmedPage || !confirmedPage || !Number.isInteger(offset) || offset < 0 || requested.current.offset !== confirmedPage.offset) return;
    clearDetail(); requested.current = { query, offset }; setNavigation({ query, offset });
  }, [owner, query, authority, confirmedPage]);
  const dataCurrent = queryCurrent() && canRead();
  return {
    metadata: metadata.owner === owner ? metadata.data : null, metadataLoading: metadata.owner === owner ? metadata.loading : true, metadataError: metadata.owner === owner ? metadata.error : "", refreshMetadata,
    page: confirmedPage, requestedOffset, loading: dataCurrent && (rows.query !== query || rows.authority !== authority || rows.loading), rowsError: dataCurrent && rows.query === query && rows.authority === authority ? rows.error : "", refreshRows, navigate,
    authorizationLost: authority !== null && blockedAuthority.current === authority,
    selectedRecord: dataCurrent && detail.query === query && detail.authority === authority ? detail.record : null, detailLoading: dataCurrent && detail.query === query && detail.authority === authority && detail.loading,
    detailError: dataCurrent && detail.query === query && detail.authority === authority ? detail.error : "", detailMissing: dataCurrent && detail.query === query && detail.authority === authority && detail.missing, inspectRecord, retryDetail
  };
}
