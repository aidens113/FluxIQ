"use client";

import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, FileText, FolderOpen, Menu, RefreshCcw, Search } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { DocumentationPage, DocumentationPageContent, DocsPageResponse, DocsSnapshotResponse } from "fluxiq/docs";
import { useProgramApi, type ApiResponse } from "../program-api";
import { Drawer, EmptyState, LoadingState, StatusText } from "../shared-ui";
import { buildDocumentationTree, docRouteKey, docsLinkCandidates, formatTime, normalizeDocPath, resolveDocsLink, sandboxedDocumentationHtml, shouldCollapseDocsFolder, type DocsTreeNode } from "./shared";

const TREE_PAGE_LIMIT = 1000;
type OutlineEntry = { id: string; label: string; level: number };

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
  const requestRef = useRef(0);
  const articleRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const refresh = useCallback(async () => {
    setSnapshot(null);
    setSnapshot(await api.get<DocsSnapshotResponse>("snapshot"));
  }, [api]);
  useEffect(() => void refresh(), [refresh]);
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
  const visiblePages = useMemo(() => matchingPages.slice(0, TREE_PAGE_LIMIT), [matchingPages]);
  const docsTree = useMemo(() => buildDocumentationTree(visiblePages), [visiblePages]);
  const activePage = pages.find((item) => item.id === activePageId);

  useEffect(() => {
    if (!snapshot?.ok || !pages.length || activePageId) return;
    const requested = new URL(window.location.href).searchParams.get("doc");
    const key = requested ? normalizeDocPath(requested) : "";
    setActivePageId((pages.find((item) => item.id === requested || (key && docRouteKey(item) === key)) ?? pages[0])?.id ?? "");
  }, [activePageId, pages, snapshot?.ok]);

  useEffect(() => {
    if (!activePage?.id) { setPage(null); return; }
    const requestId = ++requestRef.current;
    setPageLoading(true); setPageError(""); setPage(null);
    void api.post<DocsPageResponse>("get-page", { pageId: activePage.id }).then((result) => {
      if (requestId !== requestRef.current) return;
      setPageLoading(false);
      if (!result.ok) { setPageError(result.error ?? "The document could not be loaded."); return; }
      if (!result.payload) { setPageError("This page no longer exists. Rebuild the snapshot to refresh the index."); return; }
      setPage(result.payload);
    });
  }, [activePage?.id, api]);

  async function rebuild() {
    setRebuilding(true); setStatus("Rebuilding documentation snapshot...");
    const result = await api.post<DocsSnapshotResponse>("rebuild", {});
    setRebuilding(false);
    if (!result.ok) { setStatus(result.error ?? "Documentation rebuild failed."); return; }
    setSnapshot({ ok: true, payload: result.payload! });
    setStatus("Documentation snapshot rebuilt.");
  }

  function selectPage(pageId: string) {
    const selected = pages.find((item) => item.id === pageId);
    setActivePageId(pageId); setExplorerOpen(false); setStatus("");
    if (selected) {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", docRouteKey(selected));
      window.history.replaceState(window.history.state, "", url);
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
  const explorer = <DocsExplorer activePageId={activePage?.id} busy={search !== deferredSearch} docsTree={docsTree} hiddenCount={matchingPages.length - visiblePages.length} matchingCount={matchingPages.length} onRefresh={() => void refresh()} onRebuild={() => void rebuild()} onSearch={setSearch} onSelect={selectPage} onSource={setSourceId} pages={pages} rebuilding={rebuilding} search={search} selectedSource={sourceId} sources={sources} />;

  if (!snapshot) return <LoadingState label="Loading documentation" detail="Reading source and page metadata." />;
  if (!snapshot.ok) return <EmptyState title="Documentation unavailable" description={snapshot.error ?? "The documentation snapshot could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="docs-program-layout">
      {!isNarrow ? explorer : null}
      <main className="docs-viewer-panel">
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
      </main>
      <aside className="docs-outline-panel"><strong>On this page</strong>{outline.length ? <nav aria-label="Document outline">{outline.map((item) => <button className={"docs-outline-link level-" + item.level} key={item.id} onClick={() => scrollToHeading(item.id, articleRef.current, frameRef.current)} type="button">{item.label}</button>)}</nav> : <p className="muted-text">No headings in this document.</p>}</aside>
      {isNarrow && explorerOpen ? <Drawer className="docs-explorer-drawer" onClose={() => setExplorerOpen(false)} side="left" title="Documentation Explorer">{explorer}</Drawer> : null}
    </section>
  );
}

function DocsExplorer(props: { activePageId: string | undefined; busy: boolean; docsTree: DocsTreeNode; hiddenCount: number; matchingCount: number; pages: DocumentationPage[]; rebuilding: boolean; search: string; selectedSource: string; sources: DocsSnapshotResponse["sources"]; onRefresh(): void; onRebuild(): void; onSearch(value: string): void; onSelect(pageId: string): void; onSource(sourceId: string): void }) {
  return <aside aria-busy={props.busy || undefined} className="docs-explorer-panel">
    <div className="docs-explorer-header"><div><h2 className="panel-title">Documentation</h2><p className="panel-kicker">{props.pages.length} indexed pages</p></div><div className="inline-actions"><button aria-label="Refresh documentation" className="icon-button" onClick={props.onRefresh} title="Refresh documentation" type="button"><RefreshCcw aria-hidden size={15} /></button><button className="button button-primary" disabled={props.rebuilding} onClick={props.onRebuild} type="button">Rebuild</button></div></div>
    <label className="program-search-field docs-search"><Search aria-hidden size={14} /><input aria-label="Search documentation" onChange={(event) => props.onSearch(event.target.value)} placeholder="Search titles and paths" type="search" value={props.search} /></label>
    <nav aria-label="Documentation sources" className="docs-source-list"><button aria-pressed={props.selectedSource === "all"} className={props.selectedSource === "all" ? "selected" : ""} onClick={() => props.onSource("all")} type="button"><span>All sources</span><small>{props.pages.length}</small></button>{props.sources.map((source) => <button aria-pressed={props.selectedSource === source.id} className={props.selectedSource === source.id ? "selected" : ""} key={source.id} onClick={() => props.onSource(source.id)} type="button"><span>{source.title}</span><small>{props.pages.filter((page) => page.sourceId === source.id).length}</small></button>)}</nav>
    <div className="docs-tree-summary"><span>{props.matchingCount} matching page{props.matchingCount === 1 ? "" : "s"}</span>{props.hiddenCount > 0 ? <small>Showing first {TREE_PAGE_LIMIT}; refine search to reach {props.hiddenCount} more.</small> : null}</div>
    {props.matchingCount ? <div aria-label="Documentation files" className="docs-file-tree" role="tree">{props.docsTree.children.map((node) => <DocsTreeNodeView activePageId={props.activePageId} depth={0} key={node.path} node={node} onSelect={props.onSelect} />)}</div> : <EmptyState compact title="No matching pages" description="Change the source or search text." />}
  </aside>;
}

function DocsTreeNodeView(props: { node: DocsTreeNode; activePageId: string | undefined; depth: number; onSelect(pageId: string): void }) {
  const [open, setOpen] = useState(() => !shouldCollapseDocsFolder(props.node));
  const hasChildren = props.node.children.length > 0;
  const selected = props.node.page?.id === props.activePageId;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (moveTreeFocus(event)) return;
    if (event.key === "ArrowRight" && hasChildren) { event.preventDefault(); if (!open) setOpen(true); else window.setTimeout(() => event.currentTarget.closest(".docs-tree-folder")?.querySelector<HTMLButtonElement>(".docs-tree-children [role=treeitem]")?.focus()); }
    else if (event.key === "ArrowLeft" && hasChildren && open) { event.preventDefault(); setOpen(false); }
  };
  if (props.node.page && !hasChildren) return <button aria-level={props.depth + 1} aria-selected={selected} className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page!.id)} onKeyDown={onKeyDown} role="treeitem" tabIndex={selected ? 0 : -1} type="button"><FileText aria-hidden size={14} /><span>{props.node.name}</span></button>;
  return <section className="docs-tree-folder" role="none"><button aria-expanded={open} aria-level={props.depth + 1} className="docs-tree-folder-label" onClick={() => setOpen((value) => !value)} onKeyDown={onKeyDown} role="treeitem" tabIndex={props.depth === 0 && !props.activePageId ? 0 : -1} type="button">{open ? <ChevronDown aria-hidden size={14} /> : <ChevronRight aria-hidden size={14} />}<FolderOpen aria-hidden size={15} /><span>{props.node.name}</span></button>{open ? <div className="docs-tree-children" role="group">{props.node.page ? <button aria-level={props.depth + 2} aria-selected={selected} className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page!.id)} onKeyDown={onKeyDown} role="treeitem" tabIndex={selected ? 0 : -1} type="button"><FileText aria-hidden size={14} /><span>{props.node.page.title}</span></button> : null}{props.node.children.map((child) => <DocsTreeNodeView activePageId={props.activePageId} depth={props.depth + 1} key={child.path} node={child} onSelect={props.onSelect} />)}</div> : null}</section>;
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
