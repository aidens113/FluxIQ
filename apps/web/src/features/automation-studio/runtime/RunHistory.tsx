"use client";

import { useEffect, useRef, useState } from "react";
import { RunActionLogView } from "./RunActionLogView";
import { RunList } from "./RunList";
import { RUNTIME_RUN_PAGE_SIZE, type RunHistoryQuery } from "./run-queries";
import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { sortRuntimeRunsForDebugView } from "./run-detail-model";
import { useRuntimeDetailCommands, useRuntimeHistoryCommands, type RuntimeDetailCommands, type RuntimeHistoryCommands } from "./runtime-host";
export type RunHistoryProps = { projectId: string | null; initialSessions: any[]; flowId?: string; focusRunId?: string | null };

export function RunHistory(props: RunHistoryProps) {
  const historyCommands = useRuntimeHistoryCommands();
  const detailCommands = useRuntimeDetailCommands();
  return <RunHistoryViewContent {...props} detailCommands={detailCommands} historyCommands={historyCommands} />;
}

export function RunHistoryViewContent(props: RunHistoryProps & { historyCommands: RuntimeHistoryCommands; detailCommands: RuntimeDetailCommands }) {
  const [view, setView] = useState<"list" | "log">("list");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const initialRuns = runtimeRunsForHistory(props.initialSessions, props.flowId);
  const [runs, setRuns] = useState<any[]>(() => initialRuns);
  const [page, setPage] = useState({ limit: RUNTIME_RUN_PAGE_SIZE, offset: 0, total: initialRuns.length });
  const [query, setQuery] = useState<RunHistoryQuery>({ status: "", search: "", sort: "updated", direction: "desc", limit: RUNTIME_RUN_PAGE_SIZE });
  const [searchDraft, setSearchDraft] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [error, setError] = useState("");
  const runListRequestRef = useRef(0);
  useEffect(() => {
    runListRequestRef.current += 1;
    const nextRuns = runtimeRunsForHistory(props.initialSessions, props.flowId);
    setRuns(nextRuns);
    setPage({ limit: query.limit, offset: 0, total: nextRuns.length });
  }, [props.flowId, props.projectId]);
  useEffect(() => {
    if (!props.projectId) return;
    void loadRuns(0, query);
  }, [props.flowId, props.projectId, query.status, query.search, query.sort, query.direction, query.limit]);
  const loadRuns = async (offset: number, nextQuery: RunHistoryQuery = query, quiet = false) => {
    if (!props.projectId) return;
    const requestId = ++runListRequestRef.current;
    if (!quiet) setLoadingRuns(true);
    if (!quiet) setError("");
    const result = await props.historyCommands.listRuns({
      projectId: props.projectId,
      ...(props.flowId ? { flowId: props.flowId } : {}),
      ...(nextQuery.status ? { status: nextQuery.status } : {}),
      ...(nextQuery.search ? { search: nextQuery.search } : {}),
      sort: nextQuery.sort,
      direction: nextQuery.direction,
      limit: nextQuery.limit,
      offset
    });
    if (requestId !== runListRequestRef.current) return;
    setLoadingRuns(false);
    if (!result.ok) {
      if (!quiet) setError(result.error ?? "Runtime runs could not be loaded.");
      return;
    }
    setError("");
    const resultPage = result.payload?.page;
    setRuns(result.payload?.runs ?? resultPage?.runs ?? []);
    setPage({
      limit: resultPage?.limit ?? nextQuery.limit,
      offset: resultPage?.offset ?? offset,
      total: resultPage?.total ?? result.payload?.runs?.length ?? 0
    });
  };
  useEffect(() => {
    if (!props.projectId || view !== "list") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadRuns(page.offset, query, true);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const unsubscribe = subscribeToAutomationStudioMutations(
      refresh,
      {
        kinds: ["runtime-run.changed"],
        projectId: props.projectId,
        ...(props.flowId ? { flowId: props.flowId } : {})
      }
    );
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, [props.flowId, props.projectId, view, page.offset, query.status, query.search, query.sort, query.direction, query.limit]);  const updateQuery = (patch: Partial<RunHistoryQuery>) => setQuery((current) => ({ ...current, ...patch }));
  const openLog = (runId: string) => {
    setSelectedRunId(runId);
    setView("log");
    setError("");
  };
  const closeLog = () => {
    setView("list");
    setSelectedRunId(null);
  };
  useEffect(() => {
    if (props.focusRunId && props.focusRunId !== selectedRunId) openLog(props.focusRunId);
  }, [props.focusRunId]);
  return (
    <section className="automation-runtime-debugger">
      {view === "list"
        ? <RunList
            error={error}
            loading={loadingRuns}
            page={page}
            query={query}
            searchDraft={searchDraft}
            sessions={runs}
            onOpenLog={openLog}
            onPage={(offset) => void loadRuns(offset)}
            onQuery={updateQuery}
            onRetry={() => void loadRuns(page.offset)}
            onSearchDraft={setSearchDraft}
            onSubmitSearch={() => updateQuery({ search: searchDraft.trim() })}
          />
        : <RunActionLogView commands={props.detailCommands} error={error} loading={false} projectId={props.projectId} runId={selectedRunId} runDetail={null} onBack={closeLog} />}
    </section>
  );
}

export function runtimeRunsForHistory(runs: any[], flowId?: string): any[] {
  return sortRuntimeRunsForDebugView(flowId ? runs.filter((run) => run?.flowId === flowId) : runs);
}
