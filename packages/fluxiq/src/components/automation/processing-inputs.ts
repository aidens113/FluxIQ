import { parseAutomationStudioRecordProcessing, parseAutomationStudioRecordSchema } from "@fluxiq/contracts/records";
import { FLOW_INPUT_IDENTIFIER, isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../core/index.ts";
import { resolveAutomationNodeParameterValues } from "./parameter-bindings.ts";

const VALUE_KEYS = new Set(["atLeast", "atMost", "lessThan", "greaterThan", "equals", "within", "contains", "startsWith", "endsWith", "matches"]);

/** Resolve a processing template from actual caller inputs only. Test fallbacks are static examples and never evidence that a current input exists. */
export function automationStudioProcessingInputs(input: { process: JsonValue; inputs?: Readonly<Record<string, JsonValue>> | undefined; schema?: JsonValue | undefined }):
  | { ok: true; process: JsonValue }
  | { ok: false; missingPaths: string[]; issues: string[] } {
  const missingPaths: string[] = [];
  const issues: string[] = [];
  if (object(input.process) && Object.hasOwn(input.process, "declaration") && input.schema === undefined) {
    return { ok: false, missingPaths: ["recordOutput.schema"], issues: ["An automatic processing template requires its full retained schema before current input values may execute."] };
  }
  const walk = (value: JsonValue, path: (string | number)[]): JsonValue => {
    if (Array.isArray(value)) return value.map((entry, index) => walk(entry, [...path, index]));
    if (!object(value)) return value;
    if (Object.hasOwn(value, "$state")) {
      const binding = value.$state;
      const name = object(binding) ? binding.path : undefined;
      if (!allowed(path) || Object.keys(value).length !== 1 || !object(binding) || Object.keys(binding).some((key) => key !== "path" && key !== "fallback") || typeof name !== "string" || !FLOW_INPUT_IDENTIFIER.test(name) || name === "item") {
        missingPaths.push(`recordOutput.process.${path.join(".")}`);
        issues.push(`Processing ${path.join(".")} must bind an allowed value to one real caller input, never a row, step, field name or arbitrary state path.`);
        return value;
      }
      if (!input.inputs || !Object.hasOwn(input.inputs, name) || !isJsonValue(input.inputs[name]) || input.inputs[name] === null) {
        missingPaths.push(name);
        issues.push(`Current processing input ${name} is missing or null at ${path.join(".")}; its test fallback cannot execute.`);
        return value;
      }
      const actual = input.inputs[name];
      // Every supported criterion operand is a primitive or a list of primitives.
      // Never pass object data back through the parameter interpreter as new instructions.
      if (typeof actual === "object" && (!Array.isArray(actual) || actual.some((entry) => entry === null || typeof entry === "object"))) {
        missingPaths.push(name);
        issues.push(`Current processing input ${name} has an unsupported object value at ${path.join(".")}.`);
        return value;
      }
      // Keep the established resolver, but remove the example after proving the exact current key.
      return { $state: { path: name } };
    }
    if (Object.hasOwn(value, "$input") || Object.hasOwn(value, "$row") || Object.hasOwn(value, "$step")) {
      missingPaths.push(`recordOutput.process.${path.join(".")}`);
      issues.push("A processing template contains an untranslated or unsupported binding.");
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry, [...path, key])]));
  };
  const template = walk(input.process, []);
  if (issues.length) return { ok: false, missingPaths: [...new Set(missingPaths)], issues };
  const resolved = resolveAutomationNodeParameterValues({ process: template }, { ...input.inputs });
  if (resolved.missingPaths.length || resolved.values.process === undefined) return { ok: false, missingPaths: resolved.missingPaths, issues: ["Current processing input resolution is unavailable."] };
  if (input.schema !== undefined) {
    const schema = parseAutomationStudioRecordSchema(input.schema);
    if (!schema.ok) return { ok: false, missingPaths: ["recordOutput.schema"], issues: schema.issues };
    const parsed = parseAutomationStudioRecordProcessing(resolved.values.process, schema.schema);
    if (!parsed.ok) return { ok: false, missingPaths: ["recordOutput.process"], issues: parsed.issues };
  }
  return { ok: true, process: resolved.values.process };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function allowed(path: readonly (string | number)[]): boolean {
  if (path.length === 1) return path[0] === "limit" || path[0] === "minRows";
  if (path[0] === "derive") return path.length === 3 && typeof path[1] === "number" && path[2] === "pattern";
  const start = path[0] === "where" && typeof path[1] === "number" ? 2 : path[0] === "anyOf" && typeof path[1] === "number" && typeof path[2] === "number" ? 3 : -1;
  return start > 0 && typeof path[start] === "string" && VALUE_KEYS.has(path[start] as string) && (path.length === start + 1 || path.length === start + 2 && typeof path[start + 1] === "number");
}
