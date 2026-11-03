import type { AutomationStudioFlowValueType } from "./value-type.ts";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
export type AutomationStudioFlowPort = {
  id: string;
  name: string;
  valueType: AutomationStudioFlowValueType;
  description?: string;
  required?: boolean;
  defaultValue?: JsonValue;
  metadata?: JsonObject;
};
