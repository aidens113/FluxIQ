import type { AutomationNodeParameter, AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";

export function defaultAutomationParameterValues(parameters: AutomationNodeParameter[]): JsonObject {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue ?? defaultAutomationParameterValue(parameter)]));
}

function defaultAutomationParameterValue(parameter: AutomationNodeParameter): unknown {
  if (parameter.options?.[0]) return parameter.options[0].value;
  if (parameter.valueType === "number") return 0;
  if (parameter.valueType === "boolean") return false;
  if (parameter.valueType === "json") return {};
  return "";
}

export function automationVisualInputPorts(inputs: AutomationNodePort[], nodeDefinitionId: string): AutomationNodePort[] {
  if (inputs.length || nodeDefinitionId === "builtin.control.start") return inputs;
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}
