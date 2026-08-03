"use client";

import { CheckCircle2, CircleDot, Clock, FileText, Link2, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import type { JsonObject } from "../../programs/program-api";
import { StatusText } from "../../programs/shared-ui";
import type { AutomationSelection } from "../types";
import { formatTimelineDuration, isRejectedRecordingMarker, timelineEntryIcon, timelineEntrySummary, timelineEntryTitle } from "../timeline/view-model";
export function AutomationTimelineView(props: {
  actionStatus: string;
  entries: any[];
  notes: any[];
  recordings: any[];
  selectedEntry: any;
  selectedRecording: any;
  selectedTimeline: any;
  timelines: any[];
  onAppendRecordingMarker(recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number): Promise<void>;
  onAppendRecordingNote(recordingId: string, linkedEntryId?: string): Promise<void>;
  onDeleteRecording(recordingId: string): Promise<void>;
  onFinalizeRecording(recordingId: string): Promise<void>;
  onOpenPipeline(recordingId: string): void;
  onRefreshRecordings(): Promise<void>;
  onUpdateRecording(recordingId: string, changes: JsonObject): Promise<void>;
  setSelection(selection: AutomationSelection): void;
}) {
  const timelineEditorRef = useRef<HTMLDivElement>(null);
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
  const timelineStepKey = (laneId: string, step: { entry: any; waitMs: number }, index: number) => `${laneId}:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`;
  const gridColumns = `repeat(${Math.max(1, timelineSteps.length)}, minmax(180px, 220px))`;
  const selectedDuration = props.selectedRecording
    ? props.selectedRecording.endedAt ? Math.max(0, props.selectedRecording.endedAt - props.selectedRecording.startedAt) : Math.max(0, Date.now() - props.selectedRecording.startedAt)
    : 0;
  const selectedIsNormalized = props.selectedRecording ? props.timelines.some((timeline) => timeline.recordingId === props.selectedRecording.recordingId) : false;
  const selectPreviewStep = (entryId: string, index: number) => {
    props.setSelection({ kind: "timeline", id: entryId });
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
        behavior: "smooth"
      });
    });
  };
  return (
    <section className="automation-timeline-view">
      <header className="automation-timeline-toolbar">
        <div>
          <strong>{props.selectedRecording?.metadata?.name ?? props.selectedRecording?.recordingId ?? "No recording selected"}</strong>
          <span>{props.selectedRecording ? `${props.selectedRecording.endedAt ? "Finalized" : "Open"} | ${formatTimelineDuration(selectedDuration)} | ${props.entries.length} events | ${selectedIsNormalized ? "normalized" : "raw"}` : "Select a recording from the project hierarchy."}</span>
        </div>
        <div className="automation-timeline-toolbar-actions">
          <button className="button" disabled={!props.selectedRecording} onClick={() => props.selectedRecording && props.onOpenPipeline(props.selectedRecording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Corresponding Pipeline</button>
          <button className="button" onClick={() => void props.onRefreshRecordings()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
          <button className="button" disabled={!props.selectedRecording} onClick={() => {
            const name = window.prompt("Recording name", props.selectedRecording?.metadata?.name ?? props.selectedRecording?.recordingId ?? "") ?? "";
            if (name.trim() && props.selectedRecording) void props.onUpdateRecording(props.selectedRecording.recordingId, { name });
          }} type="button">Rename</button>
          <button className="button" disabled={!props.selectedRecording || Boolean(props.selectedRecording.endedAt)} onClick={() => props.selectedRecording && void props.onFinalizeRecording(props.selectedRecording.recordingId)} type="button"><CheckCircle2 size={13} aria-hidden />Finalize</button>
          <button className="button danger" disabled={!props.selectedRecording} onClick={() => props.selectedRecording && void props.onDeleteRecording(props.selectedRecording.recordingId)} type="button"><Trash2 size={13} aria-hidden />Delete</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <div className="automation-timeline-stage">
        <div className="automation-timeline-detail-strip">
          {props.selectedEntry ? <>
            <strong>{timelineEntryTitle(props.selectedEntry, selectedNote)}</strong>
            <span>{formatTimelineDuration(props.selectedEntry.monotonicOffsetMs ?? 0)}</span>
            <span>{props.selectedEntry.sourceId ?? "unknown source"}</span>
            <small>{selectedNote?.text ?? timelineEntrySummary(props.selectedEntry)}</small>
            {props.selectedRecording ? <button className="icon-button" onClick={() => void props.onAppendRecordingNote(props.selectedRecording.recordingId, props.selectedEntry.id)} title="Add note" aria-label="Add note" type="button"><FileText size={14} aria-hidden /></button> : null}
            {props.selectedRecording ? <button className="icon-button" onClick={() => void props.onAppendRecordingMarker(props.selectedRecording.recordingId, props.selectedEntry.id, props.selectedEntry.monotonicOffsetMs)} title="Add marker" aria-label="Add marker" type="button"><CircleDot size={14} aria-hidden /></button> : null}
          </> : <span>Select a clip to inspect the event globally.</span>}
        </div>
        <div className="automation-timeline-editor" ref={timelineEditorRef}>
          <div className="automation-timeline-lane-labels">
            {lanes.map((lane) => <strong key={lane.id}>{lane.label}</strong>)}
          </div>
          <div className="automation-timeline-lanes">
            {lanes.map((lane) => (
              <div className={`automation-timeline-lane ${lane.id}`} key={lane.id} style={{ gridTemplateColumns: gridColumns }}>
                {timelineSteps.map((step, index) => {
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
                      /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {!timelineSteps.length ? <div className="automation-timeline-empty"><strong>No timeline events</strong><span>Start a recording to build the timeline.</span></div> : null}
          </div>
        </div>
        <footer className="automation-timeline-overview">
          <span>0ms</span>
          <div style={{ gridTemplateColumns: `repeat(${Math.max(1, timelineSteps.length)}, minmax(18px, 1fr))` }}>
            {timelineSteps.map((step, index) => (
              <button
                className={props.selectedEntry?.id === step.entry.id ? `selected ${step.entry.type}` : step.entry.type}
                key={`overview:${index}:${step.entry.sequence ?? "seq"}:${step.entry.id ?? "entry"}`}
                onClick={() => selectPreviewStep(step.entry.id, index)}
                title={`${index + 1}. ${timelineEntryTitle(step.entry, step.entry.type === "note" ? noteById.get(step.entry.noteId) : undefined)}`}
                type="button"
              />
            ))}
          </div>
          <span>{formatTimelineDuration(totalMs)}</span>
        </footer>
      </div>
    </section>
  );
}

function TimelineClip(props: { entry: any; index: number; note?: any; selected: boolean; onSelect(): void }) {
  const Icon = timelineEntryIcon(props.entry.type);
  return (
    <button className={props.selected ? `automation-timeline-clip selected ${props.entry.type}` : `automation-timeline-clip ${props.entry.type}`} onClick={props.onSelect} type="button">
      <span><Icon size={13} aria-hidden />{props.index + 1}</span>
      <strong>{timelineEntryTitle(props.entry, props.note)}</strong>
      <small>{props.note?.text ?? timelineEntrySummary(props.entry)}</small>
    </button>
  );
}
