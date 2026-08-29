"use client";

import { recordingEventIcon, recordingEventSummary, recordingEventTitle } from "./recording-event-format";

export function RecordingTimelineClip(props: { entry: any; index: number; note?: any; selected: boolean; onOpenState(): void; onSelect(): void }) {
  const Icon = recordingEventIcon(props.entry.type);
  return (
    <button
      className={props.selected ? `automation-timeline-clip selected ${props.entry.type}` : `automation-timeline-clip ${props.entry.type}`}
      onClick={props.onSelect}
      onDoubleClick={props.onOpenState}
      onMouseDown={(event) => event.stopPropagation()}
      type="button"
    >
      <span><Icon size={13} aria-hidden />{props.index + 1}</span>
      <strong>{recordingEventTitle(props.entry, props.note)}</strong>
      <small>{props.note?.text ?? recordingEventSummary(props.entry)}</small>
    </button>
  );
}