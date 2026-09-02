"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Clock, FileText, List, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { StatusText } from "../../programs/shared-ui";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { RecordingProcessingStatus } from "./recording-status";
import { formatRecordingDuration, recordingEventSummary, recordingEventTitle } from "./recording-event-format";
import { RecordingActionDialog } from "./RecordingActionDialog";
import { RecordingListView } from "./RecordingListView";
import { RecordingProcessingOverlay } from "./RecordingProcessingOverlay";
import { RecordingTimelineClip } from "./RecordingTimelineClip";
import { useRecordingActionController } from "./useRecordingActionController";
import { useRecordingListController } from "./useRecordingListController";
import { useRecordingViewDataPort } from "./recording-api";
import type { RecordingJsonObject } from "./recording-api-types";
import { orderRecordingTimelineEntries, recordingTimelineStepsWindow, recordingTimelineWindowSize, timelineEventWindow, timelineKeyboardTargetIndex } from "./recording-model";


type RecordingTimelineLane = { id: string; label: string; types: readonly string[] };

const recordingTimelineLanes: readonly RecordingTimelineLane[] = [
  { id: "timing", label: "Timing", types: [] },
  { id: "actions", label: "Actions", types: ["action", "domain_event"] },
  { id: "state", label: "State", types: ["observation", "state_delta", "state_checkpoint"] },
  { id: "notes", label: "Notes", types: ["note"] },
  { id: "markers", label: "Markers", types: ["marker"] }
];
export function RecordingTimelineView(props: {
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
  onUpdateRecording(recordingId: string, changes: RecordingJsonObject, authorizationPin?: string): Promise<void>;
  setSelection(selection: AutomationSelection): void;
}) {
  const dataPort = useRecordingViewDataPort();
  const [innerView, setInnerView] = useState<"list" | "timeline">(props.selectedRecording ? "timeline" : "list");
  const recordingList = useRecordingListController({
    active: innerView === "list",
    dataPort,
    projectId: props.projectId,
    recordings: props.recordings
  });
  const recordingActions = useRecordingActionController({
    selectedEntry: props.selectedEntry,
    selectedRecording: props.selectedRecording,
    onAppendRecordingMarker: props.onAppendRecordingMarker,
    onAppendRecordingNote: props.onAppendRecordingNote,
    onDeleteRecording: props.onDeleteRecording,
    onFinalizeRecording: props.onFinalizeRecording,
    onRefreshRecordings: props.onRefreshRecordings,
    onUpdateRecording: props.onUpdateRecording
  });
  const [timelineOffset, setTimelineOffset] = useState(0);
  const timelineEditorRef = useRef<HTMLDivElement>(null);
  const suppressOverviewClickRef = useRef(false);
  const noteById = useMemo(() => new Map(props.notes.map((note) => [note.id, note])), [props.notes]);
  const timelineEntries = useMemo(() => orderRecordingTimelineEntries(props.entries), [props.entries]);
  const totalMs = timelineEntries.at(-1)?.monotonicOffsetMs ?? 0;
  const selectedNote = props.selectedEntry?.type === "note" ? noteById.get(props.selectedEntry.noteId) : null;
  const selectedStepIndex = timelineEntries.findIndex((entry) => entry.id === props.selectedEntry?.id);
  const timelineWindow = timelineEventWindow(timelineEntries.length, timelineOffset, recordingTimelineWindowSize);
  const visibleTimelineSteps = useMemo(() => recordingTimelineStepsWindow(timelineEntries, timelineWindow.start, timelineWindow.end), [timelineEntries, timelineWindow.end, timelineWindow.start]);
  const timelineStepKey = (laneId: string, step: { entry: any; waitMs: number }, index: number) => `${laneId}:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`;
  const gridColumns = `repeat(${Math.max(1, visibleTimelineSteps.length)}, minmax(180px, 220px))`;
  const selectedDuration = useActiveRecordingDuration(props.selectedRecording);
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
    const entry = timelineEntries[index];
    if (!entry) return;
    props.setSelection({ kind: "timeline", id: entry.id });
    scrollToTimelineStep(index);
  };
  const handleTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextIndex = timelineKeyboardTargetIndex(event.key, selectedStepIndex, timelineEntries.length);
    if (nextIndex === null) return;
    event.preventDefault();
    selectTimelineStepAt(nextIndex);
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
    const selectedWindowStart = Math.floor(selectedStepIndex / recordingTimelineWindowSize) * recordingTimelineWindowSize;
    if (selectedWindowStart !== timelineOffset) { setTimelineOffset(selectedWindowStart); return; }
    scrollToTimelineStep(selectedStepIndex);
  }, [selectedStepIndex, timelineOffset]);
  useEffect(() => { if (props.selectedRecording?.recordingId) setInnerView("timeline"); }, [props.selectedRecording?.recordingId]);
  if (innerView === "list") {
    return <section className="automation-timeline-view"><RecordingInnerNavigation view={innerView} onView={setInnerView} /><RecordingListView error={recordingList.error} loading={recordingList.loading} page={recordingList.page} onRetry={recordingList.retry} onOpen={(recordingId) => { props.setSelection({ kind: "recording", id: recordingId }); setInnerView("timeline"); }} onPage={recordingList.openPage} /></section>;
  }
  return (
    <section className="automation-timeline-view">
      <RecordingInnerNavigation view={innerView} onView={setInnerView} />
      <header className="automation-timeline-toolbar">
        <div>
          <strong>{props.selectedRecording?.metadata?.name ?? props.selectedRecording?.recordingId ?? "No recording selected"}</strong>
          <span>{props.selectedRecording ? `${props.selectedRecording.endedAt ? "Finalized" : "Open"} | ${formatRecordingDuration(selectedDuration)} | ${props.entries.length} events | ${selectedIsNormalized ? "normalized" : "raw"}` : "Select a recording from the project hierarchy."}</span>
        </div>
        <div className="automation-timeline-toolbar-actions">
          <button className="button" onClick={() => void props.onRefreshRecordings()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
          <button className="button" disabled={!props.selectedRecording} onClick={() => recordingActions.open("rename")} type="button">Rename</button>
          <button className="button" disabled={!props.selectedRecording || Boolean(props.selectedRecording.endedAt)} onClick={() => recordingActions.open("finalize")} type="button"><CheckCircle2 size={13} aria-hidden />Finalize</button>
          <button className="button danger" disabled={!props.selectedRecording} onClick={() => recordingActions.open("delete")} type="button"><Trash2 size={13} aria-hidden />Delete</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <div className="automation-timeline-stage">
        <RecordingProcessingOverlay processing={processing} />
        <div className="automation-timeline-detail-strip">
          {props.selectedEntry ? <>
            <strong>{recordingEventTitle(props.selectedEntry, selectedNote)}</strong>
            <span>{formatRecordingDuration(props.selectedEntry.monotonicOffsetMs ?? 0)}</span>
            <span>{props.selectedEntry.sourceId ?? "unknown source"}</span>
            <small>{selectedNote?.text ?? recordingEventSummary(props.selectedEntry)}</small>
            {props.selectedRecording && !props.selectedRecording.endedAt ? <button className="icon-button" onClick={() => recordingActions.open("note")} title="Add note" aria-label="Add note" type="button"><FileText size={14} aria-hidden /></button> : null}
            {props.selectedRecording && !props.selectedRecording.endedAt ? <button className="icon-button" onClick={() => recordingActions.open("marker")} title="Add marker" aria-label="Add marker" type="button"><CircleDot size={14} aria-hidden /></button> : null}
            <button className="icon-button" disabled={selectedStepIndex <= 0} onClick={() => selectTimelineStepAt(selectedStepIndex - 1)} title="Previous event" aria-label="Previous event" type="button"><ChevronLeft size={14} aria-hidden /></button>
            <button className="icon-button" disabled={selectedStepIndex < 0 || selectedStepIndex >= timelineEntries.length - 1} onClick={() => selectTimelineStepAt(selectedStepIndex + 1)} title="Next event" aria-label="Next event" type="button"><ChevronRight size={14} aria-hidden /></button>
            {props.selectedRecording ? <button className="button compact" onClick={() => props.onOpenTimelineEntryState(props.selectedRecording.recordingId, props.selectedEntry.id)} type="button">Open State</button> : null}
          </> : <span>Select a clip to inspect the event globally.</span>}
        </div>
        <div aria-label="Recording event timeline" className="automation-timeline-editor" onKeyDown={handleTimelineKeyDown} ref={timelineEditorRef} tabIndex={0}>
          <div className="automation-timeline-lane-labels">
            {recordingTimelineLanes.map((lane) => <strong key={lane.id}>{lane.label}</strong>)}
          </div>
          <div className="automation-timeline-lanes">
            {recordingTimelineLanes.map((lane) => (
              <div className={`automation-timeline-lane ${lane.id}`} key={lane.id} style={{ gridTemplateColumns: gridColumns }}>
                {visibleTimelineSteps.map((step, localIndex) => {
                  const index = timelineWindow.start + localIndex;
                  const note = step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined;
                  if (lane.id === "timing") return (
                    <div className={selectedStepIndex === index ? "automation-timeline-slot selected" : "automation-timeline-slot"} data-timeline-index={index} key={timelineStepKey(lane.id, step, index)}>
                      {step.waitMs >= 250 ? <button className="automation-wait-clip" onClick={() => props.setSelection({ kind: "timeline", id: step.entry.id })} type="button"><Clock size={12} aria-hidden />Wait {formatRecordingDuration(step.waitMs)}</button> : null}
                    </div>
                  );
                  return (
                    <div className={selectedStepIndex === index ? "automation-timeline-slot selected" : "automation-timeline-slot"} data-timeline-index={index} key={timelineStepKey(lane.id, step, index)}>
                      {lane.types.includes(step.entry.type ?? "") ? <RecordingTimelineClip
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
            {!timelineEntries.length ? <div className="automation-timeline-empty"><strong>No timeline events</strong><span>Start a recording to build the timeline.</span></div> : null}
          </div>
        </div>
        {timelineEntries.length > recordingTimelineWindowSize ? <div className="automation-timeline-window-controls"><span>Events {timelineWindow.start + 1}-{timelineWindow.end} of {timelineEntries.length}</span><div><button disabled={timelineWindow.start === 0} onClick={() => setTimelineOffset(Math.max(0, timelineWindow.start - recordingTimelineWindowSize))} type="button">Previous events</button><button disabled={timelineWindow.end >= timelineEntries.length} onClick={() => setTimelineOffset(timelineWindow.end)} type="button">Next events</button></div></div> : null}
        <footer className="automation-timeline-overview">
          <span>0ms</span>
          <div
            onClickCapture={handleOverviewClickCapture}
            onPointerDown={handleOverviewPointerDown}
            style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleTimelineSteps.length)}, minmax(18px, 1fr))` }}
          >
            {visibleTimelineSteps.map((step, localIndex) => { const index = timelineWindow.start + localIndex; return (
              <button
                className={props.selectedEntry?.id === step.entry.id ? `selected ${step.entry.type}` : step.entry.type}
                aria-label={`${index + 1}. ${recordingEventTitle(step.entry, step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined)}`}
                aria-pressed={props.selectedEntry?.id === step.entry.id}
                key={`overview:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`}
                onClick={() => selectPreviewStep(step.entry.id, index)}
                title={`${index + 1}. ${recordingEventTitle(step.entry, step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined)}`}
                type="button"
              />
            ); })}
          </div>
          <span>{formatRecordingDuration(totalMs)}</span>
        </footer>
      </div>
    {recordingActions.kind ? <RecordingActionDialog busy={recordingActions.busy} error={recordingActions.error} kind={recordingActions.kind} pin={recordingActions.pin} value={recordingActions.value} onCancel={recordingActions.close} onPin={recordingActions.setPin} onSubmit={() => void recordingActions.submit()} onValue={recordingActions.setValue} /> : null}
    </section>
  );
}

export function useActiveRecordingDuration(recording: { recordingId: string; startedAt: number; endedAt?: number } | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recording || recording.endedAt !== undefined) return;
    const update = () => setNow(Date.now());
    update();
    const timer = globalThis.setInterval(update, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [recording?.recordingId, recording?.endedAt]);
  if (!recording) return 0;
  return Math.max(0, (recording.endedAt ?? now) - recording.startedAt);
}

function RecordingInnerNavigation(props: { view: "list" | "timeline"; onView(view: "list" | "timeline"): void }) {
  return <nav className="automation-recording-inner-nav" aria-label="Recording views"><button aria-current={props.view === "list" ? "page" : undefined} onClick={() => props.onView("list")} type="button"><List size={14} aria-hidden />Recordings</button><button aria-current={props.view === "timeline" ? "page" : undefined} onClick={() => props.onView("timeline")} type="button">Timeline</button></nav>;
}

