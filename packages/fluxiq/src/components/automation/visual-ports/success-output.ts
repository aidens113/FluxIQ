import type { AutomationNodePort } from "../contracts.ts";

export function successOutput(label = "Success"): AutomationNodePort {
  return { id: "success", label, valueType: "any", role: "success" };
}
