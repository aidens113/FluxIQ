import type { JsonObject } from "../../core.js";

export type ClientGatewaySnapshot = {
  snapshotId?: string;
  timestamp?: number;
  kind: "state" | "structured" | "image" | "binary" | "custom";
  state?: JsonObject;
  payload?: JsonObject;
  metadata?: JsonObject;
};
