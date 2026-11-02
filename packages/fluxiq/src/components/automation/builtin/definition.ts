import type { AutomationNodeDefinition, AutomationNodePort } from "../contracts.ts";
import { controlInput, failedOutput, successOutput } from "../visual-ports/index.ts";

export type AutomationNodeDefinitionInput = Omit<AutomationNodeDefinition, "origin" | "implementationKey"> & {
  implementationKey?: string;
};

export function defineBuiltinNode(definition: AutomationNodeDefinitionInput): AutomationNodeDefinition {
  const normalized = normalizeVisualPorts(definition);
  return {
    ...normalized,
    origin: "builtin",
    implementationKey: definition.implementationKey ?? definition.id
  };
}

function normalizeVisualPorts(definition: AutomationNodeDefinitionInput): AutomationNodeDefinitionInput {
  const inputs = normalizeVisualInputs(definition);
  const outputs = normalizeVisualOutputs(definition);
  return { ...definition, inputs, outputs };
}

function normalizeVisualInputs(definition: AutomationNodeDefinitionInput): AutomationNodePort[] {
  const inputs = definition.inputs.map((port) => normalizePortRole(port, "target"));
  if (definition.id === "builtin.control.start") return inputs;
  if (inputs.some((port) => port.id === "in" || port.role === "control")) return inputs;
  return [controlInput(), ...inputs];
}

function normalizeVisualOutputs(definition: AutomationNodeDefinitionInput): AutomationNodePort[] {
  if (definition.id === "builtin.control.end") return definition.outputs.map((port) => normalizePortRole(port, "source"));
  const outputs = definition.outputs.map((port) => normalizePortRole(port, "source"));
  if (outputs.some((port) => port.role === "branch")) return outputs;
  if (!outputs.some((port) => port.id === "success" || port.role === "success")) outputs.unshift(successOutput());
  if (!outputs.some((port) => port.id === "failed" || port.role === "failure")) {
    const insertAt = outputs.some((port) => port.id === "success") ? 1 : outputs.length;
    outputs.splice(insertAt, 0, failedOutput());
  }
  return outputs;
}

function normalizePortRole(port: AutomationNodePort, direction: "source" | "target"): AutomationNodePort {
  if (port.role) return port;
  if (port.id === "in") return { ...port, role: "control" };
  if (port.id === "success") return { ...port, role: "success" };
  if (port.id === "failed" || port.id === "failure") return { ...port, role: "failure" };
  if (port.id === "error") return { ...port, role: "error" };
  if (direction === "source" && ["true", "false", "body", "done", "case", "default", "approved", "rejected", "timeout", "recovered"].includes(port.id)) return { ...port, role: "branch" };
  if (direction === "source") return { ...port, role: "data" };
  return port;
}
