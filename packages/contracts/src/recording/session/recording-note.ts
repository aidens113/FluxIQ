import type { JsonObject } from "../../core.js";

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
