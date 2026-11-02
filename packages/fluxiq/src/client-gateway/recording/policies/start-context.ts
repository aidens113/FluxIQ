import type { JsonObject } from "../../../core/index.ts";

export type RecordingStartContext =
  | { ok: true; projectId?: string | null; taskId?: string }
  | { ok: false; code: string; message: string; metadata?: JsonObject };
