import { executionText } from "./text.ts";

export function executionResources(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) throw new Error("execution_admission.invalid_resources");
  const result = value.map(item => executionText(item, "resource"));
  if (new Set(result).size !== result.length) throw new Error("execution_admission.invalid_resources");
  return Object.freeze(result.sort());
}
