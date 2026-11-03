import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableRouter } from "../../executable/routing/index.ts";
import type { AutomationStudioFlowExpansionStatus } from "./definition-status.ts";
import type { AutomationStudioFlowRouteRule } from "./rule.ts";

export type AutomationStudioFlowRouter = ExecutableRouter<AutomationStudioFlowRouteRule> & {
  schemaVersion: "0.1";
  projectId: string;
  name: string;
  description?: string;
  status: AutomationStudioFlowExpansionStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
