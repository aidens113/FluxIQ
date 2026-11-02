import type { AutomationNodePort, AutomationNodeValueType } from "../contracts.ts";

export function dataOutput(id = "data", label = "Data", valueType: AutomationNodeValueType = "any"): AutomationNodePort {
  return { id, label, valueType, role: "data" };
}
