"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useState } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { AutomationDockTab, AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";
import { groupByNamespace } from "./view-utils";
export function AutomationRecordingWorkspace(props: { recordings: any[]; selectedRecording: any; selectedTimeline: any; setSelection(selection: AutomationSelection): void }) {
  const entries = props.selectedTimeline?.timeline ?? props.selectedRecording?.timeline ?? [];
  const checkpoints = entries.filter((entry: any) => entry.type === "state_checkpoint").length;
  const deltas = entries.filter((entry: any) => entry.type === "state_delta").reduce((total: number, entry: any) => total + (entry.deltas?.length ?? 0), 0);
  return (
    <section className="automation-recording-stage">
      <header><strong>{props.selectedRecording?.recordingId ?? "No recording"}</strong><span>{entries.length} entries | {checkpoints} checkpoints | {deltas} deltas</span></header>
      <div className="context-chip-row">
        <span>Environment {props.selectedRecording?.environment?.label ?? "-"}</span>
        <span>Notes {props.selectedRecording?.notes?.length ?? 0}</span>
        <span>Started {props.selectedRecording?.startedAt ? new Date(props.selectedRecording.startedAt).toLocaleTimeString() : "-"}</span>
      </div>
      <div className="automation-state-list">
        {props.recordings.map((recording) => (
          <button className={recording.recordingId === props.selectedRecording?.recordingId ? "selected" : ""} key={recording.recordingId} onClick={() => props.setSelection({ kind: "recording", id: recording.recordingId })} type="button">
            <strong>{recording.recordingId}</strong>
            <span>{recording.environment?.label ?? "Environment"} | {recording.timeline?.length ?? 0} raw entries</span>
          </button>
        ))}
      </div>
      <div className="automation-track-stack">
        {["note", "action", "state_delta", "state_checkpoint"].map((type) => (
          <div className="automation-track" key={type}>
            <strong>{type.replace("_", " ")}</strong>
            <div>
              {entries.filter((entry: any) => entry.type === type).map((entry: any) => (
                <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} style={{ left: `${Math.min(92, Math.max(0, (entry.monotonicOffsetMs ?? 0) / 18))}%` }} type="button">
                  <span>{timelineEntrySummary(entry)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AutomationSignalWorkspace(props: { domains: any[]; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const namespaces = groupByNamespace(props.signals);
  return (
    <section className="automation-signal-board">
      <div className="automation-domain-contracts">
        <header><strong>Recording Domains</strong><span>{props.domains.length} registered</span></header>
        {props.domains.map((domain) => (
          <article key={domain.domainId}>
            <strong>{domain.label ?? domain.domainId}</strong>
            <span>{domain.domainId}</span>
            <small>{domain.eventTypes?.length ?? 0} event types | {domain.stateReducers?.length ?? 0} reducers | {domain.observationExtractors?.length ?? 0} extractors</small>
          </article>
        ))}
        {!props.domains.length ? <span>No recording domain contracts are registered by the host repo yet.</span> : null}
      </div>
      {Object.entries(namespaces).map(([namespace, namespaceSignals]) => (
        <div className="automation-state-namespace" key={namespace}>
          <strong>{namespace}</strong>
          {namespaceSignals.map((signal) => (
            <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
              <span>{signal.registryId}</span>
              <strong>{signal.path}</strong>
              <small>{signal.type} | {signal.comparator?.kind ?? "exact"} | {signal.volatility}</small>
            </button>
          ))}
        </div>
      ))}
      {!props.signals.length ? <span>No signal registries loaded.</span> : null}
    </section>
  );
}

export function AutomationRuntimeWorkspace(props: { projectId: string | null; pipelineArtifacts: any; timelines: any[]; models: any[]; policies: any[]; runtimeSessions: any[] }) {
  const orderedSessions = useMemo(() => [...props.runtimeSessions].sort((left, right) => (right.startedAt ?? right.queuedAt ?? 0) - (left.startedAt ?? left.queuedAt ?? 0)), [props.runtimeSessions]);
  return (
    <section className="automation-runtime-stage">
      <SummaryStrip items={[
        ["Runs", props.runtimeSessions.length],
        ["Timelines", props.timelines.length],
        ["Models", props.models.length],
        ["Proposals", props.pipelineArtifacts?.policyProposals?.length ?? 0],
        ["Runnable Nodes", props.policies.reduce((total, policy) => total + (policy.nodes?.length ?? 0), 0)]
      ]} />
      <RuntimeDebugInnerView projectId={props.projectId} initialSessions={orderedSessions} />
    </section>
  );
}


export function AutomationRunsWorkspace(props: { projectId: string | null; pipelineArtifacts: any; runtimeSessions: any[] }) {
  const replays = props.pipelineArtifacts?.replayResults ?? [];
  const orderedSessions = useMemo(() => [...props.runtimeSessions].sort((left, right) => (right.startedAt ?? right.queuedAt ?? 0) - (left.startedAt ?? left.queuedAt ?? 0)), [props.runtimeSessions]);
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Runs</strong><span>Replay and runtime validation history</span></div>
      </header>
      <SummaryStrip items={[["Runtime Runs", props.runtimeSessions.length], ["Replay Runs", replays.length], ["Failures", props.runtimeSessions.filter((session) => session.status === "failed").length + replays.filter((replay: any) => replay.status === "failed").length], ["Validated", replays.filter((replay: any) => replay.status === "matched").length]]} />
      <RuntimeDebugInnerView projectId={props.projectId} initialSessions={orderedSessions} />
      <DataTable columns={["Replay", "Status", "Recording", "Proposal", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
        replay.replayId,
        <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />,
        replay.recordingId,
        replay.policyId,
        `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`,
        replay.timingWarnings?.length ?? 0
      ])} empty="No replay validations generated yet." />
    </section>
  );
}
export function AutomationProblemsWorkspace(props: { problems: any[] }) {
  return <DataTable columns={["Severity", "Artifact", "Message"]} rows={props.problems.map((problem) => [<StatusBadge key={problem.id} value={problem.severity} />, problem.artifactId ?? problem.artifactKind ?? "-", problem.message])} empty="No validation, runtime, or fixture problems are currently reported." />;
}

const RUNTIME_RUN_PAGE_SIZE = 25;
const RUNTIME_ACTION_PAGE_SIZE = 50;

function RuntimeDebugInnerView(props: { projectId: string | null; initialSessions: any[] }) {
  const api = useProgramApi("automation-studio");
  const [view, setView] = useState<"list" | "log">("list");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>(props.initialSessions);
  const [page, setPage] = useState({ limit: RUNTIME_RUN_PAGE_SIZE, offset: 0, total: props.initialSessions.length });
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setRuns(props.initialSessions);
    setPage((current) => ({ ...current, offset: 0, total: Math.max(current.total, props.initialSessions.length) }));
  }, [props.initialSessions]);
  useEffect(() => {
    if (!props.projectId) return;
    void loadRuns(0);
  }, [props.projectId]);
  const loadRuns = async (offset: number) => {
    if (!props.projectId) return;
    setLoadingRuns(true);
    setError("");
    const result = await api.post<{ runtimeSessions?: any[]; page?: { runs?: any[]; total?: number; limit?: number; offset?: number } }>("list-runtime-sessions", { projectId: props.projectId, summaries: true, limit: RUNTIME_RUN_PAGE_SIZE, offset });
    setLoadingRuns(false);
    if (!result.ok) {
      setError(result.error ?? "Runtime runs could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setRuns(result.payload?.runtimeSessions ?? resultPage?.runs ?? []);
    setPage({
      limit: resultPage?.limit ?? RUNTIME_RUN_PAGE_SIZE,
      offset: resultPage?.offset ?? offset,
      total: resultPage?.total ?? result.payload?.runtimeSessions?.length ?? 0
    });
  };
  const openLog = async (runId: string) => {
    setSelectedRunId(runId);
    setSelectedSession(null);
    setView("log");
    if (!props.projectId) return;
    setLoadingLog(true);
    setError("");
    const result = await api.post<{ runtimeSession?: any }>("get-runtime-session", { projectId: props.projectId, runId });
    setLoadingLog(false);
    if (!result.ok || !result.payload?.runtimeSession) {
      setError(result.error ?? "Runtime log could not be loaded.");
      return;
    }
    setSelectedSession(result.payload.runtimeSession);
  };
  const closeLog = () => {
    setView("list");
    setSelectedRunId(null);
    setSelectedSession(null);
  };
  return (
    <section className="automation-runtime-debugger">
      {view === "list"
        ? <RuntimeRunListPage error={error} loading={loadingRuns} page={page} sessions={runs} onOpenLog={openLog} onPage={loadRuns} />
        : <RuntimeActionLogPage error={error} loading={loadingLog} runId={selectedRunId} session={selectedSession} onBack={closeLog} />}
    </section>
  );
}

function RuntimeRunListPage(props: { sessions: any[]; page: { limit: number; offset: number; total: number }; loading: boolean; error: string; onOpenLog(runId: string): void; onPage(offset: number): void }) {
  const nextOffset = props.page.offset + props.page.limit;
  const previousOffset = Math.max(0, props.page.offset - props.page.limit);
  const rangeStart = props.page.total ? props.page.offset + 1 : 0;
  const rangeEnd = Math.min(props.page.total, props.page.offset + props.sessions.length);
  return (
    <section className="automation-runtime-list-page">
      <header>
        <div>
          <strong>Previous Runs</strong>
          <span>{props.loading ? "Loading runs..." : `${rangeStart}-${rangeEnd} of ${props.page.total} runs`}</span>
        </div>
        <div className="automation-runtime-pagination">
          <button disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(previousOffset)} type="button">Previous</button>
          <button disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next</button>
        </div>
      </header>
      {props.error ? <p className="automation-runtime-message">{props.error}</p> : null}
      <DataTable columns={["Run", "Target", "Status", "Started", "Duration", "Actions", "Effects", ""]} rows={props.sessions.map((session) => [
        <strong key={`${session.runId}:run`}>{session.runId ?? "-"}</strong>,
        `${session.targetKind ?? "flow"}:${session.targetId ?? session.flowId ?? "-"}`,
        <StatusBadge key={`${session.runId}:status`} value={session.status ?? "queued"} />,
        formatRuntimeTimestamp(session.startedAt ?? session.queuedAt),
        formatRuntimeDuration(session.startedAt, session.finishedAt),
        session.attemptCount ?? session.trace?.attempts?.length ?? 0,
        session.effectCount ?? session.trace?.effects?.length ?? 0,
        <button className="automation-runtime-row-action" key={`${session.runId}:action`} onClick={() => props.onOpenLog(session.runId)} type="button">View Log</button>
      ])} empty="No runtime sessions have been started for this project." />
    </section>
  );
}

function RuntimeActionLogPage(props: { runId: string | null; session: any | null; loading: boolean; error: string; onBack(): void }) {
  const [attemptOffset, setAttemptOffset] = useState(0);
  const session = props.session;
  const trace = session?.trace;
  const attempts = trace?.attempts ?? [];
  const nextAttemptOffset = attemptOffset + RUNTIME_ACTION_PAGE_SIZE;
  const visibleAttempts = attempts.slice(attemptOffset, nextAttemptOffset);
  useEffect(() => {
    setAttemptOffset(0);
  }, [props.runId]);
  if (!session) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button><div><strong>Action Log</strong><span>{props.loading ? `Loading ${props.runId ?? "run"}...` : props.error || "Run not found."}</span></div></header>
      </section>
    );
  }
  return (
    <section className="automation-runtime-log-page">
      <header>
        <button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button>
        <div>
          <strong>Action Log</strong>
          <span>{session.runId} | {session.targetKind ?? "flow"}:{session.targetId ?? session.flowId ?? "-"} | {attempts.length} actions | {formatRuntimeDuration(session.startedAt, session.finishedAt)}</span>
        </div>
        <StatusBadge value={session.status ?? trace?.status ?? "queued"} />
      </header>
      {trace?.message ? <p className="automation-runtime-message">{trace.message}</p> : null}
      <div className="automation-runtime-log-toolbar">
        <span>{attempts.length ? `${attemptOffset + 1}-${Math.min(attempts.length, nextAttemptOffset)} of ${attempts.length} actions` : "No actions"}</span>
        <div>
          <button disabled={attemptOffset <= 0} onClick={() => setAttemptOffset(Math.max(0, attemptOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button>
          <button disabled={nextAttemptOffset >= attempts.length} onClick={() => setAttemptOffset(nextAttemptOffset)} type="button">Next</button>
        </div>
      </div>
      <ol className="automation-runtime-action-log">
        {visibleAttempts.map((attempt: any, index: number) => (
          <li key={runtimeAttemptKey(attempt, attemptOffset + index)}>
            <RuntimeAttemptCard attempt={attempt} index={attemptOffset + index} />
          </li>
        ))}
      </ol>
      {!attempts.length ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
      <section className="automation-runtime-log-section">
        <header><strong>Runtime Effects</strong><span>{trace?.effects?.length ?? 0} effects</span></header>
        <DataTable columns={["#", "Node", "Type", "Payload"]} rows={(trace?.effects ?? []).slice(0, RUNTIME_ACTION_PAGE_SIZE).map((effect: any, index: number) => [index + 1, effect.nodeId ?? "-", effect.type ?? "-", <JsonToggle key={index} label="Show Payload JSON" value={effect.payload ?? {}} />])} empty="No runtime effects were dispatched." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Final Runtime Values</strong><span>{Object.keys(trace?.values ?? {}).length} keys</span></header>
        <JsonToggle label="Show Final Values JSON" value={trace?.values ?? {}} />
      </section>
    </section>
  );
}

function RuntimeAttemptCard(props: { attempt: any; index: number }) {
  const attempt = props.attempt;
  return (
    <article className="automation-runtime-attempt-card">
      <header>
        <span>#{props.index + 1}</span>
        <strong>{attempt.nodeId}</strong>
        <StatusBadge value={attempt.status ?? "unknown"} />
      </header>
      <dl>
        <div><dt>Definition</dt><dd>{attempt.definitionId ?? "-"}</dd></div>
        <div><dt>Route</dt><dd>{attempt.route ?? "-"}</dd></div>
        <div><dt>Timing</dt><dd>{formatRuntimeTimestamp(attempt.startedAt)} | {formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)}</dd></div>
        <div><dt>Region</dt><dd>{attempt.regionId ?? "-"}</dd></div>
        {attempt.policyDecision ? <div><dt>Policy</dt><dd>{attempt.policyDecision.outcome}: {attempt.policyDecision.reason}</dd></div> : null}
        {attempt.compositeTarget ? <div><dt>Call Flow</dt><dd>{attempt.compositeTarget.flowId}@{attempt.compositeTarget.version}</dd></div> : null}
        {attempt.message ? <div><dt>Message</dt><dd>{attempt.message}</dd></div> : null}
      </dl>
      <div className="automation-runtime-json-actions">
        <JsonToggle label="Inputs JSON" value={attempt.inputs ?? {}} />
        <JsonToggle label="Outputs JSON" value={attempt.outputs ?? {}} />
        {attempt.effects?.length ? <JsonToggle label={`Effects JSON (${attempt.effects.length})`} value={attempt.effects} /> : null}
        {attempt.logs?.length ? <JsonToggle label={`Logs JSON (${attempt.logs.length})`} value={attempt.logs} /> : null}
        {attempt.childTrace ? <JsonToggle label="Child Trace JSON" value={attempt.childTrace} /> : null}
      </div>
    </article>
  );
}

function JsonToggle(props: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="automation-runtime-json-toggle">
      <button onClick={() => setOpen((current) => !current)} type="button">{open ? "Hide" : props.label}</button>
      {open ? <JsonPreview value={props.value} /> : null}
    </div>
  );
}

function JsonPreview(props: { value: unknown }) {
  return <pre className="automation-runtime-json">{safeJson(props.value)}</pre>;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatRuntimeTimestamp(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toLocaleString() : "-";
}

function formatRuntimeDuration(startedAt: unknown, finishedAt: unknown): string {
  if (typeof startedAt !== "number" || typeof finishedAt !== "number") return "in progress";
  return `${Math.max(0, finishedAt - startedAt)}ms`;
}

function runtimeAttemptKey(attempt: any, index: number): string {
  return attempt.attemptId ?? `${attempt.nodeId}:${index}`;
}
