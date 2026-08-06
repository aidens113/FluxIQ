"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { DocsPageResponse, DocsSnapshotResponse } from "fluxiq/docs";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";


export function DocsLive() {
  const api = useProgramApi("docs");
  const [snapshot, setSnapshot] = useState<ApiResponse<DocsSnapshotResponse> | null>(null);
  const [activePageId, setActivePageId] = useState("");
  const [page, setPage] = useState<DocsPageResponse>(null);
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get<DocsSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const pages = snapshot?.payload?.pages ?? [];
  const docsTree = useMemo(() => buildDocumentationTree(pages), [pages]);
  const activePage = pages.find((item) => item.id === activePageId) ?? pages[0];
  useEffect(() => {
    if (!activePage?.id) return;
    void api.post<DocsPageResponse>("get-page", { pageId: activePage.id }).then((result) => setPage(result.payload ?? null));
  }, [api, activePage?.id]);

  async function rebuild() {
    const result = await api.post("rebuild", {});
    setStatus(result.ok ? "Docs rebuilt" : result.error ?? "Rebuild failed");
    await refresh();
  }

  function selectLinkedPage(href: string): boolean {
    const target = resolveDocsLink(activePage, href);
    if (!target) return false;
    const candidates = docsLinkCandidates(target);
    const match = pages.find((item) => candidates.includes(docRouteKey(item)));
    if (!match) return false;
    setActivePageId(match.id);
    return true;
  }

  function handleViewerClick(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (selectLinkedPage(href)) {
      event.preventDefault();
    }
  }

  return (
    <section className="docs-program-layout">
      <aside className="docs-explorer-panel">
        <div className="docs-explorer-header">
          <div><h2 className="panel-title">Docs</h2><p className="panel-kicker">Authored documentation and runtime snapshots</p></div>
          <div className="inline-actions"><button className="button" onClick={refresh} type="button">Refresh</button><button className="button button-primary" onClick={rebuild} type="button">Rebuild Snapshot</button></div>
        </div>
        <div className="docs-sidebar-summary"><strong>{pages.length}</strong><span>docs files</span></div>
        <SummaryStrip items={[["Snapshot Pages", snapshot?.payload?.generatedPages ?? 0], ["Sources", snapshot?.payload?.sources?.length ?? 0], ["Warnings", snapshot?.payload?.warnings?.length ?? 0]]} />
        <div className="docs-file-tree">{docsTree.children.map((node) => <DocsTreeNodeView activePageId={activePage?.id} key={node.path} node={node} onSelect={setActivePageId} />)}</div>
      </aside>
      <main className="docs-viewer-panel">
        <div className="panel-heading">
          <div><h2 className="panel-title">{page?.title ?? "Viewer"}</h2><p className="panel-kicker">{page?.routePath ?? "Select a documentation file"}</p></div>
          <span className="program-chip">{formatTime(snapshot?.payload?.generatedAtMs)}</span>
        </div>
        {snapshot?.payload?.warnings?.length ? <details className="json-details"><summary>Warnings</summary><pre>{snapshot.payload.warnings.join("\n")}</pre></details> : null}
        {page?.format === "html" ? <iframe className="docs-rendered docs-html-frame" sandbox="" srcDoc={sandboxedDocumentationHtml(page.html)} title={page.title ?? "Documentation"} /> : null}
        {page && page.format !== "html" ? <article className="docs-rendered" onClick={handleViewerClick} dangerouslySetInnerHTML={{ __html: page.html }} /> : null}
        {!page ? <p className="muted-text">Select a page to view rendered documentation.</p> : null}
        <StatusText value={status} />
      </main>
    </section>
  );
}

function DocsTreeNodeView(props: { node: DocsTreeNode; activePageId: string | undefined; onSelect(pageId: string): void }) {
  const [open, setOpen] = useState(() => !shouldCollapseDocsFolder(props.node));
  const hasChildren = props.node.children.length > 0;
  const selected = props.node.page?.id === props.activePageId;
  if (props.node.page && !hasChildren) {
    return (
      <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page!.id)} type="button">
        <FileText size={14} aria-hidden />
        <span>{props.node.name}</span>
      </button>
    );
  }
  return (
    <section className="docs-tree-folder">
      <button className="docs-tree-folder-label" onClick={() => setOpen((value) => !value)} type="button">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <FolderOpen size={15} aria-hidden />
        <span>{props.node.name}</span>
      </button>
      {open ? <div className="docs-tree-children">
        {props.node.page ? <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page!.id)} type="button"><FileText size={14} aria-hidden /><span>{props.node.page.title}</span></button> : null}
        {props.node.children.map((child) => <DocsTreeNodeView activePageId={props.activePageId} key={child.path} node={child} onSelect={props.onSelect} />)}
      </div> : null}
    </section>
  );
}
