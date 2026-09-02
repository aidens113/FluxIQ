"use client";

import { ChevronLeft, ChevronRight, Pause, Play, RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundTaskDefinition, BackgroundTaskRun, BackgroundTasksSnapshotResponse } from "fluxiq/background-tasks";
import { useProgramApi, type ApiResponse } from "../program-api";
import { EmptyState, KeyValue, LoadingState, StatusBadge, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { formatCountdown, formatDuration, formatTime, scheduleProgress, shortJson } from "./shared";
import { reconcileVisibleSelection } from "../program-selection";

type RunPage = { task?: BackgroundTaskDefinition; runs: BackgroundTaskRun[]; total: number; limit: number; offset: number };
type TaskFilter = "all" | "enabled" | "disabled";
type RunFilter = "all" | BackgroundTaskRun["status"];

export function BackgroundTasksLive() {
  const api = useProgramApi("background-tasks");
  const [snapshot, setSnapshot] = useState<ApiResponse<BackgroundTasksSnapshotResponse> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedRun, setSelectedRun] = useState<BackgroundTaskRun | null>(null);
  const [runPage, setRunPage] = useState<RunPage | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [runFilter, setRunFilter] = useState<RunFilter>("all");
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestRef = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await api.get<BackgroundTasksSnapshotResponse>("snapshot", signal ? { signal } : {});
    if (!result.aborted) setSnapshot(result);
  }, [api]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const tasks = snapshot?.payload?.tasks ?? [];
  const filteredTasks = useMemo(() => {
    const needle = taskSearch.trim().toLocaleLowerCase();
    return tasks.filter((task) => (taskFilter === "all" || (taskFilter === "enabled") === task.enabled) && (!needle || (task.name + " " + task.id + " " + task.queue).toLocaleLowerCase().includes(needle)));
  }, [taskFilter, taskSearch, tasks]);
  const visibleTaskId = reconcileVisibleSelection(filteredTasks, selectedTaskId, (task) => task.id);
  const selectedTask = filteredTasks.find((task) => task.id === visibleTaskId);
  useEffect(() => {
    const nextId = selectedTask?.id ?? "";
    if (selectedTaskId !== nextId) {
      requestRef.current += 1;
      setSelectedTaskId(nextId);
      setSelectedRun(null);
      setOffset(0);
    }
  }, [selectedTask?.id, selectedTaskId]);
  const nextDue = tasks.filter((task) => task.enabled && task.nextRunAtMs).sort((left, right) => Number(left.nextRunAtMs) - Number(right.nextRunAtMs))[0];

  const loadRuns = useCallback(async () => {
    if (!selectedTask?.id) { setRunPage(null); return; }
    const requestId = ++requestRef.current;
    setLoadingRuns(true);
    const result = await api.post<RunPage>("detail", { taskId: selectedTask.id, limit: 50, offset, status: runFilter });
    if (requestId !== requestRef.current) return;
    setLoadingRuns(false);
    if (!result.ok || !result.payload) { setStatus(result.error ?? "Run history could not be loaded."); setRunPage(null); return; }
    setRunPage(result.payload);
    setSelectedRun((current) => current && result.payload!.runs.some((run) => run.id === current.id) ? current : null);
    if (result.payload.offset >= result.payload.total && result.payload.offset > 0) setOffset(Math.max(0, result.payload.offset - result.payload.limit));
  }, [api, offset, runFilter, selectedTask?.id]);
  useEffect(() => void loadRuns(), [loadRuns]);

  function selectTask(taskId: string) {
    requestRef.current += 1; setSelectedTaskId(taskId); setSelectedRun(null); setOffset(0); setRunFilter("all"); setStatus("");
  }

  async function runTask(taskId: string) {
    setBusy(true);
    const result = await api.post<BackgroundTaskRun>("run", { taskId });
    setBusy(false);
    setStatus(result.ok ? "Task run completed." : result.error ?? "Task run failed.");
    if (result.payload) setSelectedRun(result.payload);
    await Promise.all([refresh(), loadRuns()]);
  }

  async function setTaskEnabled(taskId: string, enabled: boolean) {
    setBusy(true);
    const result = await api.post("set-enabled", { taskId, enabled });
    setBusy(false);
    setStatus(result.ok ? (enabled ? "Task enabled." : "Task disabled.") : result.error ?? "Task update failed.");
    await refresh();
  }

  async function setSchedulerRunning(running: boolean) {
    setBusy(true);
    const result = await api.post("control", { action: running ? "start" : "stop" });
    setBusy(false);
    setStatus(result.ok ? (running ? "Scheduler resumed." : "Scheduler paused.") : result.error ?? "Scheduler update failed.");
    await refresh();
  }

  if (!snapshot) return <LoadingState label="Loading background tasks" detail="Reading scheduler and task summaries." />;
  if (!snapshot.ok) return <EmptyState title="Background Tasks unavailable" description={snapshot.error ?? "The scheduler could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  const schedulerRunning = Boolean(snapshot.payload?.scheduler?.running);
  const page = runPage ?? { task: selectedTask, runs: [], total: 0, limit: 50, offset };
  const pageNumber = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  return <section className="background-task-shell">
    <header className="background-task-toolbar"><SummaryStrip items={[["Tasks", tasks.length], ["Enabled", tasks.filter((task) => task.enabled).length], ["Scheduler", schedulerRunning ? "Running" : "Paused"], ["Next Due", nextDue ? formatCountdown(nextDue, nowMs, schedulerRunning) : "-"]]} /><div className="inline-actions"><button className="button" disabled={busy} onClick={() => void setSchedulerRunning(!schedulerRunning)} type="button">{schedulerRunning ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}{schedulerRunning ? "Pause" : "Resume"}</button><button aria-label="Refresh tasks" className="icon-button" onClick={() => void refresh()} title="Refresh tasks" type="button"><RefreshCcw aria-hidden size={15} /></button></div></header>
    {!schedulerRunning ? <VisualAlert tone="warning" title="Scheduler paused" message="Automatic due-task polling is paused. Manual runs remain available for enabled tasks." /> : null}
    <aside className="background-task-list"><div className="db-sidebar-heading"><strong>Tasks</strong><span>{filteredTasks.length}</span></div><div className="background-task-filters"><label className="program-search-field"><Search aria-hidden size={14} /><input aria-label="Search tasks" onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search tasks" type="search" value={taskSearch} /></label><select aria-label="Filter tasks" onChange={(event) => setTaskFilter(event.target.value as TaskFilter)} value={taskFilter}><option value="all">All tasks</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div><div className="background-task-list-scroll">{filteredTasks.map((task) => <button className={selectedTask?.id === task.id ? "task-list-item selected" : "task-list-item"} key={task.id} onClick={() => selectTask(task.id)} type="button"><span><strong>{task.name}</strong><small>{task.queue} / {task.schedule ?? formatDuration(task.intervalMs)}</small></span><span className="task-countdown"><strong>{formatCountdown(task, nowMs, schedulerRunning)}</strong><small>{task.enabled ? "next run" : "disabled"}</small></span></button>)}{!filteredTasks.length ? <EmptyState compact title={tasks.length ? "No matching tasks" : "No tasks registered"} description={tasks.length ? "Change the search or state filter." : "Registered framework jobs will appear here."} /> : null}</div></aside>
    <section className="background-task-main"><section className="background-run-panel"><header className="panel-heading"><div><h2 className="panel-title">{selectedTask ? selectedTask.name + " history" : "Run History"}</h2><p className="panel-kicker">Newest runs first</p></div><select aria-label="Filter runs by status" disabled={!selectedTask} onChange={(event) => { setRunFilter(event.target.value as RunFilter); setOffset(0); setSelectedRun(null); }} value={runFilter}><option value="all">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></header>{selectedTask ? <><div aria-busy={loadingRuns} className="background-run-table-wrap"><table aria-label={`${selectedTask.name} run history`} className="background-run-table"><thead><tr><th>Status</th><th>Queued</th><th>Duration</th><th>Result</th></tr></thead><tbody>{page.runs.map((run) => <tr className={selectedRun?.id === run.id ? "selected" : ""} key={run.id}><td><button className="run-row-button" onClick={() => setSelectedRun(run)} type="button"><StatusBadge value={run.status} /></button></td><td>{formatTime(run.queuedAtMs)}</td><td>{run.finishedAtMs && run.startedAtMs ? formatDuration(run.finishedAtMs - run.startedAtMs) : run.status}</td><td>{run.error ?? shortJson(run.payload)}</td></tr>)}{!loadingRuns && !page.runs.length ? <tr><td className="empty-cell" colSpan={4}>{runFilter === "all" ? "No runs recorded for this task." : "No runs match this status."}</td></tr> : null}</tbody></table>{loadingRuns ? <LoadingState compact label="Loading run history" /> : null}</div><footer className="background-run-footer"><span>{page.total ? page.offset + 1 : 0}-{Math.min(page.total, page.offset + page.runs.length)} of {page.total}</span><div className="inline-actions"><button aria-label="Previous run page" className="icon-button" disabled={offset === 0 || loadingRuns} onClick={() => setOffset(Math.max(0, offset - page.limit))} title="Previous page" type="button"><ChevronLeft aria-hidden size={15} /></button><span>Page {pageNumber} of {pageCount}</span><button aria-label="Next run page" className="icon-button" disabled={offset + page.limit >= page.total || loadingRuns} onClick={() => setOffset(offset + page.limit)} title="Next page" type="button"><ChevronRight aria-hidden size={15} /></button></div></footer></> : <EmptyState title="No visible task selected" description="Change the task search or filter to select a visible task." />}</section><StatusText value={status} /></section>
    <aside className="background-task-detail"><div className="db-sidebar-heading"><strong>{selectedRun ? "Run Detail" : "Task Detail"}</strong><span>{selectedRun?.id.slice(0, 8) ?? selectedTask?.id ?? "none"}</span></div>{selectedRun ? <><div className="task-detail-title"><h2>{selectedTask?.name}</h2><StatusBadge value={selectedRun.status} /></div><KeyValue rows={[["Run ID", selectedRun.id], ["Queued", formatTime(selectedRun.queuedAtMs)], ["Started", formatTime(selectedRun.startedAtMs)], ["Finished", formatTime(selectedRun.finishedAtMs)], ["Error", selectedRun.error ?? "-"]]} />{selectedRun.payload ? <details className="json-details"><summary>Result detail</summary><pre>{JSON.stringify(selectedRun.payload, null, 2)}</pre></details> : null}{selectedRun.status === "failed" && selectedTask?.enabled ? <button className="button button-primary" disabled={busy} onClick={() => void runTask(selectedTask.id)} type="button"><Play aria-hidden size={14} />Run Again</button> : null}<button className="button" onClick={() => setSelectedRun(null)} type="button">Back to Task</button></> : selectedTask ? <><div className="task-detail-title"><h2>{selectedTask.name}</h2><StatusBadge value={selectedTask.enabled ? "enabled" : "disabled"} /></div><div className="task-countdown-panel"><span>Next run</span><strong>{formatCountdown(selectedTask, nowMs, schedulerRunning)}</strong></div><div className="task-progress-block"><span>Schedule progress</span><div className="progress-track"><span style={{ width: scheduleProgress(selectedTask, nowMs) }} /></div></div><KeyValue rows={[["ID", selectedTask.id], ["Queue", selectedTask.queue], ["Schedule", selectedTask.schedule ?? formatDuration(selectedTask.intervalMs)], ["Next run", formatTime(selectedTask.nextRunAtMs)], ["Last run", formatTime(selectedTask.lastRunAtMs)], ["Matching runs", String(page.total)]]} /><div className="inline-actions"><button className="button button-primary" disabled={!selectedTask.enabled || busy} onClick={() => void runTask(selectedTask.id)} type="button"><Play aria-hidden size={14} />Run Now</button><button className="button" disabled={busy} onClick={() => void setTaskEnabled(selectedTask.id, !selectedTask.enabled)} type="button">{selectedTask.enabled ? "Disable" : "Enable"}</button></div></> : <EmptyState compact title="No task selected" description="Choose a task to inspect its schedule and runs." />}</aside>
  </section>;
}
