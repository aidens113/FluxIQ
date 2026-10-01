"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocumentationPageContent, DocsSnapshotResponse } from "fluxiq/docs";
import type { useProgramApi } from "../program-api";

type Api = ReturnType<typeof useProgramApi>;
type Options = { api: Api; isOwner(): boolean; requestedPage(pages: DocsSnapshotResponse["pages"]): string };
const SNAPSHOT_ERROR = "The documentation snapshot could not be loaded. Try again.";
const PAGE_ERROR = "The document could not be loaded. Try again.";
const REBUILD_ERROR = "Documentation rebuild failed. Try again.";
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";
const identity = (v: unknown): v is string => string(v) && v.length > 0;
function validPage(v: unknown): boolean {
 return object(v) && identity(v.id) && identity(v.sourceId) && string(v.title) && string(v.path) && (v.routePath === undefined || string(v.routePath)) && (v.updatedAtMs === undefined || typeof v.updatedAtMs === "number" && Number.isFinite(v.updatedAtMs));
}
function validSnapshot(v: unknown): v is DocsSnapshotResponse {
 return object(v) && Array.isArray(v.pages) && v.pages.every(validPage) && new Set(v.pages.map(p => p.id)).size === v.pages.length && Array.isArray(v.sources) && v.sources.every(s => object(s) && identity(s.id) && string(s.title)) && Array.isArray(v.warnings) && v.warnings.every(string) && typeof v.generatedAtMs === "number" && Number.isFinite(v.generatedAtMs) && typeof v.generatedPages === "number" && Number.isFinite(v.generatedPages);
}
function validContent(v: unknown, id: string): v is DocumentationPageContent {
 return validPage(v) && object(v) && v.id === id && string(v.html) && string(v.format) && ["markdown", "html", "json", "text"].includes(v.format);
}

/** Owns confirmed documentation reads and explicit rebuilds for one API workspace. */
export function useDocumentationWorkspace({ api, isOwner, requestedPage }: Options) {
 const [snapshot, setSnapshot] = useState<DocsSnapshotResponse | null>(null);
 const [activePageId, setActivePageId] = useState("");
 const [pageState, setPage] = useState<{ id: string; value: DocumentationPageContent } | null>(null);
 const [snapshotLoading, setSnapshotLoading] = useState(false);
 const [snapshotError, setSnapshotError] = useState("");
 const [pageLoading, setPageLoading] = useState(false);
 const [pageError, setPageError] = useState("");
 const [pageMissing, setPageMissing] = useState(false);
 const [rebuilding, setRebuilding] = useState(false);
 const [status, setStatus] = useState("");
 const [revision, setRevision] = useState(0);
 const mounted = useRef(false), metadata = useRef(snapshot), selected = useRef(activePageId);
 const read = useRef<{ id: number; controller: AbortController } | null>(null);
 const detail = useRef<{ id: number; controller: AbortController } | null>(null);
 const mutation = useRef<number | null>(null), sequence = useRef(0);
 const current = useCallback(() => mounted.current && isOwner(), [isOwner]);
 useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; read.current?.controller.abort(); detail.current?.controller.abort(); read.current = null; detail.current = null; mutation.current = null; }; }, []);
 const clearDetail = useCallback(() => {
  detail.current?.controller.abort(); detail.current = null;
  setPage(null); setPageLoading(false); setPageError(""); setPageMissing(false);
 }, []);
 const selectPage = useCallback((id: string) => {
  if (!current() || !metadata.current?.pages.some(p => p.id === id)) return false;
  if (selected.current !== id) { selected.current = id; clearDetail(); setActivePageId(id); }
  return true;
 }, [current, clearDetail]);
 const accept = useCallback((value: DocsSnapshotResponse, reload: boolean) => {
  metadata.current = value; setSnapshot(value); setSnapshotError("");
  const id = value.pages.some(p => p.id === selected.current) ? selected.current : requestedPage(value.pages) || value.pages[0]?.id || "";
  if (id !== selected.current || !id) { selected.current = id; clearDetail(); setActivePageId(id); }
  if (reload && id) { clearDetail(); setRevision(v => v + 1); }
 }, [clearDetail, requestedPage]);
 const refresh = useCallback(async () => {
  if (!current() || read.current || mutation.current !== null) return;
  const request = { id: ++sequence.current, controller: new AbortController() }; read.current = request;
  setSnapshotLoading(true); setSnapshotError("");
  try {
   const result = await api.get<DocsSnapshotResponse>("snapshot", { signal: request.controller.signal });
   if (!current() || read.current !== request || request.controller.signal.aborted) return;
   if (!result.aborted && result.ok && validSnapshot(result.payload)) accept(result.payload, false);
   else setSnapshotError(SNAPSHOT_ERROR);
  } catch { if (current() && read.current === request && !request.controller.signal.aborted) setSnapshotError(SNAPSHOT_ERROR); }
  finally { if (current() && read.current === request) { read.current = null; setSnapshotLoading(false); } }
 }, [api, current, accept]);
 useEffect(() => { void refresh(); }, [refresh]);
 const loadPage = useCallback(async (id: string) => {
  if (!current() || !id || selected.current !== id || detail.current) return;
  const request = { id: ++sequence.current, controller: new AbortController() }; detail.current = request;
  setPageLoading(true); setPageError(""); setPageMissing(false);
  try {
   const result = await api.post<DocumentationPageContent | null>("get-page", { pageId: id }, { signal: request.controller.signal });
   if (!current() || selected.current !== id || detail.current !== request || request.controller.signal.aborted) return;
   if (result.aborted) { setPageError(PAGE_ERROR); return; }
   if (result.ok && result.payload === null) { setPageMissing(true); setPageError("This page no longer exists. Rebuild the snapshot to refresh the index."); }
   else if (!result.ok || !validContent(result.payload, id)) setPageError(PAGE_ERROR);
   else setPage({ id, value: result.payload });
  } catch { if (current() && selected.current === id && detail.current === request && !request.controller.signal.aborted) setPageError(PAGE_ERROR); }
  finally { if (current() && detail.current === request) { detail.current = null; setPageLoading(false); } }
 }, [api, current]);
 useEffect(() => { if (activePageId) void loadPage(activePageId); return () => { detail.current?.controller.abort(); detail.current = null; }; }, [activePageId, revision, loadPage]);
 const retryPage = useCallback(() => { if (current() && selected.current === activePageId) return loadPage(activePageId); }, [activePageId, current, loadPage]);
 const rebuild = useCallback(async () => {
  if (!current() || mutation.current !== null) return;
  const id = ++sequence.current; mutation.current = id;
  read.current?.controller.abort(); read.current = null; setSnapshotLoading(false);
  setRebuilding(true); setStatus("Rebuilding documentation snapshot...");
  try {
   const result = await api.post<DocsSnapshotResponse>("rebuild", {});
   if (!current() || mutation.current !== id) return;
   if (!result.aborted && result.ok && validSnapshot(result.payload)) { accept(result.payload, true); setStatus("Documentation snapshot rebuilt."); }
   else setStatus(REBUILD_ERROR);
  } catch { if (current() && mutation.current === id) setStatus(REBUILD_ERROR); }
  finally { if (current() && mutation.current === id) { mutation.current = null; setRebuilding(false); } }
 }, [api, current, accept]);
 return { snapshot, activePageId, page: pageState?.id === activePageId ? pageState.value : null, snapshotLoading, snapshotError, pageLoading, pageError, pageMissing, rebuilding, status, selectPage, refresh, retryPage, rebuild, current };
}
