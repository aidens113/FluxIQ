"use client";

import { ChevronLeft, ChevronRight, Pause, Play, RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BackgroundTaskDefinition, BackgroundTaskRun, BackgroundTasksSnapshotResponse } from "fluxiq/background-tasks";
import { useProgramApi } from "../program-api";
import { validateBackgroundSnapshot, validateBackgroundRunPage, validateBackgroundRun } from "../operational-payloads";
import { EmptyState, KeyValue, LoadingState, StatusBadge, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { formatCountdown, formatDuration, formatTime, scheduleProgress, shortJson } from "./shared";
import { reconcileVisibleSelection } from "../program-selection";
import { OperationalFreshness, useOperationalSnapshot } from "../operational-refresh";

type RunPage = { task?: BackgroundTaskDefinition; runs: BackgroundTaskRun[]; total: number; limit: number; offset: number };
type TaskFilter = "all" | "enabled" | "disabled";
type RunFilter = "all" | BackgroundTaskRun["status"];

export function BackgroundTasksLive() {
  const api = useProgramApi("background-tasks");
  const identity = useRef({ api, generation: 0 });
  if (identity.current.api !== api) identity.current = { api, generation: identity.current.generation + 1 };
  const ownerCurrent = useCallback(() => identity.current.api === api, [api]);
  return <BackgroundTasksWorkspace key={identity.current.generation} api={api} ownerCurrent={ownerCurrent} />;
}

function BackgroundTasksWorkspace({ api, ownerCurrent }: { api: ReturnType<typeof useProgramApi>; ownerCurrent(): boolean }) {
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && ownerCurrent();
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selection, setSelection] = useState<{ owner: object; run: BackgroundTaskRun; page: RunPage | null } | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [runFilter, setRunFilter] = useState<RunFilter>("all");
  const [pageOffset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const read = useCallback((signal: AbortSignal) => mounted.current && ownerCurrent() ? api.get<BackgroundTasksSnapshotResponse>("snapshot", { signal }) : Promise.resolve({ ok: false, aborted: true }), [api, ownerCurrent]);
  const operational = useOperationalSnapshot({ owner: api, read, validate: validateBackgroundSnapshot, clockMs: 1000 });
  const { data: snapshot, refresh: refreshSnapshot, nowMs } = operational;
  const refresh = useCallback(() => mounted.current && ownerCurrent() ? refreshSnapshot() : Promise.resolve(), [ownerCurrent, refreshSnapshot]);
  const tasks = snapshot?.tasks ?? [];
  const filteredTasks = useMemo(() => {
    const needle = taskSearch.trim().toLocaleLowerCase();
    return tasks.filter((task) => (taskFilter === "all" || (taskFilter === "enabled") === task.enabled) && (!needle || (task.name + " " + task.id + " " + task.queue).toLocaleLowerCase().includes(needle)));
  }, [taskFilter, taskSearch, tasks]);
  const visibleTaskId = reconcileVisibleSelection(filteredTasks, selectedTaskId, (task) => task.id);
  const selectedTask = filteredTasks.find((task) => task.id === visibleTaskId);
  useEffect(() => {
    const nextId = selectedTask?.id ?? "";
    if (selectedTaskId !== nextId) {
      setSelectedTaskId(nextId);
      setSelection(null);
      setOffset(0);
    }
  }, [selectedTask?.id, selectedTaskId]);
  const nextDue = tasks.filter((task) => task.enabled && task.nextRunAtMs).sort((left, right) => Number(left.nextRunAtMs) - Number(right.nextRunAtMs))[0];

  const offset = selectedTaskId === visibleTaskId ? pageOffset : 0;
  const historyOwner = useMemo(() => ({ api, taskId: visibleTaskId, offset, runFilter }), [api, visibleTaskId, offset, runFilter]);
  const readRuns = useCallback((signal: AbortSignal) => visibleTaskId && mounted.current && ownerCurrent() ? api.post<RunPage>("detail", { taskId: visibleTaskId, limit: 50, offset, status: runFilter }, { signal }) : Promise.resolve({ ok: true, payload: { runs: [], total: 0, limit: 50, offset: 0 } }), [api, visibleTaskId, offset, runFilter, ownerCurrent]);
  const history = useOperationalSnapshot({ owner: historyOwner, read: readRuns, validate: validateBackgroundRunPage });
  const { data: runPage, loading: loadingRuns } = history;
  const selectedRun = selection?.owner === historyOwner ? runPage?.runs.find((run) => run.id === selection.run.id) ?? (selection.page === runPage ? selection.run : null) : null;
  const setSelectedRun = (run: BackgroundTaskRun | null) => { if (current() && viewOwner.current.historyOwner === historyOwner) setSelection(run ? { owner: historyOwner, run, page: runPage } : null); };
  useEffect(() => { if (runPage && runPage.offset >= runPage.total && runPage.offset > 0) setOffset(Math.max(0, Math.ceil(runPage.total / 50) - 1) * 50); }, [runPage]);
  const actions = useRef({ runTask, setTaskEnabled, setSchedulerRunning, selectTask });
  actions.current = { runTask, setTaskEnabled, setSchedulerRunning, selectTask };
  const viewOwner = useRef({ taskId: visibleTaskId, historyOwner });
  viewOwner.current = { taskId: visibleTaskId, historyOwner };
  const queryCurrent = () => current() && viewOwner.current.historyOwner === historyOwner;
  const loadRuns = () => queryCurrent() ? history.refresh() : Promise.resolve();

  function selectTask(taskId: string) {
    if (!current() || actions.current.selectTask !== selectTask || !filteredTasks.some((task) => task.id === taskId)) return;
    setSelectedTaskId(taskId); setSelectedRun(null); setOffset(0); setRunFilter("all"); setStatus("");
  }

  async function runTask(taskId: string) {
    if (!current() || actions.current.runTask !== runTask || selectedTask?.id !== taskId || !selectedTask.enabled || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await api.post<BackgroundTaskRun>("run", { taskId });
      if (!current() || viewOwner.current.taskId !== taskId) return;
      const malformedDetail = result.payload != null && !validateBackgroundRun(result.payload);
      setStatus(result.ok ? (malformedDetail ? "Task run accepted, but its returned detail could not be shown. Snapshot confirmation is separate." : "Task run accepted. Snapshot confirmation is separate.") : result.error ?? "Task run failed.");
      if (validateBackgroundRun(result.payload) && viewOwner.current.historyOwner === historyOwner) setSelectedRun(result.payload);
      if (result.ok) await Promise.all([refresh(), loadRuns()]);
    } catch { if (current() && viewOwner.current.taskId === taskId) setStatus("Task run failed. Retry the action."); }
    finally { busyRef.current = false; if (current()) setBusy(false); }
  }

  async function setTaskEnabled(taskId: string, enabled: boolean) {
    if (!current() || actions.current.setTaskEnabled !== setTaskEnabled || selectedTask?.id !== taskId || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { const result = await api.post("set-enabled", { taskId, enabled }); if (!current() || viewOwner.current.taskId !== taskId) return; setStatus(result.ok ? "Task update accepted. Snapshot confirmation is separate." : result.error ?? "Task update failed."); if (result.ok) await refresh(); }
    catch { if (current() && viewOwner.current.taskId === taskId) setStatus("Task update failed. Retry the action."); }
    finally { busyRef.current = false; if (current()) setBusy(false); }
  }

  async function setSchedulerRunning(running: boolean) {
    if (!current() || actions.current.setSchedulerRunning !== setSchedulerRunning || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { const result = await api.post("control", { action: running ? "start" : "stop" }); if (!current()) return; setStatus(result.ok ? "Scheduler update accepted. Snapshot confirmation is separate." : result.error ?? "Scheduler update failed."); if (result.ok) await refresh(); }
    catch { if (current()) setStatus("Scheduler update failed. Retry the action."); }
    finally { busyRef.current = false; if (current()) setBusy(false); }
  }

  if (!snapshot) return <><OperationalFreshness {...operational} refresh={refresh} />{operational.loading ? <LoadingState label="Loading background tasks" detail="Reading scheduler and task summaries." /> : <EmptyState title="Background Tasks unavailable" description={operational.error || "No snapshot confirmed."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />}</>;

  const schedulerRunning = Boolean(snapshot.scheduler?.running);
  const page = runPage ?? { task: selectedTask, runs: [], total: 0, limit: 50, offset };
  const pageNumber = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  return <><OperationalFreshness {...operational} refresh={refresh} />{selectedTask ? <section aria-label="Run history freshness"><OperationalFreshness {...history} refresh={loadRuns} /></section> : null}<section className="background-task-shell">
    <header className="background-task-toolbar"><SummaryStrip items={[["Tasks", tasks.length], ["Enabled", tasks.filter((task) => task.enabled).length], ["Scheduler", schedulerRunning ? "Running" : "Paused"], ["Next Due", nextDue ? formatCountdown(nextDue, nowMs, schedulerRunning) : "-"]]} /><div className="inline-actions"><button className="button" disabled={busy} onClick={() => void setSchedulerRunning(!schedulerRunning)} type="button">{schedulerRunning ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}{schedulerRunning ? "Pause" : "Resume"}</button><button aria-label="Refresh tasks" className="icon-button" onClick={() => void refresh()} title="Refresh tasks" type="button"><RefreshCcw aria-hidden size={15} /></button></div></header>
    {!schedulerRunning ? <VisualAlert tone="warning" title="Scheduler paused" message="Automatic due-task polling is paused. Manual runs remain available for enabled tasks." /> : null}
    <aside className="background-task-list"><div className="db-sidebar-heading"><strong>Tasks</strong><span>{filteredTasks.length}</span></div><div className="background-task-filters"><label className="program-search-field"><Search aria-hidden size={14} /><input aria-label="Search tasks" onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search tasks" type="search" value={taskSearch} /></label><select aria-label="Filter tasks" onChange={(event) => setTaskFilter(event.target.value as TaskFilter)} value={taskFilter}><option value="all">All tasks</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div><div className="background-task-list-scroll">{filteredTasks.map((task) => <button className={selectedTask?.id === task.id ? "task-list-item selected" : "task-list-item"} key={task.id} onClick={() => selectTask(task.id)} type="button"><span><strong>{task.name}</strong><small>{task.queue} / {task.schedule ?? formatDuration(task.intervalMs)}</small></span><span className="task-countdown"><strong>{formatCountdown(task, nowMs, schedulerRunning)}</strong><small>{task.enabled ? "next run" : "disabled"}</small></span></button>)}{!filteredTasks.length ? <EmptyState compact title={tasks.length ? "No matching tasks" : "No tasks registered"} description={tasks.length ? "Change the search or state filter." : "Registered framework jobs will appear here."} /> : null}</div></aside>
    <section className="background-task-main"><section className="background-run-panel"><header className="panel-heading"><div><h2 className="panel-title">{selectedTask ? selectedTask.name + " history" : "Run History"}</h2><p className="panel-kicker">Newest runs first</p></div><select aria-label="Filter runs by status" disabled={!selectedTask} onChange={(event) => { if (!queryCurrent()) return; setRunFilter(event.target.value as RunFilter); setOffset(0); setSelectedRun(null); }} value={runFilter}><option value="all">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></header>{selectedTask ? <><div aria-busy={loadingRuns} className="background-run-table-wrap"><table aria-label={`${selectedTask.name} run history`} className="background-run-table"><thead><tr><th>Status</th><th>Queued</th><th>Duration</th><th>Result</th></tr></thead><tbody>{page.runs.map((run) => <tr className={selectedRun?.id === run.id ? "selected" : ""} key={run.id}><td><button className="run-row-button" onClick={() => setSelectedRun(run)} type="button"><StatusBadge value={run.status} /></button></td><td>{formatTime(run.queuedAtMs)}</td><td>{run.finishedAtMs && run.startedAtMs ? formatDuration(run.finishedAtMs - run.startedAtMs) : run.status}</td><td>{run.error ?? shortJson(run.payload)}</td></tr>)}{!loadingRuns && !page.runs.length ? <tr><td className="empty-cell" colSpan={4}>{runFilter === "all" ? "No runs recorded for this task." : "No runs match this status."}</td></tr> : null}</tbody></table>{loadingRuns ? <LoadingState compact label="Loading run history" /> : null}</div><footer className="background-run-footer"><span>{page.total ? page.offset + 1 : 0}-{Math.min(page.total, page.offset + page.runs.length)} of {page.total}</span><div className="inline-actions"><button aria-label="Previous run page" className="icon-button" disabled={offset === 0 || loadingRuns} onClick={() => { if (queryCurrent()) setOffset(Math.max(0, offset - page.limit)); }} title="Previous page" type="button"><ChevronLeft aria-hidden size={15} /></button><span>Page {pageNumber} of {pageCount}</span><button aria-label="Next run page" className="icon-button" disabled={offset + page.limit >= page.total || loadingRuns} onClick={() => { if (queryCurrent()) setOffset(offset + page.limit); }} title="Next page" type="button"><ChevronRight aria-hidden size={15} /></button></div></footer></> : <EmptyState title="No visible task selected" description="Change the task search or filter to select a visible task." />}</section><StatusText value={status} /></section>
    <aside className="background-task-detail"><div className="db-sidebar-heading"><strong>{selectedRun ? "Run Detail" : "Task Detail"}</strong><span>{selectedRun?.id.slice(0, 8) ?? selectedTask?.id ?? "none"}</span></div>{selectedRun ? <><div className="task-detail-title"><h2>{selectedTask?.name}</h2><StatusBadge value={selectedRun.status} /></div><KeyValue rows={[["Run ID", selectedRun.id], ["Queued", formatTime(selectedRun.queuedAtMs)], ["Started", formatTime(selectedRun.startedAtMs)], ["Finished", formatTime(selectedRun.finishedAtMs)], ["Error", selectedRun.error ?? "-"]]} />{selectedRun.payload ? <details className="json-details"><summary>Result detail</summary><pre>{JSON.stringify(selectedRun.payload, null, 2)}</pre></details> : null}{selectedRun.status === "failed" && selectedTask?.enabled ? <button className="button button-primary" disabled={busy} onClick={() => void runTask(selectedTask.id)} type="button"><Play aria-hidden size={14} />Run Again</button> : null}<button className="button" onClick={() => setSelectedRun(null)} type="button">Back to Task</button></> : selectedTask ? <><div className="task-detail-title"><h2>{selectedTask.name}</h2><StatusBadge value={selectedTask.enabled ? "enabled" : "disabled"} /></div><div className="task-countdown-panel"><span>Next run</span><strong>{formatCountdown(selectedTask, nowMs, schedulerRunning)}</strong></div><div className="task-progress-block"><span>Schedule progress</span><div className="progress-track"><span style={{ width: scheduleProgress(selectedTask, nowMs) }} /></div></div><KeyValue rows={[["ID", selectedTask.id], ["Queue", selectedTask.queue], ["Schedule", selectedTask.schedule ?? formatDuration(selectedTask.intervalMs)], ["Next run", formatTime(selectedTask.nextRunAtMs)], ["Last run", formatTime(selectedTask.lastRunAtMs)], ["Matching runs", String(page.total)]]} /><div className="inline-actions"><button className="button button-primary" disabled={!selectedTask.enabled || busy} onClick={() => void runTask(selectedTask.id)} type="button"><Play aria-hidden size={14} />Run Now</button><button className="button" disabled={busy} onClick={() => void setTaskEnabled(selectedTask.id, !selectedTask.enabled)} type="button">{selectedTask.enabled ? "Disable" : "Enable"}</button></div></> : <EmptyState compact title="No task selected" description="Choose a task to inspect its schedule and runs." />}</aside>
  </section></>;
}
