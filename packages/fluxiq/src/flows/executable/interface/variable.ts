import type { AutomationStudioFlowValueType } from "./value-type.ts";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
export type AutomationStudioFlowVariable = {
  id: string;
  name: string;
  valueType: AutomationStudioFlowValueType;
  initialValue?: JsonValue;
  description?: string;
  metadata?: JsonObject;
};
