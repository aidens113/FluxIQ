import type { RecordingIndex } from "@fluxiq/contracts/recording";

export function sortRecordingIndex(index: RecordingIndex): RecordingIndex {
  return { ...index, entries: sortRecord(index.entries), actions: sortRecord(index.actions), states: sortRecord(index.states), proposals: sortRecord(index.proposals) };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}
