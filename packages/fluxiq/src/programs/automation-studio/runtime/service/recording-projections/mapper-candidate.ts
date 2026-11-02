import type { RecordingSession } from "../../../model/index.ts";
import { recordingActionEntryCandidate as mapActionEntry } from "../../../../../runtime/recording/mapping/index.ts";
import { readableTokenValue } from "../evidence/index.ts";

export function recordingActionEntryCandidate(entry: RecordingSession["timeline"][number]) {
  return mapActionEntry(entry, readableTokenValue);
}
