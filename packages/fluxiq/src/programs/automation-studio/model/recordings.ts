import type { JsonObject } from "../../../core/index.ts";
import type { ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor } from "./descriptors.ts";
import type { AutomationStudioSchemaVersion } from "./evidence.ts";
import type { StateSnapshot } from "./state.ts";
import type { TimelineEntry } from "./timeline.ts";

export type RecordingNote = {
  id: string;
  timestamp: number;
  startOffsetMs?: number;
  endOffsetMs?: number;
  text: string;
  source: "typed" | "speech_to_text" | "imported";
  scope: "instant" | "action" | "state" | "interval" | "task";
  linkedEntryIds?: string[];
  confidence?: number;
  metadata?: JsonObject;
};

export type RecordingSession = {
  schemaVersion: AutomationStudioSchemaVersion;
  recordingId: string;
  taskId?: string;
  startedAt: number;
  endedAt?: number;
  environment: EnvironmentDescriptor;
  sources: SourceDescriptor[];
  actionChannels: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  timeline: TimelineEntry[];
  notes: RecordingNote[];
  metadata: JsonObject;
};
