"use client";

import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, FileText, FolderOpen, Menu, RefreshCcw, Search } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { DocumentationPage, DocumentationPageContent, DocsPageResponse, DocsSnapshotResponse } from "fluxiq/docs";
import { useProgramApi, type ApiResponse } from "../program-api";
import { Drawer, EmptyState, LoadingState, StatusText } from "../shared-ui";
import { buildDocumentationTree, docRouteKey, docsLinkCandidates, formatTime, normalizeDocPath, resolveDocsLink, sandboxedDocumentationHtml, shouldCollapseDocsFolder, type DocsTreeNode } from "./shared";

const DOCS_TREE_ROW_HEIGHT = 34;
const DOCS_TREE_OVERSCAN = 6;
type OutlineEntry = { id: string; label: string; level: number };
export type DocsVisibleRow = { node: DocsTreeNode; depth: number; parentPath?: string };

export function DocsLive() {
  const api = useProgramApi("docs");
  const [snapshot, setSnapshot] = useState<ApiResponse<DocsSnapshotResponse> | null>(null);
  const [activePageId, setActivePageId] = useState("");
  const [page, setPage] = useState<DocumentationPageContent | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sourceId, setSourceId] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setSnapshot(null);
    const result = await api.get<DocsSnapshotResponse>("snapshot", signal ? { signal } : {});
    if (!result.aborted) setSnapshot(result);
  }, [api]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const pages = snapshot?.payload?.pages ?? [];
  const sources = snapshot?.payload?.sources ?? [];
  const deferredSearch = useDeferredValue(search);
  const matchingPages = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase();
    return pages.filter((item) => (sourceId === "all" || item.sourceId === sourceId) && (!needle || (item.title + " " + docRouteKey(item) + " " + item.sourceId).toLocaleLowerCase().includes(needle)));
  }, [deferredSearch, pages, sourceId]);
  const docsTree = useMemo(() => buildDocumentationTree(matchingPages), [matchingPages]);
  const activePage = pages.find((item) => item.id === activePageId);

  useEffect(() => {
    if (!snapshot?.ok || !pages.length || activePageId) return;
    const requested = new URL(window.location.href).searchParams.get("doc");
    const key = requested ? normalizeDocPath(requested) : "";
    setActivePageId((pages.find((item) => item.id === requested || (key && docRouteKey(item) === key)) ?? pages[0])?.id ?? "");
  }, [activePageId, pages, snapshot?.ok]);

  useEffect(() => {
    const onPopState = () => {
      const requested = new URL(window.location.href).searchParams.get("doc");
      const key = requested ? normalizeDocPath(requested) : "";
      const selected = pages.find((item) => item.id === requested || (key && docRouteKey(item) === key));
      setActivePageId(selected?.id ?? pages[0]?.id ?? "");
      setExplorerOpen(false);
      setStatus("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pages]);

  useEffect(() => {
    if (!activePage?.id) { setPage(null); return; }
    const controller = new AbortController();
    setPageLoading(true); setPageError(""); setPage(null);
    void api.post<DocsPageResponse>("get-page", { pageId: activePage.id }, { signal: controller.signal }).then((result) => {
      if (result.aborted) return;
      setPageLoading(false);
      if (!result.ok) { setPageError(result.error ?? "The document could not be loaded."); return; }
      if (!result.payload) { setPageError("This page no longer exists. Rebuild the snapshot to refresh the index."); return; }
      setPage(result.payload);
    });
    return () => controller.abort();
  }, [activePage?.id, api]);

  async function rebuild() {
    setRebuilding(true); setStatus("Rebuilding documentation snapshot...");
    const result = await api.post<DocsSnapshotResponse>("rebuild", {});
    setRebuilding(false);
    if (!result.ok) { setStatus(result.error ?? "Documentation rebuild failed."); return; }
    setSnapshot({ ok: true, payload: result.payload! });
    setStatus("Documentation snapshot rebuilt.");
  }

  function selectPage(pageId: string, history: "push" | "none" = "push") {
    const selected = pages.find((item) => item.id === pageId);
    setActivePageId(pageId); setExplorerOpen(false); setStatus("");
    if (selected) {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", docRouteKey(selected));
      if (history === "push") window.history.pushState(window.history.state, "", url);
    }
  }

  function handleViewerClick(event: MouseEvent<HTMLElement>) {
    const anchor = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    const href = anchor?.getAttribute("href");
    if (!href || /^(https?:|mailto:)/i.test(href)) return;
    event.preventDefault();
    if (href.startsWith("#")) { scrollToHeading(href.slice(1), articleRef.current, frameRef.current); return; }
    const target = resolveDocsLink(activePage, href);
    const candidates = target ? docsLinkCandidates(target) : [];
    const match = pages.find((item) => candidates.includes(docRouteKey(item)));
    if (match) selectPage(match.id);
    else setStatus("That documentation link does not match a page in the current snapshot.");
  }

  const renderedHtml = useMemo(() => page ? decorateDocumentationHeadings(page.html) : "", [page]);
  const outline = useMemo(() => buildDocumentationOutline(page?.html ?? ""), [page?.html]);
  const explorer = <DocsExplorer activePageId={activePage?.id} busy={search !== deferredSearch} docsTree={docsTree} matchingCount={matchingPages.length} onRefresh={() => void refresh()} onRebuild={() => void rebuild()} onSearch={setSearch} onSelect={selectPage} onSource={setSourceId} pages={pages} rebuilding={rebuilding} search={search} selectedSource={sourceId} sources={sources} />;

  if (!snapshot) return <LoadingState label="Loading documentation" detail="Reading source and page metadata." />;
  if (!snapshot.ok) return <EmptyState title="Documentation unavailable" description={snapshot.error ?? "The documentation snapshot could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="docs-program-layout">
      {!isNarrow ? explorer : null}
      <section className="docs-viewer-panel">
        <header className="docs-viewer-header"><button aria-label="Open documentation explorer" className="icon-button docs-explorer-trigger" onClick={() => setExplorerOpen(true)} title="Open documentation explorer" type="button"><Menu aria-hidden size={16} /></button><div><h2 className="panel-title">{page?.title ?? activePage?.title ?? "Documentation"}</h2><p className="panel-kicker">{page?.routePath ?? activePage?.routePath ?? "Select a documentation file"}</p></div><span className="program-chip">Updated {formatTime(snapshot.payload?.generatedAtMs)}</span></header>
        {rebuilding ? <LoadingState compact label="Rebuilding documentation" detail="Scanning sources and regenerating runtime pages." /> : null}
        {snapshot.payload?.warnings?.length ? <details className="docs-warning-list"><summary><AlertTriangle aria-hidden size={14} />{snapshot.payload.warnings.length} rebuild warning{snapshot.payload.warnings.length === 1 ? "" : "s"}</summary><ul>{snapshot.payload.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
        <div className="docs-document-region">
          {pageLoading ? <LoadingState label="Loading document" {...(activePage?.title ? { detail: activePage.title } : {})} /> : null}
          {pageError ? <EmptyState title="Document unavailable" description={pageError} action={<button className="button" onClick={() => void rebuild()} type="button">Rebuild Snapshot</button>} /> : null}
          {!pageLoading && !pageError && page?.format === "html" ? <iframe className="docs-rendered docs-html-frame" ref={frameRef} sandbox="allow-same-origin" srcDoc={sandboxedDocumentationHtml(renderedHtml)} title={page.title ?? "Documentation"} /> : null}
          {!pageLoading && !pageError && page && page.format !== "html" ? <article className="docs-rendered" onClick={handleViewerClick} ref={articleRef} dangerouslySetInnerHTML={{ __html: renderedHtml }} /> : null}
          {!pageLoading && !pageError && !page ? <EmptyState compact icon={<BookOpen aria-hidden size={20} />} title="No document selected" description="Choose a page from the documentation explorer." /> : null}
        </div>
        <StatusText value={status} />
      </section>
      <aside className="docs-outline-panel"><strong>On this page</strong>{outline.length ? <nav aria-label="Document outline">{outline.map((item) => <button className={"docs-outline-link level-" + item.level} key={item.id} onClick={() => scrollToHeading(item.id, articleRef.current, frameRef.current)} type="button">{item.label}</button>)}</nav> : <p className="muted-text">No headings in this document.</p>}</aside>
      {isNarrow && explorerOpen ? <Drawer className="docs-explorer-drawer" onClose={() => setExplorerOpen(false)} side="left" title="Documentation Explorer">{explorer}</Drawer> : null}
    </section>
  );
}

function DocsExplorer(props: { activePageId: string | undefined; busy: boolean; docsTree: DocsTreeNode; matchingCount: number; pages: DocumentationPage[]; rebuilding: boolean; search: string; selectedSource: string; sources: DocsSnapshotResponse["sources"]; onRefresh(): void; onRebuild(): void; onSearch(value: string): void; onSelect(pageId: string): void; onSource(sourceId: string): void }) {
  return <aside aria-busy={props.busy || undefined} className="docs-explorer-panel">
    <div className="docs-explorer-header"><div><h2 className="panel-title">Documentation</h2><p className="panel-kicker">{props.pages.length} indexed pages</p></div><div className="inline-actions"><button aria-label="Refresh documentation" className="icon-button" onClick={props.onRefresh} title="Refresh documentation" type="button"><RefreshCcw aria-hidden size={15} /></button><button className="button button-primary" disabled={props.rebuilding} onClick={props.onRebuild} type="button">Rebuild</button></div></div>
    <label className="program-search-field docs-search"><Search aria-hidden size={14} /><input aria-label="Search documentation" onChange={(event) => props.onSearch(event.target.value)} placeholder="Search titles and paths" type="search" value={props.search} /></label>
    <nav aria-label="Documentation sources" className="docs-source-list"><button aria-pressed={props.selectedSource === "all"} className={props.selectedSource === "all" ? "selected" : ""} onClick={() => props.onSource("all")} type="button"><span>All sources</span><small>{props.pages.length}</small></button>{props.sources.map((source) => <button aria-pressed={props.selectedSource === source.id} className={props.selectedSource === source.id ? "selected" : ""} key={source.id} onClick={() => props.onSource(source.id)} type="button"><span>{source.title}</span><small>{props.pages.filter((page) => page.sourceId === source.id).length}</small></button>)}</nav>
    <div className="docs-tree-summary"><span>{props.matchingCount} matching page{props.matchingCount === 1 ? "" : "s"}</span><small>Only visible navigation rows are mounted.</small></div>
    {props.matchingCount ? <VirtualDocsTree activePageId={props.activePageId} root={props.docsTree} onSelect={props.onSelect} /> : <EmptyState compact title="No matching pages" description="Change the source or search text." />}
  </aside>;
}

function VirtualDocsTree(props: { activePageId: string | undefined; root: DocsTreeNode; onSelect(pageId: string): void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpandedDocsPaths(props.root));
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const rows = useMemo(() => flattenDocumentationTree(props.root, expanded), [expanded, props.root]);
  const activePath = rows.find((row) => row.node.page?.id === props.activePageId)?.node.path;
  const [focusedPath, setFocusedPath] = useState(activePath ?? rows[0]?.node.path ?? "");

  useEffect(() => setExpanded((current) => mergeExpandedDocsPaths(current, props.root)), [props.root]);
  useEffect(() => {
    if (activePath) setFocusedPath(activePath);
    else if (!rows.some((row) => row.node.path === focusedPath)) setFocusedPath(rows[0]?.node.path ?? "");
  }, [activePath, focusedPath, rows]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportHeight(viewport.clientHeight || 420);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / DOCS_TREE_ROW_HEIGHT) - DOCS_TREE_OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / DOCS_TREE_ROW_HEIGHT) + DOCS_TREE_OVERSCAN);
  const visible = rows.slice(start, end);

  function focusRow(index: number) {
    const bounded = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[bounded];
    if (!row) return;
    setFocusedPath(row.node.path);
    const viewport = viewportRef.current;
    if (viewport) {
      const top = bounded * DOCS_TREE_ROW_HEIGHT;
      if (top < viewport.scrollTop) viewport.scrollTop = top;
      else if (top + DOCS_TREE_ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = top + DOCS_TREE_ROW_HEIGHT - viewport.clientHeight;
    }
    requestAnimationFrame(() => viewportRef.current?.querySelector<HTMLButtonElement>(`[data-doc-path="${CSS.escape(row.node.path)}"]`)?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: DocsVisibleRow) {
    const index = rows.findIndex((item) => item.node.path === row.node.path);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : event.key === "ArrowUp" ? index - 1 : index + 1);
      return;
    }
    if (event.key === "ArrowRight" && row.node.children.length) {
      event.preventDefault();
      if (!expanded.has(row.node.path)) setExpanded((current) => new Set(current).add(row.node.path));
      else focusRow(index + 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      if (row.node.children.length && expanded.has(row.node.path)) {
        event.preventDefault();
        setExpanded((current) => { const next = new Set(current); next.delete(row.node.path); return next; });
      } else if (row.parentPath) {
        event.preventDefault();
        focusRow(rows.findIndex((item) => item.node.path === row.parentPath));
      }
    }
  }

  return <div aria-label="Documentation files" className="docs-file-tree docs-file-tree-virtual" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} ref={viewportRef} role="tree">
    <div style={{ height: rows.length * DOCS_TREE_ROW_HEIGHT, position: "relative" }}>
      {visible.map((row, visibleIndex) => {
        const index = start + visibleIndex;
        const folder = row.node.children.length > 0;
        const open = folder && expanded.has(row.node.path);
        const selected = row.node.page?.id === props.activePageId;
        const siblings = rows.filter((item) => item.parentPath === row.parentPath && item.depth === row.depth);
        return <button
          aria-expanded={folder ? open : undefined}
          aria-level={row.depth + 1}
          aria-posinset={siblings.findIndex((item) => item.node.path === row.node.path) + 1}
          aria-selected={folder ? undefined : selected}
          aria-setsize={siblings.length}
          className={folder ? "docs-tree-folder-label" : selected ? "docs-tree-file selected" : "docs-tree-file"}
          data-doc-path={row.node.path}
          key={row.node.path}
          onClick={() => folder ? setExpanded((current) => { const next = new Set(current); if (next.has(row.node.path)) next.delete(row.node.path); else next.add(row.node.path); return next; }) : row.node.page && props.onSelect(row.node.page.id)}
          onFocus={() => setFocusedPath(row.node.path)}
          onKeyDown={(event) => onKeyDown(event, row)}
          role="treeitem"
          style={{ height: DOCS_TREE_ROW_HEIGHT, left: 0, paddingLeft: 8 + row.depth * 16, position: "absolute", right: 0, top: index * DOCS_TREE_ROW_HEIGHT }}
          tabIndex={focusedPath === row.node.path ? 0 : -1}
          type="button"
        >{folder ? open ? <ChevronDown aria-hidden size={14} /> : <ChevronRight aria-hidden size={14} /> : <FileText aria-hidden size={14} />}{folder ? <FolderOpen aria-hidden size={15} /> : null}<span>{row.node.name}</span></button>;
      })}
    </div>
  </div>;
}

export function flattenDocumentationTree(root: DocsTreeNode, expanded: ReadonlySet<string>): DocsVisibleRow[] {
  const rows: DocsVisibleRow[] = [];
  const visit = (nodes: DocsTreeNode[], depth: number, parentPath?: string) => {
    for (const node of nodes) {
      rows.push({ node, depth, ...(parentPath ? { parentPath } : {}) });
      if (node.children.length && expanded.has(node.path)) visit(node.children, depth + 1, node.path);
    }
  };
  visit(root.children, 0);
  return rows;
}

function defaultExpandedDocsPaths(root: DocsTreeNode): Set<string> {
  const expanded = new Set<string>();
  const visit = (nodes: DocsTreeNode[]) => nodes.forEach((node) => {
    if (node.children.length && !shouldCollapseDocsFolder(node)) { expanded.add(node.path); visit(node.children); }
  });
  visit(root.children);
  return expanded;
}

function mergeExpandedDocsPaths(current: ReadonlySet<string>, root: DocsTreeNode): Set<string> {
  const available = new Set<string>();
  const visit = (nodes: DocsTreeNode[]) => nodes.forEach((node) => { available.add(node.path); visit(node.children); });
  visit(root.children);
  const next = new Set([...current].filter((path) => available.has(path)));
  for (const path of defaultExpandedDocsPaths(root)) next.add(path);
  return next;
}

export function buildDocumentationOutline(html: string): OutlineEntry[] {
  const entries: OutlineEntry[] = []; const used = new Map<string, number>();
  for (const match of html.matchAll(/<h([1-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi)) {
    const label = stripHtml(match[2] ?? "").trim(); if (!label) continue;
    const base = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    const count = used.get(base) ?? 0; used.set(base, count + 1);
    entries.push({ id: count ? base + "-" + (count + 1) : base, label, level: Number(match[1]) });
  }
  return entries;
}

export function decorateDocumentationHeadings(html: string): string {
  const outline = buildDocumentationOutline(html); let index = 0;
  return html.replace(/<h([1-4])(?:\s[^>]*)?>/gi, (tag) => { const entry = outline[index++]; return entry ? tag.replace(/>$/, ' id="' + entry.id + '">') : tag; });
}

function stripHtml(value: string): string {
  const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  return value.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity).replace(/\s+/g, " ");
}

function scrollToHeading(id: string, article: HTMLElement | null, frame: HTMLIFrameElement | null) {
  article?.querySelector<HTMLElement>("#" + CSS.escape(id))?.scrollIntoView({ block: "start" });
  try { frame?.contentDocument?.getElementById(id)?.scrollIntoView({ block: "start" }); } catch { /* Older browsers may isolate sandboxed HTML. */ }
}

function moveTreeFocus(event: KeyboardEvent<HTMLButtonElement>): boolean {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
  const tree = event.currentTarget.closest('[role="tree"]'); if (!tree) return false;
  const items = [...tree.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')].filter((item) => item.offsetParent !== null);
  const index = items.indexOf(event.currentTarget);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(items.length - 1, index + 1);
  event.preventDefault(); items[next]?.focus(); return true;
}
