import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowExpansionStatus } from "./definition-status.ts";

export type AutomationStudioFlowRouteGroup = {
  schemaVersion: "0.1";
  groupId: string;
  routerId: string;
  name: string;
  description?: string;
  order: number;
  status: AutomationStudioFlowExpansionStatus;
  collapsed?: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
