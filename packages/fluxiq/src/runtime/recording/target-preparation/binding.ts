import type { RecordingEntryTargetPreparer } from "./preparer.ts";

/** Pins the original domain callback and receiver without replacing the entry. */
export type RecordingEntryTargetPreparerBinding = {
  readonly receiver: object | undefined;
  readonly callback: RecordingEntryTargetPreparer;
};
