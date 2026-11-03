import type { AutomationStudioFlowInterface, AutomationStudioFlowPort } from "../interface/index.ts";
import { addIssue, type AutomationStudioValidationIssue } from "./issue.ts";
import { validateFlowValueType, valueMatchesFlowType } from "./value-type.ts";

export function validateFlowInterface(
  value: AutomationStudioFlowInterface,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  validateFlowPorts(value.inputs, issues, `${path}.inputs`);
  validateFlowPorts(value.outputs, issues, `${path}.outputs`);
}

function validateFlowPorts(ports: AutomationStudioFlowPort[], issues: AutomationStudioValidationIssue[], path: string): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, port] of ports.entries()) {
    const portPath = `${path}.${index}`;
    if (!port.id.trim()) addIssue(issues, "error", "flow.port_missing_id", "Flow port must have an id.", `${portPath}.id`);
    if (!port.name.trim()) addIssue(issues, "error", "flow.port_missing_name", "Flow port must have a name.", `${portPath}.name`);
    if (ids.has(port.id)) addIssue(issues, "error", "flow.duplicate_port_id", `Duplicate Flow port id "${port.id}".`, `${portPath}.id`);
    if (names.has(port.name)) addIssue(issues, "error", "flow.duplicate_port_name", `Duplicate Flow port name "${port.name}".`, `${portPath}.name`);
    ids.add(port.id);
    names.add(port.name);
    validateFlowValueType(port.valueType, issues, `${portPath}.valueType`);
    if (port.defaultValue !== undefined && !valueMatchesFlowType(port.defaultValue, port.valueType)) {
      addIssue(issues, "error", "flow.port_default_type_mismatch", `Default value for port "${port.id}" does not match its declared type.`, `${portPath}.defaultValue`);
    }
  }
}
