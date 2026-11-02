import type { AutomationNodePort } from "../contracts.ts";

export function errorOutput(label = "Error"): AutomationNodePort {
  return { id: "error", label, valueType: "object", role: "error" };
}
