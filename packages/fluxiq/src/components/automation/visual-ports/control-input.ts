import type { AutomationNodePort } from "../contracts.ts";

export function controlInput(label = "In"): AutomationNodePort {
  return { id: "in", label, valueType: "any", role: "control" };
}
