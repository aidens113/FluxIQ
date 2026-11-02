import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioCompiledPlanNode = {
  id: string;
  definitionId: string;
  definitionVersion: string;
  label: string;
  parameterValues: JsonObject;
  metadata: JsonObject;
};
