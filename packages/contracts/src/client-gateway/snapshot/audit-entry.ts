import type { JsonObject } from "../../core.js";

export type ClientGatewayAuditEntry = {
  id: string;
  timestamp: number;
  sessionId?: string;
  type: string;
  message: string;
  metadata?: JsonObject;
};
