"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { recordingListPageRange, type RecordingPage } from "./recording-model";

export function RecordingListView(props: {
  error: string;
  loading: boolean;
  page: RecordingPage;
  onOpen(recordingId: string): void;
  onPage(offset: number): void;
  onRetry(): void;
}) {
  const { start, end, previousOffset, nextOffset, pageNumber, pageCount } = recordingListPageRange(props.page);
  return (
    <section className="automation-recording-list-view">
      <header><div><strong>Recordings</strong><span>{props.loading ? "Loading recordings..." : `${start}-${end} of ${props.page.total}`}</span></div></header>
      {props.error ? <div className="automation-runtime-inline-error" role="alert"><span>{props.error}</span><button className="button" onClick={props.onRetry} type="button">Retry</button></div> : null}
      <div className="automation-recording-rows" aria-busy={props.loading}>
        {props.page.recordings.map((recording) => {
          const eventCount = recording.metadata?.eventCount ?? recording.timeline?.length ?? 0;
          const noteCount = recording.metadata?.noteCount ?? recording.notes?.length ?? 0;
          return (
            <button key={recording.recordingId} onClick={() => props.onOpen(recording.recordingId)} type="button">
              <span><strong>{recording.metadata?.name ?? recording.recordingId}</strong><small>{recording.recordingId}</small></span>
              <span>{recording.endedAt ? "Finalized" : "Open"}</span>
              <span>{eventCount} events</span>
              <span>{noteCount} notes</span>
              <span>{recording.startedAt ? new Date(recording.startedAt).toLocaleString() : "-"}</span>
              <ChevronRight size={16} aria-hidden />
            </button>
          );
        })}
        {!props.page.recordings.length && !props.loading && !props.error ? <div className="automation-recording-list-empty"><strong>No recordings yet</strong><span>Connected client recordings will appear here as evidence for Flow behavior.</span></div> : null}
      </div>
      <footer className="automation-recording-pagination">
        <span>{start}-{end} of {props.page.total}</span>
        <div>
          <button aria-label="Previous recording page" disabled={props.loading || props.page.offset === 0} onClick={() => props.onPage(previousOffset)} type="button"><ChevronLeft size={14} aria-hidden />Previous</button>
          <span>Page {pageNumber} of {pageCount}</span>
          <button aria-label="Next recording page" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next<ChevronRight size={14} aria-hidden /></button>
        </div>
      </footer>
    </section>
  );
}