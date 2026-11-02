import type { AutomationStudioSchemaVersion, EvidenceReference } from "../../evidence/index.js";
import type { ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor } from "../descriptors/index.js";
import type { StateSnapshot } from "../../state/contracts/index.js";
import type { TimelineEntry } from "../timeline/index.js";
import type { RecordingNote } from "./recording-note.js";
import type { JsonObject } from "../../core.js";

export type RecordingSession<TTarget = unknown, TEvidence = EvidenceReference> = {
  schemaVersion: AutomationStudioSchemaVersion;
  recordingId: string;
  /** What the demonstration shows; absent only on legacy recordings. */
  description?: string;
  taskId?: string;
  startedAt: number;
  endedAt?: number;
  environment: EnvironmentDescriptor;
  sources: SourceDescriptor[];
  actionChannels: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  timeline: TimelineEntry<TTarget, TEvidence>[];
  notes: RecordingNote[];
  metadata: JsonObject;
};
