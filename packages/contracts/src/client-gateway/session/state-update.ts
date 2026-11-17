import type { JsonObject } from "../../core.js";

export type ClientGatewayStateUpdate = {
  activeContextId?: string;
  contexts?: JsonObject[];
  state?: JsonObject;
  recording?: boolean;
  metadata?: JsonObject;
};
