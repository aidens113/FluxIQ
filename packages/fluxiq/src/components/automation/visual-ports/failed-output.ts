import type { AutomationNodePort } from "../contracts.ts";

export function failedOutput(label = "Failed"): AutomationNodePort {
  return { id: "failed", label, valueType: "any", role: "failure" };
}
