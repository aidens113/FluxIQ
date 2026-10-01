"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { RunDatasetsPanel } from "../datasets";
import { useRuntimeDetailCommands, type RuntimeDetailCommands } from "./runtime-host";
import { runtimeAuditBlob } from "./audit-export";
export { runtimeAuditBlob } from "./audit-export";
export type RunActionLogViewProps = { projectId?: string | null; runId: string | null; runDetail: any | null; loading: boolean; error: string; onBack(): void };

export function RunActionLogView(props: RunActionLogViewProps & { commands?: RuntimeDetailCommands }) {
  const hostCommands = useRuntimeDetailCommands();
  return <RunActionLogViewContent {...props} commands={props.commands ?? hostCommands} />;
}

export function RunActionLogViewContent(props: RunActionLogViewProps & { commands: RuntimeDetailCommands }) {
  // Change ownership during render, before passive cleanup or retained handlers.
  const ownerRef = useRef({ projectId: props.projectId, runId: props.runId, commands: props.commands, generation: 0 });
  if (ownerRef.current.projectId !== props.projectId || ownerRef.current.runId !== props.runId || ownerRef.current.commands !== props.commands) {
    ownerRef.current = { projectId: props.projectId, runId: props.runId, commands: props.commands, generation: ownerRef.current.generation + 1 };
  }
  const owner = ownerRef.current;
  return <RuntimeLogScope key={owner.generation} {...props} isOwnerCurrent={() => ownerRef.current === owner} />;
}

