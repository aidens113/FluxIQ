"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { BackgroundTasksSnapshotResponse } from "fluxiq/background-tasks";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";


export function BackgroundTasksLive() {
  const api = useProgramApi("background-tasks");
  const [snapshot, setSnapshot] = useState<ApiResponse<BackgroundTasksSnapshotResponse> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [status, setStatus] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refresh = useCallback(async () => setSnapshot(await api.get<BackgroundTasksSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tasks = snapshot?.payload?.tasks ?? [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const allRuns = snapshot?.payload?.runs ?? [];
  const selectedRuns = allRuns.filter((run) => run.taskId === selectedTask?.id);
  const recentRuns = allRuns.slice(0, 6);
  const nextDue = tasks.filter((task) => task.enabled && task.nextRunAtMs).sort((left, right) => Number(left.nextRunAtMs) - Number(right.nextRunAtMs))[0];

  async function runTask(taskId: string) {
    const result = await api.post("run", { taskId });
    setStatus(result.ok ? `Ran ${taskId}` : result.error ?? "Run failed");
    await refresh();
  }

  async function setTaskEnabled(taskId: string, enabled: boolean) {
    const result = await api.post("set-enabled", { taskId, enabled });
    setStatus(result.ok ? `${enabled ? "Started" : "Stopped"} task` : result.error ?? "Task update failed");
    await refresh();
  }

  async function setSchedulerRunning(running: boolean) {
    const result = await api.post("control", { action: running ? "start" : "stop" });
    setStatus(result.ok ? `${running ? "Resumed" : "Paused"} scheduler` : result.error ?? "Scheduler update failed");
    await refresh();
  }

  return (
    <section className="background-task-shell">
      <header className="background-task-toolbar">
        <SummaryStrip items={[["Tasks", tasks.length], ["Enabled", tasks.filter((task) => task.enabled).length], ["Scheduler", snapshot?.payload?.scheduler?.running ? "Running" : "Paused"], ["Next Due", nextDue ? formatCountdown(nextDue, nowMs, snapshot?.payload?.scheduler?.running) : "-"]]} />
        <div className="inline-actions"><button className="button" onClick={() => void setSchedulerRunning(!snapshot?.payload?.scheduler?.running)} type="button">{snapshot?.payload?.scheduler?.running ? "Pause Scheduler" : "Resume Scheduler"}</button><button className="button" onClick={refresh} type="button">Refresh</button></div>
      </header>
      {!snapshot?.payload?.scheduler?.running ? <VisualAlert tone="warning" title="Scheduler paused" message="Automatic due-task polling is paused. Manual task runs are still available." /> : null}
      <aside className="background-task-list">
        <div className="db-sidebar-heading"><strong>Tasks</strong><span>{tasks.length}</span></div>
        {tasks.map((task) => (
          <button className={selectedTask?.id === task.id ? "task-list-item selected" : "task-list-item"} key={task.id} onClick={() => setSelectedTaskId(task.id)} type="button">
            <span><strong>{task.name}</strong><small>{task.queue} / {task.schedule ?? formatDuration(task.intervalMs)}</small></span>
            <span className="task-countdown"><strong>{formatCountdown(task, nowMs, snapshot?.payload?.scheduler?.running)}</strong><small>next run</small></span>
          </button>
        ))}
        {!tasks.length ? <p className="muted-text">No background tasks registered.</p> : null}
      </aside>
      <main className="background-task-main">
        <div className="panel workspace-panel">
          <div className="panel-heading"><h2 className="panel-title">{selectedTask ? `${selectedTask.name} Runs` : "Run History"}</h2><span className="panel-count">{selectedRuns.length}</span></div>
          <DataTable columns={["Run", "Status", "Queued", "Finished", "Result"]} rows={selectedRuns.map((run) => [run.id.slice(0, 8), <StatusBadge key={run.id} value={run.status} />, formatTime(run.queuedAtMs), formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-result`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No runs recorded for the selected task." />
          <div className="recent-run-block">
            <div className="panel-heading"><h3 className="panel-title">Recent Activity</h3><span className="panel-count">{recentRuns.length}</span></div>
            <DataTable columns={["Task", "Status", "Finished", "Result"]} rows={recentRuns.map((run) => [run.taskId, <StatusBadge key={run.id} value={run.status} />, formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-recent`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No background task activity yet." />
          </div>
          <StatusText value={status} />
        </div>
      </main>
      <aside className="background-task-detail">
        <div className="db-sidebar-heading"><strong>Details</strong><span>{selectedTask?.id ?? "none"}</span></div>
        {selectedTask ? <>
          <div className="task-detail-title"><h2>{selectedTask.name}</h2><StatusBadge value={selectedTask.enabled ? "enabled" : "disabled"} /></div>
          <div className="task-countdown-panel"><span>Next run in</span><strong>{formatCountdown(selectedTask, nowMs, snapshot?.payload?.scheduler?.running)}</strong></div>
          <div className="task-progress-block">
            <span>Schedule progress</span>
            <div className="progress-track"><span style={{ width: scheduleProgress(selectedTask, nowMs) }} /></div>
          </div>
          <KeyValue rows={[["ID", selectedTask.id], ["Queue", selectedTask.queue], ["Schedule", selectedTask.schedule ?? formatDuration(selectedTask.intervalMs)], ["Interval", formatDuration(selectedTask.intervalMs)], ["Next run", formatTime(selectedTask.nextRunAtMs)], ["Last run", formatTime(selectedTask.lastRunAtMs)], ["Runs", String(selectedRuns.length)]]} />
          {selectedTask.metadata ? <details className="json-details" open><summary>Metadata</summary><pre>{JSON.stringify(selectedTask.metadata, null, 2)}</pre></details> : null}
          <div className="inline-actions"><button className="button button-primary" disabled={!selectedTask.enabled} onClick={() => void runTask(selectedTask.id)} type="button">Run Now</button><button className="button" onClick={() => void setTaskEnabled(selectedTask.id, !selectedTask.enabled)} type="button">{selectedTask.enabled ? "Stop Task" : "Start Task"}</button></div>
        </> : <p className="muted-text">Select a task to inspect schedule and history.</p>}
      </aside>
    </section>
  );
}

