import type { JsonObject } from "../../core.js";

export type ClientGatewayCapability = {
  id: string;
  label?: string;
  kind: "recording" | "snapshot" | "action" | "state" | "runtime" | "custom";
  actionTypes?: string[];
  metadata?: JsonObject;
};
