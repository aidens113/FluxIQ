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