function RuntimeLogScope(props: RunActionLogViewProps & { commands: RuntimeDetailCommands; isOwnerCurrent(): boolean }) {
  const mountedRef = useRef(true);
  const isCurrent = () => mountedRef.current && props.isOwnerCurrent();
  const providedRunDetail = matchingRun(props.runDetail, props.runId ?? "") && matchingRun(props.runDetail?.summary, props.runId ?? "") && matchingRun(props.runDetail?.trace, props.runId ?? "") ? props.runDetail : null;
  const [attemptOffset, setAttemptOffset] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportPreparing, setExportPreparing] = useState(false);
  const [loadedRunDetail, setLoadedRunDetail] = useState<any | null>(providedRunDetail ?? null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const runDetail = providedRunDetail ?? loadedRunDetail;
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
  const [eventDetailError, setEventDetailError] = useState("");
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [loadingActionDetail, setLoadingActionDetail] = useState(false);
  const [actionDetailError, setActionDetailError] = useState("");
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
  const exportAbortRef = useRef<AbortController | null>(null);
  const actionQueryRef = useRef({ offset: 0, cursor: null as string | null, index: 0 });
  const [actionDetailView, setActionDetailView] = useState<"summary" | "data" | "effects" | "state" | "raw">("summary");
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  const nextAttemptOffset = actionPage.offset + actionPage.limit;
  const visibleAttempts = actionPage.actions;
  const actionTotal = actionPage.total;
  const loadActionPage = async (offset: number, cursor: string | null = null, index = actionPageIndex) => {
    if (!isCurrent() || !props.projectId || !props.runId) return;
    const runId = props.runId;
    actionQueryRef.current = { offset, cursor, index };
    actionDetailAbortRef.current?.abort();
    ++actionDetailRequestRef.current;
    setLoadingActionDetail(false);
    setActionDetailError("");
    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;
    const requestId = ++actionRequestRef.current;
    const current = () => isCurrent() && !controller.signal.aborted && requestId === actionRequestRef.current;
    setLoadingActions(true);
    setActionError("");
    try {
      const result = await props.commands.listActions({ projectId: props.projectId, runId: props.runId, limit: RUNTIME_ACTION_PAGE_SIZE, offset, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (!current()) return;
      const payload = validPayload(result, props.runId);
      const page = validPage(payload.page);
      for (const rows of [payload.actions, page.actions]) if (rows !== undefined && !Array.isArray(rows)) throw new Error();
      if (page.hasMore === true && !page.nextCursor) throw new Error();
      const actions = payload.actions ?? page.actions ?? [];
      if (!Array.isArray(actions) || !actions.every((row) => isRuntimeJsonRecord(row) && typeof row.attemptId === "string" && row.attemptId.length > 0 && matchingRun(row, runId))) throw new Error();
      setAttemptOffset(page.offset ?? offset);
      setSelectedAttempt(null);
      setActionDetailView("summary");
      setActionPage({ actions, total: page.total ?? actions.length, limit: page.limit ?? RUNTIME_ACTION_PAGE_SIZE, offset: page.offset ?? offset, nextCursor: page.nextCursor ?? null, hasMore: page.hasMore === true });
      setActionPageIndex(index);
      setActionCursors((prior) => [...prior.slice(0, index), cursor]);
    } catch { if (current()) setActionError("Actions could not be loaded."); }
    finally { if (current()) setLoadingActions(false); }
  };
  const retryActions = () => {
    if (!isCurrent()) return;
    const query = actionQueryRef.current;
    void loadActionPage(query.offset, query.cursor, query.index);
  };
  const loadRunDetail = async () => {
    if (!isCurrent() || !props.projectId || !props.runId || providedRunDetail) return;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = ++detailRequestRef.current;
    const current = () => isCurrent() && !controller.signal.aborted && requestId === detailRequestRef.current;
    setLoadingDetail(true);
    setDetailError("");
    try {
      const result = await props.commands.loadDetail({ projectId: props.projectId, runId: props.runId, compact: true }, controller.signal);
      if (!current()) return;
      const detail = validPayload(result, props.runId).runDetail;
      if (!isRuntimeJsonRecord(detail) || (!isRuntimeJsonRecord(detail.summary) && !isRuntimeJsonRecord(detail.trace)) || !matchingRun(detail, props.runId) || !matchingRun(detail.summary, props.runId) || !matchingRun(detail.trace, props.runId)) throw new Error();
      for (const record of [detail.summary, detail.trace, detail.metadata]) if (record != null && !isRuntimeJsonRecord(record)) throw new Error();
      for (const value of [detail.summary?.status, detail.summary?.flowId, detail.trace?.status, detail.metadata?.message, detail.metadata?.terminalFailureReason]) if (value != null && typeof value !== "string") throw new Error();
      for (const key of ["attempts", "recoveryAttempts", "interventions", "routeDecisions", "adaptationIds", "datasets"]) if (detail[key] !== undefined && !Array.isArray(detail[key])) throw new Error();
      setLoadedRunDetail(detail);
    } catch { if (current()) setDetailError("Runtime log could not be loaded."); }
    finally { if (current()) setLoadingDetail(false); }
  };
  const loadEventPage = async (cursor: string | null = null, afterSequence = 0) => {
    if (!isCurrent() || !props.projectId || !props.runId) return;
    const runId = props.runId;
    eventAbortRef.current?.abort();
    const controller = new AbortController();
    eventAbortRef.current = controller;
    const requestId = ++eventRequestRef.current;
    const current = () => isCurrent() && !controller.signal.aborted && requestId === eventRequestRef.current;
    setLoadingEvents(true);
    setEventError("");
    try {
      const result = await props.commands.listEvents({ projectId: props.projectId, runId: props.runId, limit: RUNTIME_EVENT_PAGE_SIZE, ...(cursor ? { cursor } : { afterSequence }) }, controller.signal);
      if (!current()) return;
      const payload = validPayload(result, props.runId);
      const page = validPage(payload.page);
      for (const rows of [payload.events, page.events]) if (rows !== undefined && !Array.isArray(rows)) throw new Error();
      const incoming = payload.events ?? page.events ?? [];
      if (!Array.isArray(incoming) || !incoming.every((row) => isRuntimeJsonRecord(row) && nonnegativeInteger(row.sequence) && matchingRun(row, runId) && [row.eventId, row.title, row.eventKind, row.status].every((value) => value == null || typeof value === "string"))) throw new Error();
      setEventPage((prior) => {
        const byId = new Map<string, any>();
        for (const event of [...prior.events, ...incoming]) byId.set(String(event.eventId ?? event.sequence), event);
        const events = [...byId.values()].sort((left, right) => Number(left.sequence) - Number(right.sequence));
        return { events, nextCursor: page.nextCursor ?? null, hasMore: page.hasMore === true, lastSequence: page.lastSequence ?? events.at(-1)?.sequence ?? afterSequence, loaded: true };
      });
    } catch { if (current()) setEventError("Runtime events could not be loaded."); }
    finally { if (current()) setLoadingEvents(false); }
  };
  const selectAttempt = async (attempt: any) => {
    if (!isCurrent()) return;
    actionDetailAbortRef.current?.abort();
    const controller = new AbortController();
    actionDetailAbortRef.current = controller;
    const requestId = ++actionDetailRequestRef.current;
    setSelectedAttempt(attempt);
    setActionDetailView("summary");
    setLoadingActionDetail(false);
    setActionDetailError("");
    if (!props.projectId || !props.runId || !props.commands.loadActionDetail || attempt.metadata?.summaryOnly !== true) return;
    const attemptId = String(attempt.attemptId ?? "");
    setLoadingActionDetail(true);
    try {
      const result = await props.commands.loadActionDetail({ projectId: props.projectId, runId: props.runId, attemptId }, controller.signal);
      if (!isCurrent() || controller.signal.aborted || requestId !== actionDetailRequestRef.current) return;
      if (result.ok && result.payload?.action && matchingRun(result.payload, props.runId) && matchingRun(result.payload.action, props.runId) && String(result.payload.action.attemptId) === attemptId) setSelectedAttempt(result.payload.action);
      else setActionDetailError("Action details could not be loaded. The summary remains available.");
    } catch {
      if (isCurrent() && !controller.signal.aborted && requestId === actionDetailRequestRef.current) setActionDetailError("Action details could not be loaded. The summary remains available.");
    } finally {
      if (isCurrent() && !controller.signal.aborted && requestId === actionDetailRequestRef.current) setLoadingActionDetail(false);
    }
  };
  const selectEvent = async (event: any) => {
    if (!isCurrent()) return;
    eventDetailAbortRef.current?.abort();
    const controller = new AbortController();
    eventDetailAbortRef.current = controller;
    const requestId = ++eventDetailRequestRef.current;
    setSelectedEvent(event);
    setLoadingEventDetail(false);
    setEventDetailError("");
    if (!props.projectId || !props.runId || !props.commands.loadEventDetail) return;
    const sequence = Number(event.sequence);
    setLoadingEventDetail(true);
    try {
      const result = await props.commands.loadEventDetail({ projectId: props.projectId, runId: props.runId, sequence }, controller.signal);
      if (!isCurrent() || controller.signal.aborted || requestId !== eventDetailRequestRef.current) return;
      if (result.ok && result.payload?.event && matchingRun(result.payload, props.runId) && matchingRun(result.payload.event, props.runId) && Number(result.payload.event.sequence) === sequence) setSelectedEvent(result.payload.event);
      else setEventDetailError("Event details could not be loaded. The summary remains available.");
    } catch {
      if (isCurrent() && !controller.signal.aborted && requestId === eventDetailRequestRef.current) setEventDetailError("Event details could not be loaded. The summary remains available.");
    } finally {
      if (isCurrent() && !controller.signal.aborted && requestId === eventDetailRequestRef.current) setLoadingEventDetail(false);
    }
  };
  const nextActionPage = () => {
    if (!isCurrent() || !actionPage.nextCursor) return;
    const nextIndex = actionPageIndex + 1;
    void loadActionPage(actionPage.offset + actionPage.limit, actionPage.nextCursor, nextIndex);
  };
  const previousActionPage = () => {
    if (!isCurrent()) return;
    const nextIndex = Math.max(0, actionPageIndex - 1);
    void loadActionPage(nextIndex * actionPage.limit, actionCursors[nextIndex] ?? null, nextIndex);
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
    setLoadedRunDetail(providedRunDetail ?? null);
    setDetailError("");
    setEventError("");
    setActionDetailError("");
    setEventDetailError("");
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
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
    mountedRef.current = false;
    exportAbortRef.current?.abort();
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
    };
  }, []);
  const exportAudit = async () => {
    const runId = props.runId;
    if (!isCurrent() || !props.projectId || !runId || exportAbortRef.current) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const current = () => isCurrent() && !controller.signal.aborted && exportAbortRef.current === controller;
    setExportPreparing(true);
    setExportMessage("Preparing complete audit export...");
    try {
      const result = await props.commands.exportAudit({ projectId: props.projectId, runId });
      if (!current()) return;
      const audit = validPayload(result, runId).audit;
      if (!isRuntimeJsonRecord(audit) || !isRuntimeJsonRecord(audit.manifest) || !matchingRun(audit, runId) || !matchingRun(audit.manifest, runId) || (audit.manifest.actionCount !== undefined && !nonnegativeInteger(audit.manifest.actionCount))) throw new Error();
      const blob = await runtimeAuditBlob(audit, controller.signal);
      if (!current()) return;
      if (typeof window !== "undefined" && typeof URL !== "undefined") {
        const url = URL.createObjectURL(blob);
        let scheduled = false;
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `fluxiq-run-audit-${runId}.json`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 0);
          scheduled = true;
        } finally { if (!scheduled) URL.revokeObjectURL(url); }
      }
      if (current()) setExportMessage(`Audit export ready with ${audit.manifest.actionCount ?? 0} actions.`);
    } catch { if (current()) setExportMessage("Audit export could not be prepared. Try Export Audit again."); }
    finally {
      if (current()) { exportAbortRef.current = null; setExportPreparing(false); }
    }
  };
  const eventRowHeight = 38;
  const eventViewportHeight = 360;
  const eventStart = Math.max(0, Math.floor(eventScrollTop / eventRowHeight) - 6);
  const eventEnd = Math.min(eventPage.events.length, eventStart + Math.ceil(eventViewportHeight / eventRowHeight) + 12);
  const visibleEvents = eventPage.events.slice(eventStart, eventEnd);
  if (!runDetail) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={() => { if (isCurrent()) props.onBack(); }} type="button">Back</button><div><strong>Action Log</strong><span>{loadingDetail || props.loading ? `Loading ${props.runId ?? "run"}...` : detailError || props.error || (props.runId ? `Waiting for ${props.runId}...` : "Run not found.")}</span></div></header>
        {detailError ? <div role="alert"><span>{detailError}</span><button aria-label="Retry runtime log" disabled={loadingDetail} onClick={() => void loadRunDetail()} type="button">Retry</button></div> : null}
        <div className="automation-runtime-log-toolbar"><span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : loadingActions ? "Loading actions..." : "No actions loaded yet"}</span><div><button disabled={loadingActions || actionPageIndex <= 0} onClick={previousActionPage} type="button">Previous</button><button disabled={loadingActions || !actionPage.hasMore} onClick={nextActionPage} type="button">Next</button></div></div>
        {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" aria-label="Retry actions" disabled={loadingActions} onClick={retryActions} type="button">Retry</button></div> : null}
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
          <button className="automation-runtime-back" onClick={() => { if (isCurrent()) props.onBack(); }} type="button">Back</button>
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
      {props.commands.datasets ? <RunDatasetsPanel commands={props.commands.datasets} datasets={runDetail?.datasets ?? []} projectId={props.projectId} runId={props.runId} /> : null}
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
        {eventError ? <div className="automation-runtime-inline-error" role="alert"><span>{eventError}</span><button className="button" aria-label="Retry events" disabled={loadingEvents} onClick={() => void loadEventPage(eventPage.nextCursor, eventPage.lastSequence)} type="button">Retry</button></div> : null}
        <ol className="automation-runtime-event-list" onScroll={(event) => { if (isCurrent()) setEventScrollTop(event.currentTarget.scrollTop); }} style={{ maxHeight: eventViewportHeight, overflowY: "auto" }}>
          {eventStart ? <li aria-hidden style={{ height: eventStart * eventRowHeight }} /> : null}
          {visibleEvents.map((event) => <li key={event.eventId ?? event.sequence}><button aria-pressed={selectedEvent?.eventId === event.eventId} onClick={() => void selectEvent(event)} type="button"><span>{event.sequence}</span><strong>{event.title ?? event.eventKind ?? "Runtime event"}</strong><StatusBadge value={event.status ?? event.eventKind ?? "event"} /><code>{event.eventKind ?? "event"}</code></button></li>)}
          {eventEnd < eventPage.events.length ? <li aria-hidden style={{ height: (eventPage.events.length - eventEnd) * eventRowHeight }} /> : null}
        </ol>
        {selectedEvent ? <aside className="automation-runtime-event-detail" aria-busy={loadingEventDetail} aria-label="Selected event JSON"><header><strong>{loadingEventDetail ? "Loading event details" : "Event JSON"}</strong><button aria-label="Close event JSON" className="automation-icon-button" onClick={() => { if (!isCurrent()) return; eventDetailAbortRef.current?.abort(); eventDetailRequestRef.current += 1; setLoadingEventDetail(false); setEventDetailError(""); setSelectedEvent(null); }} title="Close event JSON" type="button"><X size={16} /></button></header>
          {selectedEvent.metadata?.summaryOnly === true ? <p role="status">Summary only. {loadingEventDetail ? "Loading full event details." : "Full details are not loaded."}</p> : null}
          {eventDetailError ? <div role="alert"><span>{eventDetailError}</span><button aria-label="Retry event details" disabled={loadingEventDetail} onClick={() => void selectEvent(selectedEvent)} type="button">Retry</button></div> : null}
          <JsonPreview value={selectedEvent} /></aside> : null}
      </section>
      <div className="automation-runtime-log-toolbar">
        <span>{actionTotal ? `${actionPage.offset + 1}-${Math.min(actionTotal, nextAttemptOffset)} of ${actionTotal} actions` : "No actions"}</span>
        <div>
          <button disabled={loadingActions || actionPageIndex <= 0} onClick={previousActionPage} type="button">Previous</button>
          <button disabled={loadingActions || !actionPage.hasMore} onClick={nextActionPage} type="button">Next</button>
        </div>
      </div>
      {actionError ? <div className="automation-runtime-inline-error" role="alert"><span>{actionError}</span><button className="button" aria-label="Retry actions" disabled={loadingActions} onClick={retryActions} type="button">Retry</button></div> : null}
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
        {selectedAttempt ? <div aria-busy={loadingActionDetail}>
          {selectedAttempt.metadata?.summaryOnly === true ? <p role="status">Summary only. {loadingActionDetail ? "Loading action details." : "Full details are not loaded."}</p> : null}
          {actionDetailError ? <div role="alert"><span>{actionDetailError}</span><button aria-label="Retry action details" disabled={loadingActionDetail} onClick={() => void selectAttempt(selectedAttempt)} type="button">Retry</button></div> : null}
          <RuntimeActionDetailPanel attempt={selectedAttempt} index={Math.max(0, visibleAttempts.findIndex((attempt) => attempt.attemptId === selectedAttempt.attemptId)) + actionPage.offset} view={actionDetailView} onClose={() => { if (!isCurrent()) return; actionDetailAbortRef.current?.abort(); actionDetailRequestRef.current += 1; setLoadingActionDetail(false); setActionDetailError(""); setSelectedAttempt(null); }} onView={(view) => { if (isCurrent()) setActionDetailView(view); }} /></div> : null}
      </div>
      <RuntimeRecoveryRoutingPanel flowId={summary.flowId} recoveryAttempts={recoveryAttempts} routeDecisions={runDetail.routeDecisions ?? []} />

      <RuntimeLlmAdaptationPanel flowId={summary.flowId} runDetail={runDetail} />

      <RuntimeRunStateEffectsPanel runDetail={runDetail} runId={props.runId} visibleAttempts={visibleAttempts} />

    </section>
  );
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function matchingRun(value: any, runId: string): boolean {
  return value == null || value.runId === undefined || value.runId === runId;
}
function validPayload(result: any, runId: string): any {
  if (!isRuntimeJsonRecord(result) || result.ok !== true || !isRuntimeJsonRecord(result.payload) || !matchingRun(result.payload, runId)) throw new Error();
  return result.payload;
}
function validPage(value: any): any {
  if (value === undefined) return {};
  if (!isRuntimeJsonRecord(value)) throw new Error();
  for (const key of ["total", "offset", "lastSequence"]) if (value[key] !== undefined && !nonnegativeInteger(value[key])) throw new Error();
  if (value.limit !== undefined && (!nonnegativeInteger(value.limit) || value.limit === 0)) throw new Error();
  if (value.nextCursor !== undefined && value.nextCursor !== null && (typeof value.nextCursor !== "string" || !value.nextCursor)) throw new Error();
  if (value.hasMore !== undefined && typeof value.hasMore !== "boolean") throw new Error();
  return value;
}
