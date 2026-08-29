"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "../../programs/shared-ui";
import { X } from "lucide-react";
import {
  RuntimeAttemptRow,
  RuntimeLlmAdaptationPanel,
  RuntimeRecoveryRoutingPanel,
  RuntimeRunStateEffectsPanel,
  RuntimeRunStory,
  RuntimeMetricsPanel,
  JsonPreview,
  RuntimeActionDetailPanel
} from "./RunDetailPanels";
import {
  runtimeAttemptsForRunDetail,
  runtimeRunOverviewItems,
  isRuntimeJsonRecord,
  runtimeStoryHeadline
} from "./run-detail-model";
import {
  formatRuntimeDuration,
  runtimeAttemptKey,
} from "./run-format";
import { RUNTIME_ACTION_PAGE_SIZE, RUNTIME_EVENT_PAGE_SIZE } from "./run-queries";
import { useRuntimeDetailCommands, type RuntimeDetailCommands } from "./runtime-host";
export type RunActionLogViewProps = { projectId?: string | null; runId: string | null; runDetail: any | null; loading: boolean; error: string; onBack(): void };

export function RunActionLogView(props: RunActionLogViewProps & { commands?: RuntimeDetailCommands }) {
  const hostCommands = useRuntimeDetailCommands();
  return <RunActionLogViewContent {...props} commands={props.commands ?? hostCommands} />;
}

