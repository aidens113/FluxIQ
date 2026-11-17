import type { JsonObject } from "../../core.js";

export type ClientGatewayStartRecordingRequest = {
  description?: string;
  projectId?: string | null;
  recordingId: string;
  taskId?: string;
  startedAt?: number;
  domainId?: string | null;
  initialState?: JsonObject;
  environment?: JsonObject;
  sources?: JsonObject[];
  actionChannels?: JsonObject[];
  metadata?: JsonObject;
};
