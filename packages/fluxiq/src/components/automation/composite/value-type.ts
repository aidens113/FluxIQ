import type { AutomationStudioFlowValueType } from "../../../flows/executable/interface/index.ts";

export function flowValueTypeToNodeValueType(value: AutomationStudioFlowValueType): "string" | "number" | "boolean" | "object" | "array" | "any" {
  if (value.kind === "string") return "string";
  if (value.kind === "number") return "number";
  if (value.kind === "boolean") return "boolean";
  if (value.kind === "array") return "array";
  if (value.kind === "record" || value.kind === "schema" || value.kind === "json") return "object";
  return "any";
}
