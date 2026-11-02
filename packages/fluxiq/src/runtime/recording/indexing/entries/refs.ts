import type { TimelineEntry } from "@fluxiq/contracts/recording";
import type { RecordingReferenceReader } from "../policy/index.ts";
import { recordingEntryObservationPayload } from "./timestamp.ts";

export function recordingEntryObjectRefs(projectId: string, entry: TimelineEntry<unknown, unknown>, references: RecordingReferenceReader): string[] {
  const refs = new Set<string>();
  const addRef = (value: unknown) => {
    if (typeof value === "string" && references.accepts(value, { projectId })) refs.add(value);
  };
  const payload = recordingEntryObservationPayload(entry);
  addRef(payload.stateRef);
  addRef(payload.screenshotRef);
  const metadata = payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) addRef(metadata.screenshotRef);
  addRefsFromValue(refs, payload, projectId, references);
  addRefsFromValue(refs, entry.metadata, projectId, references);
  return [...refs].sort();
}

function addRefsFromValue(refs: Set<string>, value: unknown, projectId: string, references: RecordingReferenceReader, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (references.accepts(value, { projectId })) refs.add(value);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addRefsFromValue(refs, item, projectId, references, seen);
    return;
  }
  for (const item of Object.values(value)) addRefsFromValue(refs, item, projectId, references, seen);
}
