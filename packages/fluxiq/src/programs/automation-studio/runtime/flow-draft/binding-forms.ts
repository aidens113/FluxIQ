// The forms a model writes a binding in, and the state binding Core stores
// each one as.
//
// **Why a binding at all (user, 2026-10-02).** A step used to be the exact call
// the build ran, so repetitive work became the same call written out once per
// item, and a value the person gave was typed into the Flow as a constant. A
// binding is how a step says "this value comes from somewhere at run time":
//
//   {"$row": "name"}                   the field of the row a repeat's pass is on
//   {"$input": "query", "test": v}     the Flow's input of that name; v is the
//                                      value the build tests with, and the
//                                      stored Flow's default
//   {"$step": n, ...}                  an earlier step's output: refused here
//                                      until it is built (`step_binding_not_yet`)
//
// **Nothing new runs.** Each form becomes the executor's own state binding,
// `{"$state":{"path","fallback"}}` (`../../nodes/parameter-bindings.ts`), which
// it already resolves against the run's inputs and a For Each pass's `item`:
// a row field is the path `item.<field>`, an input is its bare name with the
// test value as the fallback. The translation happens once, where a step is
// written or bound, so every later reader -- the test, the assembler, the
// stored Flow -- reads one shape.
//
// **A malformed form is refused where it sits, never carried as a literal.** A
// form with a stray key, a wrong type or a name outside the rules would
// otherwise reach a node as an object it was never meant to receive.
//
// Core's words only: a row and a field are the parts of any list.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationNodeStateBinding, isAutomationNodeParameterStateBinding } from "../../nodes/index.ts";

/** The name a Flow input may have. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;
/** The name a row's field may have: one path segment. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD = /^[^.\s]{1,64}$/u;

/** The name the row a pass is on goes by in run state, so no input may take it. */
const ROW_NAME = "item";
/** How deep a value is searched: as far as the executor resolves a binding. */
const MAXIMUM_DEPTH = 16;
const FORM_KEYS = ["$row", "$input", "$step"] as const;

/** Why a form was not translated, at the dotted path it sits at. */
export type AutomationStudioFlowDraftBindingRefusal = { path: string; reason: "malformed" | "step_binding_not_yet" };

/** What a stored state binding stands for, when it is one of the forms a model writes. */
export type AutomationStudioFlowDraftStoredBinding =
  | { kind: "row"; field: string }
  | { kind: "input"; name: string; test: JsonValue };

/** Whether a value is one of the model's binding forms: an object naming `$row`, `$input` or `$step`. */
export function automationStudioFlowDraftIsBindingForm(value: JsonValue | undefined): value is JsonObject {
  return isObject(value) && FORM_KEYS.some((key) => Object.hasOwn(value, key));
}

/**
 * Every form in a parameters object, at any depth, translated into the state
 * binding it stands for. A stored state binding passes through as it is; a
 * form that cannot be translated is left out of the answer and named in
 * `refused` by its dotted path.
 */
export function automationStudioFlowDraftTranslateBindings(parameters: JsonObject): { parameters: JsonObject; refused: AutomationStudioFlowDraftBindingRefusal[] } {
  const refused: AutomationStudioFlowDraftBindingRefusal[] = [];
  const translated = translateValue(parameters, [], refused, 0);
  return { parameters: isObject(translated) ? translated : {}, refused };
}

/** Whether a value holds any binding, written as a form or stored as a state binding, at any depth. */
export function automationStudioFlowDraftHoldsBinding(value: JsonValue | undefined): boolean {
  return holds(value, 0);
}

/** What a stored state binding stands for, or nothing when it is not a row field or a Flow input. */
export function automationStudioFlowDraftStoredBindingKind(value: JsonValue | undefined): AutomationStudioFlowDraftStoredBinding | undefined {
  if (!isAutomationNodeParameterStateBinding(value)) return undefined;
  const state = value.$state;
  const path = state.path;
  if (path.startsWith(`${ROW_NAME}.`)) {
    const field = path.slice(ROW_NAME.length + 1);
    return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field) ? { kind: "row", field } : undefined;
  }
  if (path.includes(".") || state.fallback === undefined || !AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(path) || path === ROW_NAME) return undefined;
  return { kind: "input", name: path, test: state.fallback };
}

/** Every row field and Flow input a value holds as a stored binding, with the dotted path it sits at. */
export function automationStudioFlowDraftStoredBindings(value: JsonValue | undefined): { path: string; binding: AutomationStudioFlowDraftStoredBinding }[] {
  const found: { path: string; binding: AutomationStudioFlowDraftStoredBinding }[] = [];
  collectStored(value, [], found, 0);
  return found;
}

function translateValue(value: JsonValue, path: string[], refused: AutomationStudioFlowDraftBindingRefusal[], depth: number): JsonValue | undefined {
  if (depth > MAXIMUM_DEPTH) return value;
  if (automationStudioFlowDraftIsBindingForm(value)) {
    const translated = translateForm(value);
    if ("reason" in translated) {
      refused.push({ path: path.join("."), reason: translated.reason });
      return undefined;
    }
    return translated.binding;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    value.forEach((item, index) => {
      const translated = translateValue(item, [...path, String(index)], refused, depth + 1);
      if (translated !== undefined) out.push(translated);
    });
    return out;
  }
  if (!isObject(value) || isAutomationNodeParameterStateBinding(value)) return value;
  const out: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const translated = translateValue(item, [...path, key], refused, depth + 1);
    if (translated !== undefined) out[key] = translated;
  }
  return out;
}

/** One form as the state binding it stands for, or why it cannot be one. */
function translateForm(form: JsonObject): { binding: JsonObject } | { reason: AutomationStudioFlowDraftBindingRefusal["reason"] } {
  const keys = Object.keys(form);
  if (Object.hasOwn(form, "$step")) return { reason: "step_binding_not_yet" };
  if (Object.hasOwn(form, "$row")) {
    const field = form.$row;
    if (keys.length !== 1 || typeof field !== "string" || !AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field)) return { reason: "malformed" };
    return { binding: automationNodeStateBinding(`${ROW_NAME}.${field}`) as unknown as JsonObject };
  }
  const name = form.$input;
  const test = form.test;
  if (keys.some((key) => key !== "$input" && key !== "test") || typeof name !== "string") return { reason: "malformed" };
  if (!AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(name) || name === ROW_NAME) return { reason: "malformed" };
  if (test === undefined || test === null || holds(test, 0)) return { reason: "malformed" };
  return { binding: automationNodeStateBinding(name, structuredClone(test)) as unknown as JsonObject };
}

function holds(value: JsonValue | undefined, depth: number): boolean {
  if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => holds(item, depth + 1));
  if (automationStudioFlowDraftIsBindingForm(value) || isAutomationNodeParameterStateBinding(value)) return true;
  return Object.values(value as JsonObject).some((item) => holds(item, depth + 1));
}

function collectStored(value: JsonValue | undefined, path: string[], found: { path: string; binding: AutomationStudioFlowDraftStoredBinding }[], depth: number): void {
  if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStored(item, [...path, String(index)], found, depth + 1));
    return;
  }
  if (isAutomationNodeParameterStateBinding(value)) {
    const binding = automationStudioFlowDraftStoredBindingKind(value);
    if (binding) found.push({ path: path.join("."), binding });
    return;
  }
  for (const [key, item] of Object.entries(value)) collectStored(item, [...path, key], found, depth + 1);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
