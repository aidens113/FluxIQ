import type { EvidenceReference } from "../../evidence/index.js";
import type { ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor } from "../descriptors/index.js";
import type { StateSnapshot } from "../../state/contracts/index.js";
import type { JsonObject } from "../../core.js";

export type CreateRecordingSessionInput<TTarget = unknown, TEvidence = EvidenceReference> = {
  recordingId: string;
  description?: string;
  taskId?: string;
  startedAt?: number;
  environment?: Partial<EnvironmentDescriptor>;
  sources?: SourceDescriptor[];
  actionChannels?: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  metadata?: JsonObject;
};
