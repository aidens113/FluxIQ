"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, CircleCheck, Info, RefreshCw, Search, X } from "lucide-react";
import { resolveProblemsHostState, type ProblemsViewHostProps } from "./problem-host";
import {
  collectAutomationProblems,
  pageAutomationProblems,
  PROBLEMS_PAGE_SIZE,
  type AutomationProblemFilter,
  type AutomationProblemScope,
  type AutomationProblemSeverity,
  type AutomationProblemViewItem
} from "./problem-model";

const severityOrder: readonly AutomationProblemSeverity[] = ["error", "warning", "info"];

export function ProblemsView(props: ProblemsViewHostProps) {
  const [filter, setFilter] = useState<AutomationProblemFilter>("all");
  const [scope, setScope] = useState<AutomationProblemScope>("project");
  const [query, setQuery] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const [selectedProblemKey, setSelectedProblemKey] = useState<string | null>(null);
  const collection = useMemo(() => collectAutomationProblems(props.problems), [props.problems]);
  const hostState = resolveProblemsHostState(props, props);
  const page = useMemo(() => pageAutomationProblems(collection.items, {
    currentObjectId: hostState.currentObject?.id ?? null,
    filter,
    query,
    scope,
    offset: pageOffset
  }), [collection.items, filter, hostState.currentObject?.id, pageOffset, query, scope]);
  const grouped = useMemo(() => groupProblemPage(page.items), [page.items]);

  useEffect(() => {
    if (selectedProblemKey && !collection.items.some((problem) => problem.problemKey === selectedProblemKey)) {
      setSelectedProblemKey(null);
    }
  }, [collection.items, selectedProblemKey]);
  useEffect(() => setPageOffset(0), [filter, scope, query, hostState.currentObject?.id]);

  const showStatePanel = hostState.status === "loading"
    || hostState.status === "error"
    || hostState.status === "permission-denied"
    || hostState.status === "stale";

  return (
    <section className="automation-problems-workspace" aria-busy={hostState.status === "loading"}>
      <header className="automation-problems-header">
        <div><AlertTriangle size={16} aria-hidden /><div><strong>Problems</strong><span>Validation, authoring, and runtime issues</span></div></div>
        <span aria-label={collection.items.length + " problems"}>{collection.items.length}</span>
      </header>

      {showStatePanel ? <ProblemsStatePanel
        canRefresh={hostState.canRequestValidation}
        message={hostState.message}
        onRefresh={props.onRequestValidation}
        status={hostState.status}
      /> : null}

      <div className="automation-problems-controls">
        <div aria-label="Problem scope" className="automation-problem-filters" role="group">
          <button aria-pressed={scope === "project"} onClick={() => setScope("project")} type="button">Whole project</button>
          <button aria-pressed={scope === "current"} disabled={!hostState.currentObject} onClick={() => setScope("current")} title={!hostState.currentObject ? "Select an object to filter its problems." : undefined} type="button">Current object</button>
        </div>
        <label className="automation-runtime-search">
          <Search aria-hidden size={15} />
          <span className="sr-only">Search problems</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search problems" type="search" value={query} />
          {query ? <button aria-label="Clear problem search" onClick={() => setQuery("")} type="button"><X aria-hidden size={14} /></button> : null}
        </label>
        <div aria-label="Problem severity" className="automation-problem-filters" role="toolbar">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")} type="button">All <span>{page.counts.error + page.counts.warning + page.counts.info}</span></button>
          <button aria-pressed={filter === "error"} onClick={() => setFilter("error")} type="button">Errors <span>{page.counts.error}</span></button>
          <button aria-pressed={filter === "warning"} onClick={() => setFilter("warning")} type="button">Warnings <span>{page.counts.warning}</span></button>
          <button aria-pressed={filter === "info"} onClick={() => setFilter("info")} type="button">Info <span>{page.counts.info}</span></button>
        </div>
      </div>

      {scope === "current" && hostState.currentObject ? <p className="automation-problems-scope">Showing problems for <strong>{hostState.currentObject.label}</strong></p> : null}
      {collection.truncated ? <p className="automation-problems-scope" role="status">Showing the highest-priority {collection.items.length.toLocaleString()} diagnostics from {collection.inputCount.toLocaleString()} received.</p> : null}

      {page.items.length ? <div aria-label="Current problems" className="automation-problem-groups">
        {[...grouped.entries()].map(([scopeLabel, severityGroups]) => <section className="automation-problem-group" key={scopeLabel}>
          <header><strong>{scopeLabel}</strong><span>{[...severityGroups.values()].reduce((total, entries) => total + entries.length, 0)}</span></header>
          {severityOrder.map((severity) => <ProblemSeverityGroup
            entries={severityGroups.get(severity) ?? []}
            key={severity}
            onOpenProblem={props.onOpenProblem}
            onSelect={setSelectedProblemKey}
            selectedProblemKey={selectedProblemKey}
            severity={severity}
          />)}
        </section>)}
      </div> : <ProblemsEmptyState hasAnyProblems={collection.items.length > 0} scope={scope} status={hostState.status} />}

      {page.filteredCount > PROBLEMS_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer">
        <span>{page.offset + 1}-{Math.min(page.filteredCount, page.offset + page.items.length)} of {page.filteredCount}</span>
        <div className="automation-runtime-pagination">
          <button disabled={page.offset <= 0} onClick={() => setPageOffset(Math.max(0, page.offset - PROBLEMS_PAGE_SIZE))} type="button"><ChevronLeft size={15} aria-hidden />Previous</button>
          <button disabled={page.offset + PROBLEMS_PAGE_SIZE >= page.filteredCount} onClick={() => setPageOffset(page.offset + PROBLEMS_PAGE_SIZE)} type="button">Next<ChevronRight size={15} aria-hidden /></button>
        </div>
      </footer> : null}
    </section>
  );
}

