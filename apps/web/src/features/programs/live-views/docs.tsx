"use client";

import { AlertTriangle, BookOpen, Menu, RefreshCcw, Search } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DocumentationPage, DocsSnapshotResponse } from "fluxiq/docs";
import { useProgramApi } from "../program-api";
import { VirtualDocumentationTree } from "../documentation-tree";
export { flattenDocumentationTree, type DocsVisibleRow } from "../documentation-tree";
import { useDocumentationWorkspace } from "../documentation-workspace";
import { Drawer, EmptyState, LoadingState, StatusText } from "../shared-ui";
import { buildDocumentationTree, docRouteKey, docsLinkCandidates, formatTime, normalizeDocPath, resolveDocsLink, sandboxedDocumentationHtml, type DocsTreeNode } from "./shared";

type OutlineEntry = { id: string; label: string; level: number };

export function DocsLive() {
  const api = useProgramApi("docs");
  const owner = useRef({ api, key: 0 });
  if (owner.current.api !== api) owner.current = { api, key: owner.current.key + 1 };
  const isOwner = useCallback(() => owner.current.api === api, [api]);
  return <DocsWorkspace key={owner.current.key} api={api} isOwner={isOwner} />;
}

function DocsWorkspace({ api, isOwner }: { api: ReturnType<typeof useProgramApi>; isOwner(): boolean }) {
  const requestedPage = useCallback((pages: DocumentationPage[]) => {
    const requested = new URL(window.location.href).searchParams.get("doc");
    const key = requested ? normalizeDocPath(requested) : "";
    return pages.find(item => item.id === requested || (key && docRouteKey(item) === key))?.id ?? "";
  }, []);
  const workspace = useDocumentationWorkspace({ api, isOwner, requestedPage });
  const { snapshot, activePageId, page, pageLoading, pageError, rebuilding, refresh, rebuild } = workspace;
  const [sourceId, setSourceId] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isNarrow, setIsNarrow] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const pages = snapshot?.pages ?? [];
  const sources = snapshot?.sources ?? [];
  const deferredSearch = useDeferredValue(search);
  const matchingPages = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase();
    return pages.filter((item) => (sourceId === "all" || item.sourceId === sourceId) && (!needle || (item.title + " " + docRouteKey(item) + " " + item.sourceId).toLocaleLowerCase().includes(needle)));
  }, [deferredSearch, pages, sourceId]);
  const docsTree = useMemo(() => buildDocumentationTree(matchingPages), [matchingPages]);
  const activePage = pages.find((item) => item.id === activePageId);
  const presentation = useRef({ pages, activePageId });
  presentation.current = { pages, activePageId };

  useEffect(() => {
    const onPopState = () => {
      const requested = new URL(window.location.href).searchParams.get("doc");
      const key = requested ? normalizeDocPath(requested) : "";
      const selected = pages.find((item) => item.id === requested || (key && docRouteKey(item) === key));
      if (!workspace.current()) return;
      workspace.selectPage(selected?.id ?? pages[0]?.id ?? "");
      setExplorerOpen(false);
      setStatus("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pages, workspace.current, workspace.selectPage]);

  function selectPage(pageId: string, history: "push" | "none" = "push") {
    if (presentation.current.pages !== pages) return;
    const selected = pages.find((item) => item.id === pageId);
    if (!workspace.selectPage(pageId)) return;
    setExplorerOpen(false); setStatus("");
    if (selected) {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", docRouteKey(selected));
      if (history === "push") window.history.pushState(window.history.state, "", url);
    }
  }

  function handleViewerClick(event: MouseEvent<HTMLElement>) {
    if (!workspace.current() || presentation.current.pages !== pages || presentation.current.activePageId !== activePageId) return;
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
  const explorer = <DocsExplorer activePageId={activePage?.id} busy={search !== deferredSearch || workspace.snapshotLoading} docsTree={docsTree} matchingCount={matchingPages.length} onRefresh={() => void refresh()} onRebuild={() => void rebuild()} onSearch={value => { if (workspace.current()) setSearch(value); }} onSelect={selectPage} onSource={value => { if (workspace.current()) setSourceId(value); }} pages={pages} refreshing={workspace.snapshotLoading} rebuilding={rebuilding} search={search} selectedSource={sourceId} sources={sources} />;

  if (!snapshot && !workspace.snapshotError) return <LoadingState label="Loading documentation" detail="Reading source and page metadata." />;
  if (!snapshot) return <EmptyState title="Documentation unavailable" description={workspace.snapshotError} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="docs-program-layout">
      {!isNarrow ? explorer : null}
      <section className="docs-viewer-panel">
        <header className="docs-viewer-header"><button aria-label="Open documentation explorer" className="icon-button docs-explorer-trigger" onClick={() => setExplorerOpen(true)} title="Open documentation explorer" type="button"><Menu aria-hidden size={16} /></button><div><h2 className="panel-title">{page?.title ?? activePage?.title ?? "Documentation"}</h2><p className="panel-kicker">{page?.routePath ?? activePage?.routePath ?? "Select a documentation file"}</p></div><span className="program-chip">Updated {formatTime(snapshot.generatedAtMs)}</span></header>
        {workspace.snapshotError ? <EmptyState compact title="Documentation refresh failed" description={workspace.snapshotError} action={<button className="button" onClick={() => void refresh()} type="button">Retry snapshot</button>} /> : null}
        {rebuilding ? <LoadingState compact label="Rebuilding documentation" detail="Scanning sources and regenerating runtime pages." /> : null}
        {snapshot.warnings?.length ? <details className="docs-warning-list"><summary><AlertTriangle aria-hidden size={14} />{snapshot.warnings.length} rebuild warning{snapshot.warnings.length === 1 ? "" : "s"}</summary><ul>{snapshot.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
        <div className="docs-document-region">
          {pageLoading ? <LoadingState label="Loading document" {...(activePage?.title ? { detail: activePage.title } : {})} /> : null}
          {pageError ? <EmptyState title="Document unavailable" description={pageError} action={<div className="inline-actions"><button className="button" onClick={() => void workspace.retryPage()} disabled={pageLoading} type="button">Retry document</button>{workspace.pageMissing ? <button className="button" disabled={rebuilding} onClick={() => void rebuild()} type="button">Rebuild Snapshot</button> : null}</div>} /> : null}
          {!pageLoading && !pageError && page?.format === "html" ? <iframe className="docs-rendered docs-html-frame" ref={frameRef} sandbox="allow-same-origin" srcDoc={sandboxedDocumentationHtml(renderedHtml)} title={page.title ?? "Documentation"} /> : null}
          {!pageLoading && !pageError && page && page.format !== "html" ? <article className="docs-rendered" onClick={handleViewerClick} ref={articleRef} dangerouslySetInnerHTML={{ __html: renderedHtml }} /> : null}
          {!pageLoading && !pageError && !page ? <EmptyState compact icon={<BookOpen aria-hidden size={20} />} title="No document selected" description="Choose a page from the documentation explorer." /> : null}
        </div>
        {workspace.status ? <p role={workspace.status.startsWith("Documentation rebuild failed") ? "alert" : "status"}>{workspace.status}</p> : null}
        <StatusText value={workspace.status} />
        <StatusText value={status} />
      </section>
      <aside className="docs-outline-panel"><strong>On this page</strong>{outline.length ? <nav aria-label="Document outline">{outline.map((item) => <button className={"docs-outline-link level-" + item.level} key={item.id} onClick={() => scrollToHeading(item.id, articleRef.current, frameRef.current)} type="button">{item.label}</button>)}</nav> : <p className="muted-text">No headings in this document.</p>}</aside>
      {isNarrow && explorerOpen ? <Drawer className="docs-explorer-drawer" onClose={() => setExplorerOpen(false)} side="left" title="Documentation Explorer">{explorer}</Drawer> : null}
    </section>
  );
}

function DocsExplorer(props: { activePageId: string | undefined; busy: boolean; docsTree: DocsTreeNode; matchingCount: number; pages: DocumentationPage[]; refreshing: boolean; rebuilding: boolean; search: string; selectedSource: string; sources: DocsSnapshotResponse["sources"]; onRefresh(): void; onRebuild(): void; onSearch(value: string): void; onSelect(pageId: string): void; onSource(sourceId: string): void }) {
  return <aside aria-busy={props.busy || undefined} className="docs-explorer-panel">
    <div className="docs-explorer-header"><div><h2 className="panel-title">Documentation</h2><p className="panel-kicker">{props.pages.length} indexed pages</p></div><div className="inline-actions"><button aria-label="Refresh documentation" disabled={props.refreshing || props.rebuilding} className="icon-button" onClick={props.onRefresh} title="Refresh documentation" type="button"><RefreshCcw aria-hidden size={15} /></button><button className="button button-primary" disabled={props.rebuilding} onClick={props.onRebuild} type="button">Rebuild</button></div></div>
    <label className="program-search-field docs-search"><Search aria-hidden size={14} /><input aria-label="Search documentation" onChange={(event) => props.onSearch(event.target.value)} placeholder="Search titles and paths" type="search" value={props.search} /></label>
    <nav aria-label="Documentation sources" className="docs-source-list"><button aria-pressed={props.selectedSource === "all"} className={props.selectedSource === "all" ? "selected" : ""} onClick={() => props.onSource("all")} type="button"><span>All sources</span><small>{props.pages.length}</small></button>{props.sources.map((source) => <button aria-pressed={props.selectedSource === source.id} className={props.selectedSource === source.id ? "selected" : ""} key={source.id} onClick={() => props.onSource(source.id)} type="button"><span>{source.title}</span><small>{props.pages.filter((page) => page.sourceId === source.id).length}</small></button>)}</nav>
    <div className="docs-tree-summary"><span>{props.matchingCount} matching page{props.matchingCount === 1 ? "" : "s"}</span></div>
    {props.matchingCount ? <VirtualDocumentationTree activePageId={props.activePageId} root={props.docsTree} onSelect={props.onSelect} /> : <EmptyState compact title={props.pages.length ? "No matching pages" : "No documentation indexed"} description={props.pages.length ? "Change the source or search text." : "Rebuild the snapshot to index documentation."} />}
  </aside>;
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
