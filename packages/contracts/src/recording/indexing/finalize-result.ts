import type { RecordingIndex } from "./recording.js";
import type { RecordingStateLinkWarning } from "./link-warning.js";

export type FinalizeRecordingStateLinksResult = { index: RecordingIndex; warnings: RecordingStateLinkWarning[] };
