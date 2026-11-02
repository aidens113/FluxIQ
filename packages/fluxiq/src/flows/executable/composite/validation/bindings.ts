import type { AutomationStudioCallFlowBinding } from "../call/index.ts";
import type { AutomationStudioValidationIssue } from "../../validation/index.ts";

export function validateBindings(bindings: AutomationStudioCallFlowBinding[] | undefined, portIds: string[], issues: AutomationStudioValidationIssue[], path: string): void {
  const boundPorts = new Set<string>();
  for (const [index, binding] of (bindings ?? []).entries()) {
    if (!portIds.includes(binding.targetPortId)) issues.push({ severity: "error", code: "flow.call_unknown_port", message: `Call Flow binding references unknown port ${binding.targetPortId}.`, path: `${path}.${index}.targetPortId` });
    if (boundPorts.has(binding.targetPortId)) issues.push({ severity: "error", code: "flow.call_duplicate_port_binding", message: `Call Flow port ${binding.targetPortId} is bound more than once.`, path: `${path}.${index}.targetPortId` });
    boundPorts.add(binding.targetPortId);
    if (!binding.valueKey.trim()) issues.push({ severity: "error", code: "flow.call_binding_missing_value", message: "Call Flow bindings must have a value key.", path: `${path}.${index}.valueKey` });
  }
}
