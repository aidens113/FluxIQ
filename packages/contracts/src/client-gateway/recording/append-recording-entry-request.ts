import type { JsonObject } from "../../core.js";

export type ClientGatewayAppendRecordingEntryRequest = {
  projectId?: string | null;
  recordingId: string;
  entry: JsonObject;
};