export function RunActionLogViewContent(props: RunActionLogViewProps & { commands: RuntimeDetailCommands }) {
  const [attemptOffset, setAttemptOffset] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportPreparing, setExportPreparing] = useState(false);
  const [loadedRunDetail, setLoadedRunDetail] = useState<any | null>(props.runDetail ?? null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const runDetail = props.runDetail ?? loadedRunDetail;
  const summary = runDetail?.summary ?? {};
  const trace = runDetail?.trace;
  const embeddedAttempts = runtimeAttemptsForRunDetail(runDetail);
  const [actionPage, setActionPage] = useState<{ actions: any[]; total: number; limit: number; offset: number }>(() => ({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0 }));
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionError, setActionError] = useState("");
  const [eventPage, setEventPage] = useState<{ events: any[]; nextCursor: string | null; hasMore: boolean; lastSequence: number; loaded: boolean }>(() => ({ events: [], nextCursor: null, hasMore: false, lastSequence: 0, loaded: false }));
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventError, setEventError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [actionDetailView, setActionDetailView] = useState<"summary" | "data" | "effects" | "state" | "raw">("summary");
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  const nextAttemptOffset = actionPage.offset + actionPage.limit;
  const visibleAttempts = actionPage.actions;
  const actionTotal = actionPage.total;
  const loadActionPage = async (offset: number) => {
    if (!props.projectId || !props.runId) return;
    setLoadingActions(true);
    setActionError("");
    const result = await props.commands.listActions({ projectId: props.projectId, runId: props.runId, limit: RUNTIME_ACTION_PAGE_SIZE, offset });
    setLoadingActions(false);
    if (!result.ok) { setActionError(result.error ?? "Actions could not be loaded."); return; }
    const page = result.payload?.page;
    setAttemptOffset(page?.offset ?? offset);
    setSelectedAttempt(null);
    setActionDetailView("summary");
    setActionPage({ actions: result.payload?.actions ?? page?.actions ?? [], total: page?.total ?? result.payload?.actions?.length ?? 0, limit: page?.limit ?? RUNTIME_ACTION_PAGE_SIZE, offset: page?.offset ?? offset });
  };
  const loadRunDetail = async () => {
    if (!props.projectId || !props.runId || props.runDetail) return;
    setLoadingDetail(true);
    setDetailError("");
    const result = await props.commands.loadDetail({ projectId: props.projectId, runId: props.runId, compact: true });
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.runDetail) { setDetailError(result.error ?? "Runtime log could not be loaded."); return; }
    setLoadedRunDetail(result.payload.runDetail);
  };
  const loadEventPage = async (afterSequence = 0) => {
    if (!props.projectId || !props.runId) return;
    setLoadingEvents(true);
    setEventError("");
    const result = await props.commands.listEvents({ projectId: props.projectId, runId: props.runId, afterSequence, limit: RUNTIME_EVENT_PAGE_SIZE });
    setLoadingEvents(false);
    if (!result.ok) { setEventError(result.error ?? "Runtime events could not be loaded."); return; }
    const page = result.payload?.page;
    setSelectedEvent(null);
    setEventPage({ events: result.payload?.events ?? page?.events ?? [], nextCursor: page?.nextCursor ?? null, hasMore: page?.hasMore === true, lastSequence: page?.lastSequence ?? afterSequence, loaded: true });
  };
  useEffect(() => {
    setAttemptOffset(0);
    setExportMessage("");
    setLoadedRunDetail(props.runDetail ?? null);
    setDetailError("");
    setEventError("");
    setSelectedEvent(null);
    setEventPage({ events: [], nextCursor: null, hasMore: false, lastSequence: 0, loaded: false });
    if (props.projectId && props.runId) {
      void loadRunDetail();
      void loadActionPage(0);
    }
    else setActionPage({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0 });
  }, [props.runId]);
  const exportAudit = async () => {
    const runId = props.runId;
    if (!props.projectId || !runId) return;
    setExportPreparing(true);
    setExportMessage("Preparing complete audit export...");
    const result = await props.commands.exportAudit({ projectId: props.projectId, runId });
    if (!result.ok || !result.payload?.audit) {
      setExportPreparing(false);
      setExportMessage(result.error ?? "Audit export could not be prepared.");
      return;
    }
    const auditBlob = await runtimeAuditBlob(result.payload.audit);
    if (typeof window !== "undefined" && typeof URL !== "undefined") {
      const url = URL.createObjectURL(auditBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fluxiq-run-audit-${runId}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    setExportPreparing(false);
    const actionCount = result.payload.audit?.manifest?.actionCount ?? 0;
    setExportMessage(`Audit export ready with ${actionCount} actions.`);
  };
  if (!runDetail) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button><div><strong>Action Log</strong><span>{loadingDetail || props.loading ? `Loading ${props.runId ?? "run"}...` : detailError || props.error || (props.runId ? `Waiting for ${props.runId}...` : "Run not found.")}</span></div></header>
        <div className="automation-runtime-log-toolbar"><span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : loadingActions ? "Loading actions..." : "No actions loaded yet"}</span><div><button disabled={loadingActions || actionPage.offset <= 0} onClick={() => void loadActionPage(Math.max(0, actionPage.offset - actionPage.limit))} type="button">Previous</button><button disabled={loadingActions || nextAttemptOffset >= actionTotal} onClick={() => void loadActionPage(nextAttemptOffset)} type="button">Next</button></div></div>
        {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" onClick={() => void loadActionPage(actionPage.offset)} type="button">Retry</button></div> : null}
        <ol aria-busy={loadingActions} className="automation-runtime-action-log">
          {visibleAttempts.map((attempt: any, index: number) => <li key={runtimeAttemptKey(attempt, actionPage.offset + index)}><RuntimeAttemptRow attempt={attempt} index={actionPage.offset + index} /></li>)}
        </ol>
      </section>
    );
  }
  return (
    <section className="automation-runtime-log-page">
      <header className="automation-runtime-log-hero">
        <div className="automation-runtime-log-title-row">
          <button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button>
          <StatusBadge value={summary.status ?? trace?.status ?? "queued"} />
        </div>
        <div>
          <strong>Action Log</strong>
          <span>{summary.runId ?? props.runId} | flow:{summary.flowId ?? "-"} | {actionTotal} actions | {formatRuntimeDuration(summary.startedAt, summary.finishedAt)}</span>
        </div>
        <div className="automation-runtime-log-actions">
          <button className="automation-runtime-row-action" disabled={exportPreparing || !props.projectId || !props.runId} onClick={exportAudit} type="button">{exportPreparing ? "Preparing..." : "Export Audit"}</button>
        </div>
      </header>
      {exportMessage ? <p className="automation-runtime-message">{exportMessage}</p> : null}
      {detailError || props.error ? <div className="automation-runtime-inline-error" role="alert"><span>{detailError || props.error}</span><button className="button" disabled={loadingDetail} onClick={() => void loadRunDetail()} type="button">Retry</button></div> : null}
      {runDetail?.metadata?.terminalFailureReason ? <p className="automation-runtime-message">{runDetail.metadata.terminalFailureReason}</p> : null}
      {runDetail?.metadata?.message ? <p className="automation-runtime-message">{runDetail.metadata.message}</p> : null}
      <section className="automation-runtime-story-panel">
        <div className="automation-runtime-story-summary">
          <strong>Overview</strong>
          <span>{runtimeStoryHeadline(runDetail)}</span>
        </div>
        <dl className="automation-runtime-overview-grid">
          {runtimeRunOverviewItems(runDetail).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <RuntimeRunStory runDetail={runDetail} />
        <RuntimeMetricsPanel summary={summary} metrics={metrics} recoveryCount={recoveryAttempts.length} interventionCount={interventions.length} adaptationCount={runDetail.adaptationIds?.length ?? 0} />
      </section>
      <section className="automation-runtime-event-stream" aria-busy={loadingEvents}>
        <header>
          <div><strong>Ordered Event Stream</strong><span>{eventPage.events.length ? `Through sequence ${eventPage.lastSequence}` : loadingEvents ? "Loading events..." : eventPage.loaded ? "No stream events found" : "Events load only when opened"}</span></div>
          <button className="automation-runtime-row-action" disabled={loadingEvents || (eventPage.loaded && !eventPage.hasMore)} onClick={() => void loadEventPage(eventPage.loaded ? eventPage.lastSequence : 0)} type="button">{eventPage.loaded ? "Next Events" : "Load Event Stream"}</button>
        </header>
        {eventError ? <div className="automation-runtime-inline-error" role="alert"><span>{eventError}</span><button className="button" onClick={() => void loadEventPage(eventPage.lastSequence)} type="button">Retry</button></div> : null}
        <ol className="automation-runtime-event-list">
          {eventPage.events.map((event) => <li key={event.eventId ?? event.sequence}><button aria-pressed={selectedEvent === event} onClick={() => setSelectedEvent(event)} type="button"><span>{event.sequence}</span><strong>{event.title ?? event.eventKind ?? "Runtime event"}</strong><StatusBadge value={event.status ?? event.eventKind ?? "event"} /><code>{event.eventKind ?? "event"}</code></button></li>)}
        </ol>
        {selectedEvent ? <aside className="automation-runtime-event-detail" aria-label="Selected event JSON"><header><strong>Event JSON</strong><button aria-label="Close event JSON" className="automation-icon-button" onClick={() => setSelectedEvent(null)} title="Close event JSON" type="button"><X size={16} /></button></header><JsonPreview value={selectedEvent} /></aside> : null}
      </section>
      <div className="automation-runtime-log-toolbar">
        <span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : "No actions"}</span>
        <div>
          <button disabled={loadingActions || actionPage.offset <= 0} onClick={() => void loadActionPage(Math.max(0, actionPage.offset - actionPage.limit))} type="button">Previous</button>
          <button disabled={loadingActions || nextAttemptOffset >= actionTotal} onClick={() => void loadActionPage(nextAttemptOffset)} type="button">Next</button>
        </div>
      </div>
      {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" onClick={() => void loadActionPage(actionPage.offset)} type="button">Retry</button></div> : null}
      <div className={`automation-runtime-action-workspace ${selectedAttempt ? "has-detail" : ""}`}>
        <div className="automation-runtime-action-list-region">
          <ol aria-busy={loadingActions} className="automation-runtime-action-log">
            {visibleAttempts.map((attempt: any, index: number) => (
              <li key={runtimeAttemptKey(attempt, actionPage.offset + index)}>
                <RuntimeAttemptRow
                  attempt={attempt}
                  index={actionPage.offset + index}
                  selected={selectedAttempt?.attemptId === attempt.attemptId}
                  onSelect={() => { setSelectedAttempt(attempt); setActionDetailView("summary"); }}
                />
              </li>
            ))}
          </ol>
          {!actionTotal && !loadingActions ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
        </div>
        {selectedAttempt ? <RuntimeActionDetailPanel attempt={selectedAttempt} index={Math.max(0, visibleAttempts.indexOf(selectedAttempt)) + actionPage.offset} view={actionDetailView} onClose={() => setSelectedAttempt(null)} onView={setActionDetailView} /> : null}
      </div>
      <RuntimeRecoveryRoutingPanel flowId={summary.flowId} recoveryAttempts={recoveryAttempts} routeDecisions={runDetail.routeDecisions ?? []} />

      <RuntimeLlmAdaptationPanel flowId={summary.flowId} runDetail={runDetail} />

      <RuntimeRunStateEffectsPanel runDetail={runDetail} runId={props.runId} visibleAttempts={visibleAttempts} />

    </section>
  );
}

export async function runtimeAuditBlob(audit: unknown): Promise<Blob> {
  if (typeof Worker === "undefined" || typeof URL === "undefined") return new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
  const workerSource = "self.onmessage=function(event){self.postMessage(new Blob([JSON.stringify(event.data,null,2)],{type:'application/json'}));};";
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(workerUrl);
      worker.onmessage = (event) => { worker.terminate(); resolve(event.data as Blob); };
      worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || "Audit serialization failed.")); };
      worker.postMessage(audit);
    });
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}
