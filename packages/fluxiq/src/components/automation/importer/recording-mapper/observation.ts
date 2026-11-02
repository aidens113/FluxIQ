import type { JsonObject } from "../../../../core/index.ts";
export type AutomationStudioRecordingMapperObservation = {
  observationId: string;
  recordingId: string;
  domainId: string | null;
  type: string;
  timestamp: number;
  payload: JsonObject;
  metadata: JsonObject;
};
