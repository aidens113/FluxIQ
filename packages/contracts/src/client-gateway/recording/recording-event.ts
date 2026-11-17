import type { JsonObject } from "../../core.js";

export type ClientGatewayRecordingEvent = {
  eventId?: string;
  recordingId?: string;
  domainId?: string;
  eventType: string;
  timestamp?: number;
  sourceId?: string;
  target?: JsonObject;
  payload?: JsonObject;
  metadata?: JsonObject;
};
