import type { RecordingSession } from "../../../model/index.ts";

// Undoing one captured step while a recording is still open.
//
// A gateway event can land as more than one entry (an input observation, the
// state it produced), and every one of them carries the envelope's `eventId`
// in its metadata (`runtime/io-bridge.ts`). Removing the step removes all of
// them, and a note that pointed at a removed entry stops pointing at it, so no
// reader follows a link into nothing. Sequence numbers of the entries that stay
// are left alone: a sequence identifies an entry, it is not a position.
//
// A finalized recording is immutable, exactly as appending to one is refused:
// its proposals, normalized timelines and mined evidence were derived from the
// timeline as it stood, and a removal would leave them describing entries that
// no longer exist.

/** The recording with every entry from `eventId` removed, and how many went. Throws for a finalized recording. */
export function removeRecordingEntriesByEventId(recording: RecordingSession, eventId: string): { recording: RecordingSession; removedCount: number } {
  if (recording.endedAt !== undefined) throw new Error("A finalized recording's entries can no longer be removed.");
  const wanted = eventId.trim();
  if (!wanted) throw new Error("Removing a recording entry needs the event ID it was recorded from.");
  const removedIds = new Set<string>();
  const timeline = recording.timeline.filter((entry) => {
    if (entry.metadata?.eventId !== wanted) return true;
    removedIds.add(entry.id);
    return false;
  });
  const removedCount = recording.timeline.length - timeline.length;
  if (!removedCount) return { recording, removedCount };
  const notes = recording.notes.map((note) => {
    if (!note.linkedEntryIds?.some((id) => removedIds.has(id))) return note;
    const { linkedEntryIds, ...rest } = note;
    const kept = (linkedEntryIds ?? []).filter((id) => !removedIds.has(id));
    return kept.length ? { ...rest, linkedEntryIds: kept } : rest;
  });
  return { recording: { ...recording, timeline, notes }, removedCount };
}
