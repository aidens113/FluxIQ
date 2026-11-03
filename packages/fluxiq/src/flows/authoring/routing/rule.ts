import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableRouteRule } from "../../executable/routing/index.ts";

export type AutomationStudioFlowRouteRule = ExecutableRouteRule & {
  schemaVersion: "0.1";
  routerId: string;
  name: string;
  description?: string;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
