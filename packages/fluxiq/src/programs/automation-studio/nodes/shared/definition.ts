import type { AutomationNodeDefinition, AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodePort, AutomationNodeValueType } from "../contracts";
import type { JsonValue } from "../../../../core";

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

export function emptyResult(outputs: Record<string, unknown> = {}): AutomationNodeExecutionResult {
  return { status: "success", route: "success", outputs: outputs as Record<string, JsonValue> };
}

export function failedResult(outputs: Record<string, unknown> = {}): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: outputs as Record<string, JsonValue> };
}

export function controlInput(label = "In"): AutomationNodePort {
  return { id: "in", label, valueType: "any", role: "control" };
}

export function successOutput(label = "Success"): AutomationNodePort {
  return { id: "success", label, valueType: "any", role: "success" };
}

export function failedOutput(label = "Failed"): AutomationNodePort {
  return { id: "failed", label, valueType: "any", role: "failure" };
}

export function errorOutput(label = "Error"): AutomationNodePort {
  return { id: "error", label, valueType: "object", role: "error" };
}

export function dataOutput(id = "data", label = "Data", valueType: AutomationNodeValueType = "any"): AutomationNodePort {
  return { id, label, valueType, role: "data" };
}

export function branchOutput(id: string, label: string, valueType: AutomationNodeValueType = "any"): AutomationNodePort {
  return { id, label, valueType, role: "branch" };
}

export function successFailureOutputs(data?: AutomationNodePort): AutomationNodePort[] {
  return data ? [successOutput(), failedOutput(), data] : [successOutput(), failedOutput()];
}

export function visualNodeInputs(inputs: AutomationNodePort[] = []): AutomationNodePort[] {
  return [controlInput(), ...inputs];
}

export function inputValue(context: AutomationNodeExecutionContext, id: string) {
  return context.inputs[id] ?? context.parameters[id];
}

export function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true", "yes", "1", "on"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

export function objectValue(value: unknown): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, JsonValue>;
  return {};
}

export function jsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  }
  return String(value);
}

export function getPathValue(source: unknown, path: unknown): unknown {
  const parts = stringValue(path).split(".").map((part) => part.trim()).filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return current;
}

export function setPathValue(source: Record<string, JsonValue>, path: unknown, value: unknown): Record<string, JsonValue> {
  const parts = stringValue(path).split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return source;
  const next = { ...source };
  let cursor: Record<string, JsonValue> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    const child = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } as Record<string, JsonValue> : {};
    cursor[part] = child;
    cursor = child;
  }
  cursor[parts[parts.length - 1]!] = jsonValue(value);
  return next;
}

export function compareBasic(left: unknown, right: unknown, operator: unknown): boolean {
  switch (stringValue(operator, "equals")) {
    case "not-equals": return left !== right;
    case "greater-than": return numberValue(left) > numberValue(right);
    case "greater-than-or-equal": return numberValue(left) >= numberValue(right);
    case "less-than": return numberValue(left) < numberValue(right);
    case "less-than-or-equal": return numberValue(left) <= numberValue(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    case "starts-with": return String(left ?? "").startsWith(String(right ?? ""));
    case "ends-with": return String(left ?? "").endsWith(String(right ?? ""));
    case "exists": return left !== undefined && left !== null && left !== "";
    case "equals":
    default: return left === right;
  }
}
