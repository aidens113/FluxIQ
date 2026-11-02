import type { JsonObject } from "../../core/index.ts";
export type RuntimeAdapterActionRequest = {
  actionType: string;
  parameters: JsonObject;
  target?: JsonObject;
  metadata?: JsonObject;
};
