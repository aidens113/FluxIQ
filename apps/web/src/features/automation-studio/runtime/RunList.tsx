"use client";

import { StatusBadge } from "../../programs/shared-ui";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import type { RunHistoryQuery } from "./run-queries";
import { formatRuntimeDuration, formatRuntimeTimestamp } from "./run-format";
export function RunList(props: {
  sessions: any[];
  page: { limit: number; offset: number; total: number };
  query: RunHistoryQuery;
  searchDraft: string;
  loading: boolean;
  error: string;
  onOpenLog(runId: string): void;
  onPage(offset: number): void;
  onQuery(patch: Partial<RunHistoryQuery>): void;
  onRetry(): void;
  onSearchDraft(value: string): void;
  onSubmitSearch(): void;
}) {
  const nextOffset = props.page.offset + props.page.limit;
  const previousOffset = Math.max(0, props.page.offset - props.page.limit);
  const lastOffset = props.page.total ? Math.floor((props.page.total - 1) / props.page.limit) * props.page.limit : 0;
  const rangeStart = props.page.total ? props.page.offset + 1 : 0;
  const rangeEnd = Math.min(props.page.total, props.page.offset + props.sessions.length);
  const statusCounts = props.sessions.reduce((counts, session) => {
    const status = String(session.status ?? "queued");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const sortValue = `${props.query.sort}:${props.query.direction}`;
  const updateSort = (value: string) => {
    const [sort, direction] = value.split(":") as [RunHistoryQuery["sort"], RunHistoryQuery["direction"]];
    props.onQuery({ sort, direction });
  };
  return (
    <section className="automation-runtime-list-page">
      <form className="automation-runtime-run-filters" onSubmit={(event) => { event.preventDefault(); props.onSubmitSearch(); }}>
        <label className="automation-runtime-run-search">
          <span>Find a run</span>
          <span className="automation-runtime-run-search-field"><Search aria-hidden size={15} /><input aria-label="Find a run" onChange={(event) => props.onSearchDraft(event.target.value)} placeholder="Run ID or Flow ID" type="search" value={props.searchDraft} /></span>
        </label>
        <button className="button" disabled={props.loading} type="submit">Search</button>
        <label>
          <span>Status</span>
          <select onChange={(event) => props.onQuery({ status: event.target.value })} value={props.query.status}>
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select onChange={(event) => updateSort(event.target.value)} value={sortValue}>
            <option value="updated:desc">Recently updated</option>
            <option value="updated:asc">Least recently updated</option>
            <option value="started:desc">Newest start</option>
            <option value="started:asc">Oldest start</option>
            <option value="duration:desc">Longest duration</option>
            <option value="duration:asc">Shortest duration</option>
            <option value="actions:desc">Most actions</option>
            <option value="status:asc">Status A-Z</option>
          </select>
        </label>
        {props.query.search || props.query.status ? <button className="button" onClick={() => { props.onSearchDraft(""); props.onQuery({ search: "", status: "" }); }} type="button">Clear</button> : null}
        <span className="automation-runtime-run-results" aria-label="Visible run status summary">{props.loading ? "Loading runs..." : `${rangeStart}-${rangeEnd} of ${props.page.total} runs`} · {statusCounts.succeeded ?? 0} passed · {statusCounts.failed ?? 0} failed</span>
      </form>
      {props.error ? <div className="automation-runtime-inline-error" role="alert"><span>{props.error}</span><button className="button" onClick={props.onRetry} type="button">Retry</button></div> : null}
      <div className="automation-runtime-run-list" aria-busy={props.loading}>
        <div className="automation-runtime-run-header" aria-hidden="true">
          <span>Run</span>
          <span>Status</span>
          <span>Started</span>
          <span>Duration</span>
          <span>Activity</span>
        </div>
        {props.sessions.map((session) => (
          <article
            className="automation-runtime-run-row"
            key={session.runId ?? `${session.targetId}:${session.queuedAt}`}
            onClick={() => session.runId ? props.onOpenLog(session.runId) : undefined}
            onKeyDown={(event) => {
              if (!session.runId || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              props.onOpenLog(session.runId);
            }}
            role="button"
            tabIndex={session.runId ? 0 : -1}
          >
            <strong title={session.runId ?? "Run"}>{session.runId ?? "Run"}</strong>
            <StatusBadge value={session.status ?? "queued"} />
            <span>{formatRuntimeTimestamp(session.startedAt ?? session.queuedAt)}</span>
            <span>{formatRuntimeDuration(session.startedAt, session.finishedAt)}</span>
            <span>{session.actionAttemptCount ?? session.attemptCount ?? 0} actions · {session.effectCount ?? 0} effects</span>
          </article>
        ))}
        {!props.sessions.length && !props.loading ? <p className="automation-runtime-empty">{props.query.search || props.query.status ? "No runs match these filters." : "No runtime sessions have been started for this project."}</p> : null}
      </div>
      <footer className="automation-runtime-pagination-footer">
        <label><span>Rows</span><select aria-label="Rows per page" onChange={(event) => props.onQuery({ limit: Number(event.target.value) })} value={props.query.limit}>{[10, 25, 50, 100].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select></label>
        <div className="automation-runtime-pagination" aria-label="Run history pages">
          <button aria-label="First page" disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(0)} title="First page" type="button"><ChevronsLeft aria-hidden size={15} /></button>
          <button aria-label="Previous page" disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(previousOffset)} title="Previous page" type="button"><ChevronLeft aria-hidden size={15} /></button>
          <span>Page {props.page.total ? Math.floor(props.page.offset / props.page.limit) + 1 : 0} of {props.page.total ? Math.ceil(props.page.total / props.page.limit) : 0}</span>
          <button aria-label="Next page" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} title="Next page" type="button"><ChevronRight aria-hidden size={15} /></button>
          <button aria-label="Last page" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(lastOffset)} title="Last page" type="button"><ChevronsRight aria-hidden size={15} /></button>
        </div>
      </footer>
    </section>
  );
}
