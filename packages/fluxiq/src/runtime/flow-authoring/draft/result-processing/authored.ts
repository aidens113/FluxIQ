import type { JsonValue } from "../../../../core/index.ts";

/** Refuse authority metadata only in authored record-output configuration, never a captured row. */
export function automationStudioAuthoredProcessingIssue(value: unknown): string | undefined {
  if (!object(value)) return undefined;
  for (const holder of [value, ...(object(value.parameters) ? [value.parameters] : [])]) {
    const output = Object.entries(holder).find(([key]) => key.replace(/[^a-z0-9]/giu, "").toLowerCase() === "recordoutput")?.[1];
    if (!object(output) || !object(output.process)) continue;
    if (Object.hasOwn(output.process, "declaration")) return "record_output.process_declaration_framework_owned";
    if (hasState(output.process)) return "record_output.process_input_binding_required";
  }
  return undefined;
}

function hasState(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasState);
  return object(value) && (Object.hasOwn(value, "$state") || Object.hasOwn(value, "$row") || Object.hasOwn(value, "$step") || Object.values(value).some(hasState));
}

function object(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
