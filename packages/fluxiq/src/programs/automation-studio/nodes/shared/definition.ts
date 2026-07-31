import type { AutomationNodeDefinition, AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts";
import type { JsonValue } from "../../../../core";

export type AutomationNodeDefinitionInput = Omit<AutomationNodeDefinition, "origin" | "implementationKey"> & {
  implementationKey?: string;
};

export function defineBuiltinNode(definition: AutomationNodeDefinitionInput): AutomationNodeDefinition {
  return {
    ...definition,
    origin: "builtin",
    implementationKey: definition.implementationKey ?? definition.id
  };
}

export function emptyResult(outputs: Record<string, unknown> = {}): AutomationNodeExecutionResult {
  return { status: "success", outputs: outputs as Record<string, JsonValue> };
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
