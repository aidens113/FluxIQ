import type { RecordingIndex } from "@fluxiq/contracts/recording";
import type { RecordingReferenceReader } from "./policy/index.ts";
import { validateRecordingIndex } from "./validate.ts";

export function assertValidRecordingIndex(index: RecordingIndex, references: RecordingReferenceReader): void {
  const issues = validateRecordingIndex(index, references);
  if (issues.length) {
    throw new Error(`Recording state index is invalid:\n${issues.map((item) => `- ${item.path}: ${item.message}`).join("\n")}`);
  }
}
