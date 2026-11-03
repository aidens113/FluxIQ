import type { AutomationNodePort, AutomationNodeValueType } from "../contracts.ts";

export function branchOutput(id: string, label: string, valueType: AutomationNodeValueType = "any"): AutomationNodePort {
  return { id, label, valueType, role: "branch" };
}
