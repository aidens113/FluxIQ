import type { JsonObject } from "../../core.js";

export type TimelineBase = {
  id: string;
  recordingId: string;
  timestamp: number;
  monotonicOffsetMs: number;
  sequence: number;
  sourceId: string;
  confidence?: number;
  correlationId?: string;
  causationId?: string;
  metadata?: JsonObject;
};
