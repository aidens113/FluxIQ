"use client";

import { useEffect, useRef, useState } from "react";
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
  const [actionPage, setActionPage] = useState<{ actions: any[]; total: number; limit: number; offset: number; nextCursor: string | null; hasMore: boolean }>(() => ({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0, nextCursor: null, hasMore: embeddedAttempts.length > RUNTIME_ACTION_PAGE_SIZE }));
  const [actionPageIndex, setActionPageIndex] = useState(0);
  const [actionCursors, setActionCursors] = useState<Array<string | null>>([null]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionError, setActionError] = useState("");
  const [eventPage, setEventPage] = useState<{ events: any[]; nextCursor: string | null; hasMore: boolean; lastSequence: number; loaded: boolean }>(() => ({ events: [], nextCursor: null, hasMore: false, lastSequence: 0, loaded: false }));
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventError, setEventError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [loadingEventDetail, setLoadingEventDetail] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [loadingActionDetail, setLoadingActionDetail] = useState(false);
  const [eventScrollTop, setEventScrollTop] = useState(0);
  const detailRequestRef = useRef(0);
  const actionRequestRef = useRef(0);
  const eventRequestRef = useRef(0);
  const actionDetailRequestRef = useRef(0);
  const eventDetailRequestRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);
  const eventAbortRef = useRef<AbortController | null>(null);
  const actionDetailAbortRef = useRef<AbortController | null>(null);
  const eventDetailAbortRef = useRef<AbortController | null>(null);
  const [actionDetailView, setActionDetailView] = useState<"summary" | "data" | "effects" | "state" | "raw">("summary");
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  const nextAttemptOffset = actionPage.offset + actionPage.limit;
  const visibleAttempts = actionPage.actions;
  const actionTotal = actionPage.total;
  const loadActionPage = async (offset: number, cursor: string | null = null) => {
    if (!props.projectId || !props.runId) return;
    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;
    const requestId = ++actionRequestRef.current;
    setLoadingActions(true);
    setActionError("");
    const result = await props.commands.listActions({ projectId: props.projectId, runId: props.runId, limit: RUNTIME_ACTION_PAGE_SIZE, offset, ...(cursor ? { cursor } : {}) }, controller.signal);
    if (controller.signal.aborted || requestId !== actionRequestRef.current) return;
    setLoadingActions(false);
    if (!result.ok) { setActionError(result.error ?? "Actions could not be loaded."); return; }
    const page = result.payload?.page;
    setAttemptOffset(page?.offset ?? offset);
    setSelectedAttempt(null);
    setActionDetailView("summary");
    setActionPage({ actions: result.payload?.actions ?? page?.actions ?? [], total: page?.total ?? result.payload?.actions?.length ?? 0, limit: page?.limit ?? RUNTIME_ACTION_PAGE_SIZE, offset, nextCursor: page?.nextCursor ?? null, hasMore: page?.hasMore === true });
  };
  const loadRunDetail = async () => {
    if (!props.projectId || !props.runId || props.runDetail) return;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = ++detailRequestRef.current;
    setLoadingDetail(true);
    setDetailError("");
    const result = await props.commands.loadDetail({ projectId: props.projectId, runId: props.runId, compact: true }, controller.signal);
    if (controller.signal.aborted || requestId !== detailRequestRef.current) return;
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.runDetail) { setDetailError(result.error ?? "Runtime log could not be loaded."); return; }
    setLoadedRunDetail(result.payload.runDetail);
  };
  const loadEventPage = async (cursor: string | null = null, afterSequence = 0) => {
    if (!props.projectId || !props.runId) return;
    eventAbortRef.current?.abort();
    const controller = new AbortController();
    eventAbortRef.current = controller;
    const requestId = ++eventRequestRef.current;
    setLoadingEvents(true);
    setEventError("");
    const result = await props.commands.listEvents({ projectId: props.projectId, runId: props.runId, limit: RUNTIME_EVENT_PAGE_SIZE, ...(cursor ? { cursor } : { afterSequence }) }, controller.signal);
    if (controller.signal.aborted || requestId !== eventRequestRef.current) return;
    setLoadingEvents(false);
    if (!result.ok) { setEventError(result.error ?? "Runtime events could not be loaded."); return; }
    const page = result.payload?.page;
    const incoming = result.payload?.events ?? page?.events ?? [];
    setEventPage((current) => {
      const byId = new Map<string, any>();
      for (const event of [...current.events, ...incoming]) byId.set(String(event.eventId ?? event.sequence), event);
      const events = [...byId.values()].sort((left, right) => Number(left.sequence) - Number(right.sequence));
      return { events, nextCursor: page?.nextCursor ?? null, hasMore: page?.hasMore === true, lastSequence: page?.lastSequence ?? events.at(-1)?.sequence ?? afterSequence, loaded: true };
    });
  };
  const selectAttempt = async (attempt: any) => {
    actionDetailAbortRef.current?.abort();
    const controller = new AbortController();
    actionDetailAbortRef.current = controller;
    const requestId = ++actionDetailRequestRef.current;
    setSelectedAttempt(attempt);
    setActionDetailView("summary");
    if (!props.projectId || !props.runId || !props.commands.loadActionDetail || attempt.metadata?.summaryOnly !== true) return;
    const attemptId = String(attempt.attemptId ?? "");
    setLoadingActionDetail(true);
    const result = await props.commands.loadActionDetail({ projectId: props.projectId, runId: props.runId, attemptId }, controller.signal);
    if (controller.signal.aborted || requestId !== actionDetailRequestRef.current) return;
    setLoadingActionDetail(false);
    if (result.ok && result.payload?.action && String(result.payload.action.attemptId) === attemptId) setSelectedAttempt(result.payload.action);
  };
  const selectEvent = async (event: any) => {
    eventDetailAbortRef.current?.abort();
    const controller = new AbortController();
    eventDetailAbortRef.current = controller;
    const requestId = ++eventDetailRequestRef.current;
    setSelectedEvent(event);
    if (!props.projectId || !props.runId || !props.commands.loadEventDetail) return;
    const sequence = Number(event.sequence);
    setLoadingEventDetail(true);
    const result = await props.commands.loadEventDetail({ projectId: props.projectId, runId: props.runId, sequence }, controller.signal);
    if (controller.signal.aborted || requestId !== eventDetailRequestRef.current) return;
    setLoadingEventDetail(false);
    if (result.ok && result.payload?.event && Number(result.payload.event.sequence) === sequence) setSelectedEvent(result.payload.event);
  };
  const nextActionPage = () => {
    if (!actionPage.nextCursor) return;
    const nextIndex = actionPageIndex + 1;
    setActionCursors((current) => [...current.slice(0, nextIndex), actionPage.nextCursor]);
    setActionPageIndex(nextIndex);
    void loadActionPage(nextIndex * actionPage.limit, actionPage.nextCursor);
  };
  const previousActionPage = () => {
    const nextIndex = Math.max(0, actionPageIndex - 1);
    setActionPageIndex(nextIndex);
    void loadActionPage(nextIndex * actionPage.limit, actionCursors[nextIndex] ?? null);
  };
  useEffect(() => {
    detailAbortRef.current?.abort();
    actionAbortRef.current?.abort();
    eventAbortRef.current?.abort();
    actionDetailAbortRef.current?.abort();
    eventDetailAbortRef.current?.abort();
    detailRequestRef.current += 1;
    actionRequestRef.current += 1;
    eventRequestRef.current += 1;
    actionDetailRequestRef.current += 1;
    eventDetailRequestRef.current += 1;
    setAttemptOffset(0);
    setActionPageIndex(0);
    setActionCursors([null]);
    setExportMessage("");
    setLoadedRunDetail(props.runDetail ?? null);
    setDetailError("");
    setEventError("");
    setSelectedEvent(null);
    setSelectedAttempt(null);
    setLoadingActionDetail(false);
    setLoadingEventDetail(false);
    setLoadingDetail(false);
    setLoadingActions(false);
    setLoadingEvents(false);
    setEventPage({ events: [], nextCursor: null, hasMore: false, lastSequence: 0, loaded: false });
    if (props.projectId && props.runId) {
      void loadRunDetail();
      void loadActionPage(0);
    }
    else setActionPage({ actions: embeddedAttempts.slice(0, RUNTIME_ACTION_PAGE_SIZE), total: embeddedAttempts.length, limit: RUNTIME_ACTION_PAGE_SIZE, offset: 0, nextCursor: null, hasMore: embeddedAttempts.length > RUNTIME_ACTION_PAGE_SIZE });
  }, [props.projectId, props.runId]);
  useEffect(() => () => {
    detailAbortRef.current?.abort();
    actionAbortRef.current?.abort();
    eventAbortRef.current?.abort();
    actionDetailAbortRef.current?.abort();
    eventDetailAbortRef.current?.abort();
    detailRequestRef.current += 1;
    actionRequestRef.current += 1;
    eventRequestRef.current += 1;
    actionDetailRequestRef.current += 1;
    eventDetailRequestRef.current += 1;
  }, []);
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
  const eventRowHeight = 38;
  const eventViewportHeight = 360;
  const eventStart = Math.max(0, Math.floor(eventScrollTop / eventRowHeight) - 6);
  const eventEnd = Math.min(eventPage.events.length, eventStart + Math.ceil(eventViewportHeight / eventRowHeight) + 12);
  const visibleEvents = eventPage.events.slice(eventStart, eventEnd);
  if (!runDetail) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button><div><strong>Action Log</strong><span>{loadingDetail || props.loading ? `Loading ${props.runId ?? "run"}...` : detailError || props.error || (props.runId ? `Waiting for ${props.runId}...` : "Run not found.")}</span></div></header>
        <div className="automation-runtime-log-toolbar"><span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : loadingActions ? "Loading actions..." : "No actions loaded yet"}</span><div><button disabled={loadingActions || actionPageIndex <= 0} onClick={previousActionPage} type="button">Previous</button><button disabled={loadingActions || !actionPage.hasMore} onClick={nextActionPage} type="button">Next</button></div></div>
        {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" onClick={() => void loadActionPage(actionPage.offset, actionCursors[actionPageIndex] ?? null)} type="button">Retry</button></div> : null}
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
          <button className="automation-runtime-row-action" disabled={loadingEvents || (eventPage.loaded && !eventPage.hasMore)} onClick={() => void loadEventPage(eventPage.loaded ? eventPage.nextCursor : null, eventPage.loaded ? eventPage.lastSequence : 0)} type="button">{eventPage.loaded ? "Next Events" : "Load Event Stream"}</button>
        </header>
        {eventError ? <div className="automation-runtime-inline-error" role="alert"><span>{eventError}</span><button className="button" onClick={() => void loadEventPage(eventPage.nextCursor, eventPage.lastSequence)} type="button">Retry</button></div> : null}
        <ol className="automation-runtime-event-list" onScroll={(event) => setEventScrollTop(event.currentTarget.scrollTop)} style={{ maxHeight: eventViewportHeight, overflowY: "auto" }}>
          {eventStart ? <li aria-hidden style={{ height: eventStart * eventRowHeight }} /> : null}
          {visibleEvents.map((event) => <li key={event.eventId ?? event.sequence}><button aria-pressed={selectedEvent?.eventId === event.eventId} onClick={() => void selectEvent(event)} type="button"><span>{event.sequence}</span><strong>{event.title ?? event.eventKind ?? "Runtime event"}</strong><StatusBadge value={event.status ?? event.eventKind ?? "event"} /><code>{event.eventKind ?? "event"}</code></button></li>)}
          {eventEnd < eventPage.events.length ? <li aria-hidden style={{ height: (eventPage.events.length - eventEnd) * eventRowHeight }} /> : null}
        </ol>
        {selectedEvent ? <aside className="automation-runtime-event-detail" aria-label="Selected event JSON"><header><strong>{loadingEventDetail ? "Loading event details" : "Event JSON"}</strong><button aria-label="Close event JSON" className="automation-icon-button" onClick={() => { eventDetailAbortRef.current?.abort(); eventDetailRequestRef.current += 1; setLoadingEventDetail(false); setSelectedEvent(null); }} title="Close event JSON" type="button"><X size={16} /></button></header><JsonPreview value={selectedEvent} /></aside> : null}
      </section>
      <div className="automation-runtime-log-toolbar">
        <span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : "No actions"}</span>
        <div>
          <button disabled={loadingActions || actionPageIndex <= 0} onClick={previousActionPage} type="button">Previous</button>
          <button disabled={loadingActions || !actionPage.hasMore} onClick={nextActionPage} type="button">Next</button>
        </div>
      </div>
      {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" onClick={() => void loadActionPage(actionPage.offset, actionCursors[actionPageIndex] ?? null)} type="button">Retry</button></div> : null}
      <div className={`automation-runtime-action-workspace ${selectedAttempt ? "has-detail" : ""}`}>
        <div className="automation-runtime-action-list-region">
          <ol aria-busy={loadingActions} className="automation-runtime-action-log">
            {visibleAttempts.map((attempt: any, index: number) => (
              <li key={runtimeAttemptKey(attempt, actionPage.offset + index)}>
                <RuntimeAttemptRow
                  attempt={attempt}
                  index={actionPage.offset + index}
                  selected={selectedAttempt?.attemptId === attempt.attemptId}
                  onSelect={() => void selectAttempt(attempt)}
                />
              </li>
            ))}
          </ol>
          {!actionTotal && !loadingActions ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
        </div>
        {selectedAttempt ? <div aria-busy={loadingActionDetail}><RuntimeActionDetailPanel attempt={selectedAttempt} index={Math.max(0, visibleAttempts.findIndex((attempt) => attempt.attemptId === selectedAttempt.attemptId)) + actionPage.offset} view={actionDetailView} onClose={() => { actionDetailAbortRef.current?.abort(); actionDetailRequestRef.current += 1; setLoadingActionDetail(false); setSelectedAttempt(null); }} onView={setActionDetailView} /></div> : null}
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
