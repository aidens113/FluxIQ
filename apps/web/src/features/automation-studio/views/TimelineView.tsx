"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Clock, FileText, List, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { JsonObject } from "../../programs/program-api";
import { useProgramApi } from "../../programs/program-api";
import { Field, Modal, StatusText } from "../../programs/shared-ui";
import type { AutomationSelection, RecordingProcessingStatus } from "../types";
import { formatTimelineDuration, isRejectedRecordingMarker, timelineEntryIcon, timelineEntrySummary, timelineEntryTitle } from "../timeline/view-model";
type RecordingActionKind = "rename" | "note" | "marker" | "finalize" | "repair" | "delete";
const timelineEventWindowSize = 200;

export function AutomationTimelineView(props: {
  actionStatus: string;
  projectId: string | null;
  entries: any[];
  notes: any[];
  recordings: any[];
  recordingProcessing: RecordingProcessingStatus | null;
  selectedEntry: any;
  selectedRecording: any;
  selectedTimeline: any;
  timelines: any[];
  onAppendRecordingMarker(recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number, label?: string, authorizationPin?: string): Promise<void>;
  onAppendRecordingNote(recordingId: string, linkedEntryId?: string, text?: string, authorizationPin?: string): Promise<void>;
  onDeleteRecording(recordingId: string, authorizationPin?: string): Promise<void>;
  onFinalizeRecording(recordingId: string, authorizationPin?: string): Promise<void>;
  onOpenTimelineEntryState(recordingId: string, entryId: string): void;
  onRefreshRecordings(): Promise<void>;
  onUpdateRecording(recordingId: string, changes: JsonObject, authorizationPin?: string): Promise<void>;
  setSelection(selection: AutomationSelection): void;
}) {
  const api = useProgramApi("automation-studio");
  const [innerView, setInnerView] = useState<"list" | "timeline">(props.selectedRecording ? "timeline" : "list");
  const [recordingPage, setRecordingPage] = useState<{ recordings: any[]; limit: number; offset: number; total: number }>(() => ({ recordings: props.recordings.slice(0, 25), limit: 25, offset: 0, total: props.recordings.length }));
  const [recordingListLoading, setRecordingListLoading] = useState(false);
  const [recordingListError, setRecordingListError] = useState("");
  const [recordingListReload, setRecordingListReload] = useState(0);
  const [recordingDialog, setRecordingDialog] = useState<RecordingActionKind | null>(null);
  const [recordingDialogValue, setRecordingDialogValue] = useState("");
  const [recordingDialogPin, setRecordingDialogPin] = useState("");
  const [recordingDialogBusy, setRecordingDialogBusy] = useState(false);
  const [recordingDialogError, setRecordingDialogError] = useState("");
  const [timelineOffset, setTimelineOffset] = useState(0);
  const recordingListRequestRef = useRef(0);
  const timelineEditorRef = useRef<HTMLDivElement>(null);
  const suppressOverviewClickRef = useRef(false);
  const noteById = useMemo(() => new Map(props.notes.map((note) => [note.id, note])), [props.notes]);
  const sortedEntries = useMemo(() => props.entries.filter((entry) => !isRejectedRecordingMarker(entry)).sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0)), [props.entries]);
  const totalMs = Math.max(0, ...sortedEntries.map((entry) => entry.monotonicOffsetMs ?? 0));
  const timelineSteps = sortedEntries.map((entry, index) => {
    const previous = sortedEntries[index - 1];
    const waitMs = previous ? Math.max(0, (entry.monotonicOffsetMs ?? 0) - (previous.monotonicOffsetMs ?? 0)) : Math.max(0, entry.monotonicOffsetMs ?? 0);
    return { entry, waitMs };
  });
  const selectedNote = props.selectedEntry?.type === "note" ? noteById.get(props.selectedEntry.noteId) : null;
  const lanes = [
    { id: "timing", label: "Timing", types: [] },
    { id: "actions", label: "Actions", types: ["action", "domain_event"] },
    { id: "state", label: "State", types: ["observation", "state_delta", "state_checkpoint"] },
    { id: "notes", label: "Notes", types: ["note"] },
    { id: "markers", label: "Markers", types: ["marker"] }
  ];
  const selectedStepIndex = timelineSteps.findIndex((step) => step.entry.id === props.selectedEntry?.id);
  const timelineWindow = timelineEventWindow(timelineSteps.length, timelineOffset, timelineEventWindowSize);
  const visibleTimelineSteps = timelineSteps.slice(timelineWindow.start, timelineWindow.end);
  const timelineStepKey = (laneId: string, step: { entry: any; waitMs: number }, index: number) => `${laneId}:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`;
  const gridColumns = `repeat(${Math.max(1, visibleTimelineSteps.length)}, minmax(180px, 220px))`;
  const selectedDuration = props.selectedRecording
    ? props.selectedRecording.endedAt ? Math.max(0, props.selectedRecording.endedAt - props.selectedRecording.startedAt) : Math.max(0, Date.now() - props.selectedRecording.startedAt)
    : 0;
  const selectedIsNormalized = props.selectedRecording ? props.timelines.some((timeline) => timeline.recordingId === props.selectedRecording.recordingId) : false;
  const processing = props.selectedRecording && props.recordingProcessing?.recordingId === props.selectedRecording.recordingId ? props.recordingProcessing : null;
  const scrollToTimelineStep = (index: number, behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const editor = timelineEditorRef.current;
      if (!editor) return;
      const target = editor.querySelector<HTMLElement>(`.automation-timeline-slot[data-timeline-index="${index}"]`);
      if (!target) return;
      const editorBounds = editor.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const targetCenter = targetBounds.left - editorBounds.left + editor.scrollLeft + targetBounds.width / 2;
      const maxScrollLeft = Math.max(0, editor.scrollWidth - editor.clientWidth);
      editor.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, targetCenter - editor.clientWidth / 2)),
        behavior
      });
    });
  };
  const selectPreviewStep = (entryId: string, index: number) => {
    if (suppressOverviewClickRef.current) {
      suppressOverviewClickRef.current = false;
      return;
    }
    props.setSelection({ kind: "timeline", id: entryId });
    scrollToTimelineStep(index);
  };
  const selectTimelineStepAt = (index: number) => {
    const step = timelineSteps[index];
    if (!step) return;
    props.setSelection({ kind: "timeline", id: step.entry.id });
    scrollToTimelineStep(index);
  };
  const handleTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextIndex = timelineKeyboardTargetIndex(event.key, selectedStepIndex, timelineSteps.length);
    if (nextIndex === null) return;
    event.preventDefault();
    selectTimelineStepAt(nextIndex);
  };
  const openRecordingDialog = (kind: RecordingActionKind) => {
    setRecordingDialog(kind);
    setRecordingDialogValue(kind === "rename" ? props.selectedRecording?.metadata?.name ?? props.selectedRecording?.recordingId ?? "" : "");
    setRecordingDialogPin("");
    setRecordingDialogError("");
  };
  const submitRecordingDialog = async () => {
    if (!recordingDialog || !props.selectedRecording) return;
    if (recordingDialogPin.length < 4) { setRecordingDialogError("Enter your security PIN."); return; }
    if (["rename", "note", "marker"].includes(recordingDialog) && !recordingDialogValue.trim()) { setRecordingDialogError(recordingDialog === "rename" ? "Enter a recording name." : recordingDialog === "note" ? "Enter note text." : "Enter a marker label."); return; }
    setRecordingDialogBusy(true);
    setRecordingDialogError("");
    const recordingId = props.selectedRecording.recordingId;
    if (recordingDialog === "rename") await props.onUpdateRecording(recordingId, { name: recordingDialogValue.trim() }, recordingDialogPin);
    if (recordingDialog === "note") await props.onAppendRecordingNote(recordingId, props.selectedEntry?.id, recordingDialogValue.trim(), recordingDialogPin);
    if (recordingDialog === "marker") await props.onAppendRecordingMarker(recordingId, props.selectedEntry?.id, props.selectedEntry?.monotonicOffsetMs, recordingDialogValue.trim(), recordingDialogPin);
    if (recordingDialog === "finalize") await props.onFinalizeRecording(recordingId, recordingDialogPin);
    if (recordingDialog === "delete") await props.onDeleteRecording(recordingId, recordingDialogPin);
    if (recordingDialog === "repair") {
      if (!props.projectId) { setRecordingDialogError("Open a project before repairing recording state."); setRecordingDialogBusy(false); return; }
      const result = await api.post<{ warnings?: string[] }>("repair-recording-state-index", { projectId: props.projectId, recordingId, mode: "write", authorizationPin: recordingDialogPin });
      if (!result.ok) { setRecordingDialogError(result.error ?? "Recording state index could not be repaired."); setRecordingDialogBusy(false); return; }
      await props.onRefreshRecordings();
    }
    setRecordingDialogBusy(false);
    setRecordingDialog(null);
  };
  const handleOverviewPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    suppressOverviewClickRef.current = event.clientY >= bounds.bottom - 18;
  };
  const handleOverviewClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressOverviewClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressOverviewClickRef.current = false;
  };
  useEffect(() => {
    if (selectedStepIndex < 0) return;
    const selectedWindowStart = Math.floor(selectedStepIndex / timelineEventWindowSize) * timelineEventWindowSize;
    if (selectedWindowStart !== timelineOffset) { setTimelineOffset(selectedWindowStart); return; }
    scrollToTimelineStep(selectedStepIndex);
  }, [selectedStepIndex, timelineOffset]);
  useEffect(() => { if (props.selectedRecording?.recordingId) setInnerView("timeline"); }, [props.selectedRecording?.recordingId]);
  useEffect(() => {
    if (innerView !== "list") return;
    const requestId = ++recordingListRequestRef.current;
    setRecordingListLoading(true);
    setRecordingListError("");
    if (!props.projectId) {
      setRecordingPage((current) => ({ recordings: props.recordings.slice(current.offset, current.offset + current.limit), limit: current.limit, offset: current.offset, total: props.recordings.length }));
      setRecordingListLoading(false);
      return;
    }
    void api.post<{ recordings?: any[]; page?: { limit: number; offset: number; total: number } }>("list-recordings", { projectId: props.projectId, summaries: true, limit: recordingPage.limit, offset: recordingPage.offset }).then((result) => {
      if (recordingListRequestRef.current !== requestId) return;
      if (!result.ok) { setRecordingListError(result.error ?? "Recordings could not be loaded."); setRecordingListLoading(false); return; }
      const page = result.payload?.page ?? { limit: recordingPage.limit, offset: recordingPage.offset, total: result.payload?.recordings?.length ?? 0 };
      setRecordingPage({ recordings: result.payload?.recordings ?? [], ...page });
      setRecordingListLoading(false);
    });
  }, [api, innerView, props.projectId, props.recordings, recordingPage.limit, recordingPage.offset, recordingListReload]);
  if (innerView === "list") {
    return <section className="automation-timeline-view"><RecordingInnerNavigation view={innerView} onView={setInnerView} /><RecordingListPage error={recordingListError} loading={recordingListLoading} page={recordingPage} onRetry={() => setRecordingListReload((value) => value + 1)} onOpen={(recordingId) => { props.setSelection({ kind: "recording", id: recordingId }); setInnerView("timeline"); }} onPage={(offset) => setRecordingPage((current) => ({ ...current, offset }))} /></section>;
  }
  return (
    <section className="automation-timeline-view">
      <RecordingInnerNavigation view={innerView} onView={setInnerView} />
      <header className="automation-timeline-toolbar">
        <div>
          <strong>{props.selectedRecording?.metadata?.name ?? props.selectedRecording?.recordingId ?? "No recording selected"}</strong>
          <span>{props.selectedRecording ? `${props.selectedRecording.endedAt ? "Finalized" : "Open"} | ${formatTimelineDuration(selectedDuration)} | ${props.entries.length} events | ${selectedIsNormalized ? "normalized" : "raw"}` : "Select a recording from the project hierarchy."}</span>
        </div>
        <div className="automation-timeline-toolbar-actions">
          <button className="button" onClick={() => void props.onRefreshRecordings()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
          <button className="button" disabled={!props.selectedRecording} onClick={() => openRecordingDialog("rename")} type="button">Rename</button>
          <button className="button" disabled={!props.selectedRecording || Boolean(props.selectedRecording.endedAt)} onClick={() => openRecordingDialog("finalize")} type="button"><CheckCircle2 size={13} aria-hidden />Finalize</button>
          <button className="button" disabled={!props.selectedRecording} onClick={() => openRecordingDialog("repair")} type="button">Repair Index</button>
          <button className="button danger" disabled={!props.selectedRecording} onClick={() => openRecordingDialog("delete")} type="button"><Trash2 size={13} aria-hidden />Delete</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <div className="automation-timeline-stage">
        {processing ? <div className="automation-timeline-processing-overlay" role="status" aria-live="polite">
          <div className="automation-timeline-processing-panel">
            <strong>{processing.label}</strong>
            <span>{processing.detail}</span>
            <div className="automation-timeline-processing-track">
              <div style={{ width: `${Math.min(100, Math.max(0, processing.progress))}%` }} />
            </div>
            <small>{Math.round(Math.min(100, Math.max(0, processing.progress)))}%</small>
          </div>
        </div> : null}
        <div className="automation-timeline-detail-strip">
          {props.selectedEntry ? <>
            <strong>{timelineEntryTitle(props.selectedEntry, selectedNote)}</strong>
            <span>{formatTimelineDuration(props.selectedEntry.monotonicOffsetMs ?? 0)}</span>
            <span>{props.selectedEntry.sourceId ?? "unknown source"}</span>
            <small>{selectedNote?.text ?? timelineEntrySummary(props.selectedEntry)}</small>
            {props.selectedRecording ? <button className="icon-button" onClick={() => openRecordingDialog("note")} title="Add note" aria-label="Add note" type="button"><FileText size={14} aria-hidden /></button> : null}
            {props.selectedRecording ? <button className="icon-button" onClick={() => openRecordingDialog("marker")} title="Add marker" aria-label="Add marker" type="button"><CircleDot size={14} aria-hidden /></button> : null}
            <button className="icon-button" disabled={selectedStepIndex <= 0} onClick={() => selectTimelineStepAt(selectedStepIndex - 1)} title="Previous event" aria-label="Previous event" type="button"><ChevronLeft size={14} aria-hidden /></button>
            <button className="icon-button" disabled={selectedStepIndex < 0 || selectedStepIndex >= timelineSteps.length - 1} onClick={() => selectTimelineStepAt(selectedStepIndex + 1)} title="Next event" aria-label="Next event" type="button"><ChevronRight size={14} aria-hidden /></button>
            {props.selectedRecording ? <button className="button compact" onClick={() => props.onOpenTimelineEntryState(props.selectedRecording.recordingId, props.selectedEntry.id)} type="button">Open State</button> : null}
          </> : <span>Select a clip to inspect the event globally.</span>}
        </div>
        <div aria-label="Recording event timeline" className="automation-timeline-editor" onKeyDown={handleTimelineKeyDown} ref={timelineEditorRef} tabIndex={0}>
          <div className="automation-timeline-lane-labels">
            {lanes.map((lane) => <strong key={lane.id}>{lane.label}</strong>)}
          </div>
          <div className="automation-timeline-lanes">
            {lanes.map((lane) => (
              <div className={`automation-timeline-lane ${lane.id}`} key={lane.id} style={{ gridTemplateColumns: gridColumns }}>
                {visibleTimelineSteps.map((step, localIndex) => {
                  const index = timelineWindow.start + localIndex;
                  const note = step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined;
                  if (lane.id === "timing") return (
                    <div className={selectedStepIndex === index ? "automation-timeline-slot selected" : "automation-timeline-slot"} data-timeline-index={index} key={timelineStepKey(lane.id, step, index)}>
                      {step.waitMs >= 250 ? <button className="automation-wait-clip" onClick={() => props.setSelection({ kind: "timeline", id: step.entry.id })} type="button"><Clock size={12} aria-hidden />Wait {formatTimelineDuration(step.waitMs)}</button> : null}
                    </div>
                  );
                  return (
                    <div className={selectedStepIndex === index ? "automation-timeline-slot selected" : "automation-timeline-slot"} data-timeline-index={index} key={timelineStepKey(lane.id, step, index)}>
                      {lane.types.includes(step.entry.type) ? <TimelineClip
                        entry={step.entry}
                        index={index}
                        note={note}
                        selected={props.selectedEntry?.id === step.entry.id}
                        onSelect={() => props.setSelection({ kind: "timeline", id: step.entry.id })}
                        onOpenState={() => props.selectedRecording && props.onOpenTimelineEntryState(props.selectedRecording.recordingId, step.entry.id)}
                      /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {!timelineSteps.length ? <div className="automation-timeline-empty"><strong>No timeline events</strong><span>Start a recording to build the timeline.</span></div> : null}
          </div>
        </div>
        {timelineSteps.length > timelineEventWindowSize ? <div className="automation-timeline-window-controls"><span>Events {timelineWindow.start + 1}-{timelineWindow.end} of {timelineSteps.length}</span><div><button disabled={timelineWindow.start === 0} onClick={() => setTimelineOffset(Math.max(0, timelineWindow.start - timelineEventWindowSize))} type="button">Previous events</button><button disabled={timelineWindow.end >= timelineSteps.length} onClick={() => setTimelineOffset(timelineWindow.end)} type="button">Next events</button></div></div> : null}
        <footer className="automation-timeline-overview">
          <span>0ms</span>
          <div
            onClickCapture={handleOverviewClickCapture}
            onPointerDown={handleOverviewPointerDown}
            style={{ gridTemplateColumns: `repeat(${Math.max(1, timelineSteps.length)}, minmax(18px, 1fr))` }}
          >
            {visibleTimelineSteps.map((step, localIndex) => { const index = timelineWindow.start + localIndex; return (
              <button
                className={props.selectedEntry?.id === step.entry.id ? `selected ${step.entry.type}` : step.entry.type}
                aria-label={`${index + 1}. ${timelineEntryTitle(step.entry, step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined)}`}
                aria-pressed={props.selectedEntry?.id === step.entry.id}
                key={`overview:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`}
                onClick={() => selectPreviewStep(step.entry.id, index)}
                title={`${index + 1}. ${timelineEntryTitle(step.entry, step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined)}`}
                type="button"
              />
            ); })}
          </div>
          <span>{formatTimelineDuration(totalMs)}</span>
        </footer>
      </div>
    {recordingDialog ? <Modal busy={recordingDialogBusy} closeOnEscape={!recordingDialogBusy} description={recordingDialogCopy(recordingDialog).description} title={recordingDialogCopy(recordingDialog).title} onClose={() => !recordingDialogBusy && setRecordingDialog(null)}>
      <div className="dialog-form">
        {recordingDialogCopy(recordingDialog).fieldLabel ? <Field {...(recordingDialogError && !recordingDialogValue.trim() ? { error: recordingDialogError } : {})} label={recordingDialogCopy(recordingDialog).fieldLabel!} required>{recordingDialog === "note" ? <textarea data-autofocus rows={4} value={recordingDialogValue} onChange={(event) => setRecordingDialogValue(event.target.value)} /> : <input data-autofocus value={recordingDialogValue} onChange={(event) => setRecordingDialogValue(event.target.value)} />}</Field> : null}
        <Field {...(recordingDialogError && recordingDialogValue.trim() ? { error: recordingDialogError } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" data-autofocus={!recordingDialogCopy(recordingDialog).fieldLabel} inputMode="numeric" value={recordingDialogPin} onChange={(event) => setRecordingDialogPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></Field>
      </div>
      <div className="modal-actions"><button className="button" disabled={recordingDialogBusy} onClick={() => setRecordingDialog(null)} type="button">Cancel</button><button className={recordingDialog === "delete" ? "button danger" : "button button-primary"} data-modal-submit disabled={recordingDialogBusy || recordingDialogPin.length < 4} onClick={() => void submitRecordingDialog()} type="button">{recordingDialogCopy(recordingDialog).action}</button></div>
    </Modal> : null}
    </section>
  );
}

export function recordingDialogCopy(kind: RecordingActionKind): { title: string; description: string; action: string; fieldLabel?: string } {
  if (kind === "rename") return { title: "Rename recording", description: "Choose the friendly name shown in recording history.", action: "Rename", fieldLabel: "Name" };
  if (kind === "note") return { title: "Add note", description: "Attach a note to the selected recording event.", action: "Add note", fieldLabel: "Note" };
  if (kind === "marker") return { title: "Add marker", description: "Mark the selected point in the recording timeline.", action: "Add marker", fieldLabel: "Label" };
  if (kind === "finalize") return { title: "Finalize recording", description: "Close the raw capture so it can be used as stable Flow evidence.", action: "Finalize" };
  if (kind === "repair") return { title: "Repair state index", description: "Rebuild this recording's state lookup index from its persisted timeline and snapshots.", action: "Repair index" };
  return { title: "Delete recording", description: "Permanently remove this raw recording and its recording-owned derived artifacts from the project.", action: "Delete recording" };
}

export function timelineEventWindow(length: number, requestedStart: number, size = timelineEventWindowSize) {
  const safeSize = Math.max(1, Math.trunc(size));
  const maxStart = Math.max(0, Math.ceil(length / safeSize) * safeSize - safeSize);
  const start = Math.min(maxStart, Math.max(0, Math.trunc(requestedStart / safeSize) * safeSize));
  return { start, end: Math.min(length, start + safeSize) };
}

export function timelineKeyboardTargetIndex(key: string, selectedIndex: number, length: number): number | null {
  if (!length) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowLeft") return Math.max(0, selectedIndex < 0 ? 0 : selectedIndex - 1);
  if (key === "ArrowRight") return Math.min(length - 1, selectedIndex < 0 ? 0 : selectedIndex + 1);
  return null;
}

function RecordingInnerNavigation(props: { view: "list" | "timeline"; onView(view: "list" | "timeline"): void }) {
  return <nav className="automation-recording-inner-nav" aria-label="Recording views"><button aria-current={props.view === "list" ? "page" : undefined} onClick={() => props.onView("list")} type="button"><List size={14} aria-hidden />Recordings</button><button aria-current={props.view === "timeline" ? "page" : undefined} onClick={() => props.onView("timeline")} type="button">Timeline</button></nav>;
}

export function recordingListPageRange(page: { recordings: any[]; limit: number; offset: number; total: number }) {
  return {
    start: page.total ? page.offset + 1 : 0,
    end: Math.min(page.total, page.offset + page.recordings.length),
    previousOffset: Math.max(0, page.offset - page.limit),
    nextOffset: page.offset + page.limit,
    pageNumber: page.total ? Math.floor(page.offset / page.limit) + 1 : 0,
    pageCount: page.total ? Math.ceil(page.total / page.limit) : 0
  };
}

function RecordingListPage(props: { error: string; loading: boolean; page: { recordings: any[]; limit: number; offset: number; total: number }; onOpen(recordingId: string): void; onPage(offset: number): void; onRetry(): void }) {
  const { start, end, previousOffset, nextOffset, pageNumber, pageCount } = recordingListPageRange(props.page);
  return <section className="automation-recording-list-view">
    <header><div><strong>Recordings</strong><span>{props.loading ? "Loading recordings..." : `${start}-${end} of ${props.page.total}`}</span></div></header>
    {props.error ? <div className="automation-runtime-inline-error" role="alert"><span>{props.error}</span><button className="button" onClick={props.onRetry} type="button">Retry</button></div> : null}
    <div className="automation-recording-rows" aria-busy={props.loading}>
      {props.page.recordings.map((recording) => { const eventCount = recording.metadata?.eventCount ?? recording.timeline?.length ?? 0; const noteCount = recording.metadata?.noteCount ?? recording.notes?.length ?? 0; return <button key={recording.recordingId} onClick={() => props.onOpen(recording.recordingId)} type="button"><span><strong>{recording.metadata?.name ?? recording.recordingId}</strong><small>{recording.recordingId}</small></span><span>{recording.endedAt ? "Finalized" : "Open"}</span><span>{eventCount} events</span><span>{noteCount} notes</span><span>{recording.startedAt ? new Date(recording.startedAt).toLocaleString() : "-"}</span><ChevronRight size={16} aria-hidden /></button>; })}
      {!props.page.recordings.length && !props.loading && !props.error ? <div className="automation-recording-list-empty"><strong>No recordings yet</strong><span>Connected client recordings will appear here as evidence for Flow behavior.</span></div> : null}
    </div>
    <footer className="automation-recording-pagination"><span>{start}-{end} of {props.page.total}</span><div><button aria-label="Previous recording page" disabled={props.loading || props.page.offset === 0} onClick={() => props.onPage(previousOffset)} type="button"><ChevronLeft size={14} aria-hidden />Previous</button><span>Page {pageNumber} of {pageCount}</span><button aria-label="Next recording page" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next<ChevronRight size={14} aria-hidden /></button></div></footer>
  </section>;
}

function TimelineClip(props: { entry: any; index: number; note?: any; selected: boolean; onOpenState(): void; onSelect(): void }) {
  const Icon = timelineEntryIcon(props.entry.type);
  return (
    <button
      className={props.selected ? `automation-timeline-clip selected ${props.entry.type}` : `automation-timeline-clip ${props.entry.type}`}
      onClick={props.onSelect}
      onDoubleClick={props.onOpenState}
      onMouseDown={(event) => event.stopPropagation()}
      type="button"
    >
      <span><Icon size={13} aria-hidden />{props.index + 1}</span>
      <strong>{timelineEntryTitle(props.entry, props.note)}</strong>
      <small>{props.note?.text ?? timelineEntrySummary(props.entry)}</small>
    </button>
  );
}
