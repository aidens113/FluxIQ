import { isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioProcessingInputs } from "../../../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME, automationStudioFlowDraftTranslateBindings } from "../../../../../runtime/flow-authoring/draft/index.ts";

type BoundInput = { path: (string | number)[]; name: string; value: JsonObject };
export type AutomationStudioAnswerFirstProcessingInputs =
  | { ok: true; resolved: JsonValue; bindings: BoundInput[]; stored(process: JsonObject): JsonObject | undefined }
  | { ok: false; issues: string[] };

/** Resolve only explicit existing $input forms against real current nonsecret caller inputs. Equality never turns a constant into a binding, and fallback never supplies a missing runtime input. */
export function automationStudioAnswerFirstProcessingInputs(raw: JsonValue, inputs: Readonly<Record<string, JsonValue>> | undefined): AutomationStudioAnswerFirstProcessingInputs {
  const issues: string[] = [];
  const bindings: BoundInput[] = [];
  const walk = (value: JsonValue, path: (string | number)[]): JsonValue => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((entry, index) => walk(entry, [...path, index]));
    if (Object.hasOwn(value, "$state") || Object.hasOwn(value, "$row") || Object.hasOwn(value, "$step")) {
      issues.push(`Processing ${path.join(".")} must use an explicit known $input form, never raw framework state or another row/step.`);
      return value;
    }
    if (Object.hasOwn(value, "$input")) {
      const name = value.$input;
      if (Object.keys(value).some((key) => key !== "$input" && key !== "test") || typeof name !== "string" || !AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(name) || name === "item") {
        issues.push(`Invalid processing input binding at ${path.join(".")}. Bind a value, not field names or grammar.`);
        return value;
      }
      const written = automationStudioFlowDraftTranslateBindings({ value });
      if (written.refused.length) {
        issues.push(`Processing input ${name} needs the existing explicit $input/test form at ${path.join(".")}.`);
        return value;
      }
      if (!inputs || !Object.hasOwn(inputs, name) || !isJsonValue(inputs[name])) {
        issues.push(`Required processing input ${name} is missing at ${path.join(".")}; the first run's test/fallback is not current evidence.`);
        return value;
      }
      const actual = structuredClone(inputs[name]!);
      const form: JsonObject = { $input: name, test: actual };
      const translated = automationStudioFlowDraftTranslateBindings({ value: form });
      const binding = translated.parameters.value;
      if (translated.refused.length || !binding || typeof binding !== "object" || Array.isArray(binding)) {
        issues.push(`Processing input ${name} cannot supply this value at ${path.join(".")}.`);
        return value;
      }
      bindings.push({ path, name, value: binding });
      return form;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry, [...path, key])]));
  };
  const template = walk(raw, []);
  if (issues.length) return { ok: false, issues };
  const translated = automationStudioFlowDraftTranslateBindings({ process: template });
  if (translated.refused.length) return { ok: false, issues: translated.refused.map((entry) => `Processing binding ${entry.path}: ${entry.reason}.`) };
  const resolved = automationStudioProcessingInputs({ process: translated.parameters.process!, inputs });
  if (!resolved.ok) return { ok: false, issues: resolved.issues };
  return { ok: true, resolved: resolved.process, bindings, stored(process) {
    const stored = structuredClone(process);
    for (const binding of bindings) {
      let at: JsonObject | JsonValue[] = stored;
      for (const key of binding.path.slice(0, -1)) {
        const next: JsonValue | undefined = Array.isArray(at) ? at[Number(key)] : at[String(key)];
        if (!next || typeof next !== "object") return undefined;
        at = next;
      }
      const key = binding.path.at(-1)!;
      if (Array.isArray(at)) at[Number(key)] = structuredClone(binding.value);
      else {
        if (!Object.hasOwn(at, key)) return undefined;
        at[String(key)] = structuredClone(binding.value);
      }
    }
    return stored;
  } };
}
