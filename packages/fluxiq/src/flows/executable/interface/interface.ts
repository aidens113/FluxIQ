import type { AutomationStudioFlowPort } from "./port.ts";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
export type AutomationStudioFlowInterface = {
  inputs: AutomationStudioFlowPort[];
  outputs: AutomationStudioFlowPort[];
};
