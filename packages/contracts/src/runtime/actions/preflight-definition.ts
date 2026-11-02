import type { AutomationConditionGroup } from "../../state/conditions/index.js";
import type { JsonObject } from "../../core.js";

export type PreflightDefinition = {
  requiredCapabilities?: string[];
  conditions?: AutomationConditionGroup;
  metadata?: JsonObject;
};
