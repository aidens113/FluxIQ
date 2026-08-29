export const recordingPageSize = 25;
export const recordingTimelineWindowSize = 200;

export type RecordingActionKind = "rename" | "note" | "marker" | "finalize" | "repair" | "delete";

export type RecordingPage = {
  recordings: any[];
  limit: number;
  offset: number;
  total: number;
};

export function initialRecordingPage(recordings: any[]): RecordingPage {
  return { recordings: recordings.slice(0, recordingPageSize), limit: recordingPageSize, offset: 0, total: recordings.length };
}

export function recordingDialogCopy(kind: RecordingActionKind): { title: string; description: string; action: string; fieldLabel?: string } {
  if (kind === "rename") return { title: "Rename recording", description: "Choose the friendly name shown in recording history.", action: "Rename", fieldLabel: "Name" };
  if (kind === "note") return { title: "Add note", description: "Attach a note to the selected recording event.", action: "Add note", fieldLabel: "Note" };
  if (kind === "marker") return { title: "Add marker", description: "Mark the selected point in the recording timeline.", action: "Add marker", fieldLabel: "Label" };
  if (kind === "finalize") return { title: "Finalize recording", description: "Close the raw capture so it can be used as stable Flow evidence.", action: "Finalize" };
  if (kind === "repair") return { title: "Repair state index", description: "Rebuild this recording's state lookup index from its persisted timeline and snapshots.", action: "Repair index" };
  return { title: "Delete recording", description: "Permanently remove this raw recording and its recording-owned derived artifacts from the project.", action: "Delete recording" };
}

export function recordingListPageRange(page: RecordingPage) {
  return {
    start: page.total ? page.offset + 1 : 0,
    end: Math.min(page.total, page.offset + page.recordings.length),
    previousOffset: Math.max(0, page.offset - page.limit),
    nextOffset: page.offset + page.limit,
    pageNumber: page.total ? Math.floor(page.offset / page.limit) + 1 : 0,
    pageCount: page.total ? Math.ceil(page.total / page.limit) : 0
  };
}

export function timelineEventWindow(length: number, requestedStart: number, size = recordingTimelineWindowSize) {
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

export type RecordingTimelineEntry = {
  id: string;
  type?: string;
  label?: string;
  sequence?: number;
  monotonicOffsetMs?: number;
  [key: string]: any;
};

export type RecordingTimelineStep = {
  entry: RecordingTimelineEntry;
  waitMs: number;
};

export function orderRecordingTimelineEntries(entries: readonly RecordingTimelineEntry[]): RecordingTimelineEntry[] {
  return [...entries]
    .filter((entry) => !(entry.type === "marker" && typeof entry.label === "string" && entry.label.startsWith("Rejected recording event:")))
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0));
}

export function recordingTimelineStepAt(orderedEntries: readonly RecordingTimelineEntry[], index: number): RecordingTimelineStep | null {
  const entry = orderedEntries[index];
  if (!entry) return null;
  const previous = orderedEntries[index - 1];
  const waitMs = previous
    ? Math.max(0, (entry.monotonicOffsetMs ?? 0) - (previous.monotonicOffsetMs ?? 0))
    : Math.max(0, entry.monotonicOffsetMs ?? 0);
  return { entry, waitMs };
}

export function recordingTimelineStepsWindow(
  orderedEntries: readonly RecordingTimelineEntry[],
  start: number,
  end: number
): RecordingTimelineStep[] {
  const safeStart = Math.max(0, Math.trunc(start));
  const safeEnd = Math.min(orderedEntries.length, Math.max(safeStart, Math.trunc(end)));
  const result: RecordingTimelineStep[] = [];
  for (let index = safeStart; index < safeEnd; index += 1) {
    const step = recordingTimelineStepAt(orderedEntries, index);
    if (step) result.push(step);
  }
  return result;
}

export function buildRecordingTimeline(entries: readonly RecordingTimelineEntry[]): RecordingTimelineStep[] {
  const orderedEntries = orderRecordingTimelineEntries(entries);
  return recordingTimelineStepsWindow(orderedEntries, 0, orderedEntries.length);
}