function ProblemsStatePanel(props: { status: string; message: string | null; canRefresh: boolean; onRefresh?: (() => void) | undefined }) {
  const Icon = props.status === "error" || props.status === "permission-denied" ? AlertCircle : props.status === "stale" ? AlertTriangle : RefreshCw;
  return <div className={"automation-settings-validation " + props.status} role={props.status === "error" ? "alert" : "status"}>
    <Icon aria-hidden size={16} />
    <div><strong>{stateTitle(props.status)}</strong>{props.message ? <span>{props.message}</span> : null}</div>
    {props.onRefresh ? <button disabled={!props.canRefresh} onClick={props.onRefresh} type="button"><RefreshCw aria-hidden size={14} />Validate again</button> : null}
  </div>;
}

function ProblemSeverityGroup(props: {
  severity: AutomationProblemSeverity;
  entries: readonly AutomationProblemViewItem[];
  selectedProblemKey: string | null;
  onSelect(problemKey: string): void;
  onOpenProblem?: ((problem: AutomationProblemViewItem["source"]) => void) | undefined;
}) {
  if (!props.entries.length) return null;
  return <div className={"automation-problem-severity-group " + props.severity}>
    <strong>{props.severity === "error" ? "Blocking errors" : props.severity === "warning" ? "Recommendations" : "Information"}</strong>
    <ul className="automation-problem-list">{props.entries.map((problem) => {
      const Icon = problem.severity === "error" ? AlertCircle : problem.severity === "warning" ? AlertTriangle : Info;
      return <li key={problem.problemKey}>
        <button aria-pressed={props.selectedProblemKey === problem.problemKey} className={props.selectedProblemKey === problem.problemKey ? "selected" : ""} onClick={() => { props.onSelect(problem.problemKey); props.onOpenProblem?.(problem.source); }} type="button">
          <Icon aria-hidden size={15} />
          <span><strong>{problem.label}</strong><small>{problem.message}</small><em><span>{problem.blocking ? "Blocking" : problem.severity === "warning" ? "Recommendation" : "Info"}</span>{problem.code}</em></span>
          {props.onOpenProblem ? <ChevronRight aria-hidden size={14} /> : null}
        </button>
      </li>;
    })}</ul>
  </div>;
}

function ProblemsEmptyState(props: { hasAnyProblems: boolean; scope: AutomationProblemScope; status: string }) {
  const title = props.status === "loading" ? "Checking for problems" : props.hasAnyProblems ? "No problems in this filter" : "No problems found";
  const detail = props.status === "loading"
    ? "Results will appear here when validation completes."
    : props.scope === "current"
      ? "The selected object has no matching problems."
      : props.hasAnyProblems
        ? "Choose another scope, severity, or search to review remaining issues."
        : "The current project snapshot and graph pass available checks.";
  return <div className="automation-problems-empty"><CircleCheck aria-hidden size={24} /><strong>{title}</strong><span>{detail}</span></div>;
}

function groupProblemPage(items: readonly AutomationProblemViewItem[]) {
  const grouped = new Map<string, Map<AutomationProblemSeverity, AutomationProblemViewItem[]>>();
  for (const problem of items) {
    const severityGroups = grouped.get(problem.scopeLabel) ?? new Map();
    const entries = severityGroups.get(problem.severity) ?? [];
    entries.push(problem);
    severityGroups.set(problem.severity, entries);
    grouped.set(problem.scopeLabel, severityGroups);
  }
  return grouped;
}

function stateTitle(status: string): string {
  if (status === "loading") return "Validating project";
  if (status === "error") return "Validation failed";
  if (status === "permission-denied") return "Validation unavailable";
  return "Results may be stale";
}

export * from "./problem-host";
export * from "./problem-model";
