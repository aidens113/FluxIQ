import type { JsonObject } from "../../core/index.ts";
export type StartClientRecordingInput = { description?: string; sessionId: string; projectId?: string | null; taskId?: string; recordingId?: string; domainId?: string | null; metadata?: JsonObject };
