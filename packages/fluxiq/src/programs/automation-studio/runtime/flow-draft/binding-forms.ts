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
//   {"$step": n, "output": o}          output o of the earlier step n, as that
//   {"$step": n, "output": o,          step's node declares it; with `path`,
//    "path": "a.b"}                    one field of a record output (P5, t270)
//
// **Nothing new runs.** Each form becomes the executor's own state binding,
// `{"$state":{"path","fallback"}}` (`../../nodes/parameter-bindings.ts`), which
// it already resolves against the run's inputs and a For Each pass's `item`:
// a row field is the path `item.<field>`, an input is its bare name with the
// test value as the fallback. The translation happens once, where a step is
// written or bound, so every later reader -- the test, the assembler, the
// stored Flow -- reads one shape.
//
// **An earlier step's output is named by that step's id, not its number.** A
// position is renumbered the moment a step is moved or withdrawn, so `n` is
// read against the draft as it stands when the form is written (`context`)
// and stored as `$step.<id>.<output>[.<field>]`, which no edit renumbers. Only
// a step strictly before the one being written, that worked and is not
// withdrawn, and only an output its node declares, where the node is known.
// No draft in hand, no translation: the form is refused `step_binding_not_yet`
// exactly as before P5, so a caller that has not been given the draft never
// stores a number. No run state is kept under `$step`: the build's test
// supplies each step's output there from what that step answered in the same
// test (`automationStudioFlowDraftStepOutputsState`, `../llm/node-tools/replay-draft.ts`),
// and the assembler rewrites it to the node the step became
// (`../flow-bootstrap/authoring/assemble-draft.ts`). Unresolved, it is missing,
// never a value.
//
// **A malformed form is refused where it sits, never carried as a literal.** A
// form with a stray key, a wrong type or a name outside the rules would
// otherwise reach a node as an object it was never meant to receive.
//
// Core's words only: a row and a field are the parts of any list.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationNodeStateBinding, isAutomationNodeParameterStateBinding } from "../../nodes/index.ts";
import { automationStudioFlowDraftStepId } from "./routing.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

/** The name a Flow input may have. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;
/** The name a row's field may have: one path segment. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD = /^[^.\s]{1,64}$/u;

/**
 * The first segment of the path an earlier step's output is stored under,
 * until assembly names the node: `$step.<step id>.<output>[.<field>]`.
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT = "$step";

/** The name the row a pass is on goes by in run state, so no input may take it. */
const ROW_NAME = "item";
/** A step's id and an output's id, as a stored path can carry them: one segment each. */
const STEP_ID = /^[A-Za-z0-9_-]{1,64}$/u;
const OUTPUT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
/** A list index: never a field, because the executor walks no list (`../../nodes/parameter-bindings.ts`). */
const INDEX = /^[0-9]+$/u;
/** How deep a value is searched: as far as the executor resolves a binding. */
const MAXIMUM_DEPTH = 16;
const FORM_KEYS = ["$row", "$input", "$step"] as const;

/**
 * Why a form was not translated, at the dotted path it sits at. For an earlier
 * step's output: no draft to read it against (`step_binding_not_yet`), no step
 * at that position (`step_missing`), that step or one after it
 * (`step_not_earlier`), a step withdrawn, only looked or failed
 * (`step_not_usable`), an output its node does not declare (`step_output_unknown`).
 */
export type AutomationStudioFlowDraftBindingRefusal = {
  path: string;
  reason: "malformed" | "step_binding_not_yet" | "step_missing" | "step_not_earlier" | "step_not_usable" | "step_output_unknown";
};

/**
 * The draft an earlier step's output is read against: its steps as they stand
 * now, and the position of the step the form is written into -- absent, a step
 * about to be appended after all of them. `nodeOf` says which outputs a node
 * declares; absent, or for a node it does not know, the assembler checks the
 * output against the registry instead. `stepAt` finds the step at n where the
 * numbers are not the steps' own positions: an amendment's, read against the
 * draft as shown before the decision moved anything (`./amendment/shown-numbering.ts`).
 */
export type AutomationStudioFlowDraftBindingContext = {
  steps: readonly AutomationStudioFlowDraftStep[];
  at?: number | undefined;
  stepAt?: ((position: number) => AutomationStudioFlowDraftStep | undefined) | undefined;
  nodeOf?: ((nodeId: string) => { readonly outputs: readonly { readonly id: string }[] } | undefined) | undefined;
};

/** What a stored state binding stands for, when it is one of the forms a model writes. */
export type AutomationStudioFlowDraftStoredBinding =
  | { kind: "row"; field: string }
  | { kind: "input"; name: string; test: JsonValue }
  | { kind: "step"; step: string; output: string; path?: string };

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
export function automationStudioFlowDraftTranslateBindings(
  parameters: JsonObject,
  context?: AutomationStudioFlowDraftBindingContext
): { parameters: JsonObject; refused: AutomationStudioFlowDraftBindingRefusal[] } {
  const refused: AutomationStudioFlowDraftBindingRefusal[] = [];
  const translated = translateValue(parameters, [], refused, 0, context);
  return { parameters: isObject(translated) ? translated : {}, refused };
}

/** Whether a value holds any binding, written as a form or stored as a state binding, at any depth. */
export function automationStudioFlowDraftHoldsBinding(value: JsonValue | undefined): boolean {
  return holds(value, 0);
}

/** What a stored state binding stands for, or nothing when it is not a row field, a Flow input or an earlier step's output. */
export function automationStudioFlowDraftStoredBindingKind(value: JsonValue | undefined): AutomationStudioFlowDraftStoredBinding | undefined {
  if (!isAutomationNodeParameterStateBinding(value)) return undefined;
  const state = value.$state;
  const path = state.path;
  if (path.startsWith(`${AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT}.`)) {
    const [, step, output, ...fields] = path.split(".");
    if (state.fallback !== undefined || step === undefined || !STEP_ID.test(step) || output === undefined || !OUTPUT_ID.test(output) || !fields.every(isField)) return undefined;
    return { kind: "step", step, output, ...(fields.length ? { path: fields.join(".") } : {}) };
  }
  if (path.startsWith(`${ROW_NAME}.`)) {
    const field = path.slice(ROW_NAME.length + 1);
    return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(field) ? { kind: "row", field } : undefined;
  }
  if (path.includes(".") || state.fallback === undefined || !AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME.test(path) || path === ROW_NAME) return undefined;
  return { kind: "input", name: path, test: state.fallback };
}

/**
 * Run state holding what each step really produced, keyed so an earlier
 * step's output resolves through the executor's own resolver: the step's
 * outputs object under `$step.<id>`, read by the binding's output and field.
 * A step that is not here produced nothing, and a binding naming it is missing.
 */
export function automationStudioFlowDraftStepOutputsState(outputs: Iterable<readonly [string, JsonObject]>): Record<string, JsonValue> {
  const state: Record<string, JsonValue> = {};
  for (const [stepId, produced] of outputs) state[`${AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT}.${stepId}`] = produced;
  return state;
}

/** Every row field, Flow input and earlier step's output a value holds as a stored binding, with the dotted path it sits at. */
export function automationStudioFlowDraftStoredBindings(value: JsonValue | undefined): { path: string; binding: AutomationStudioFlowDraftStoredBinding }[] {
  const found: { path: string; binding: AutomationStudioFlowDraftStoredBinding }[] = [];
  collectStored(value, [], found, 0);
  return found;
}

function translateValue(
  value: JsonValue,
  path: string[],
  refused: AutomationStudioFlowDraftBindingRefusal[],
  depth: number,
  context: AutomationStudioFlowDraftBindingContext | undefined
): JsonValue | undefined {
  if (depth > MAXIMUM_DEPTH) return value;
  if (automationStudioFlowDraftIsBindingForm(value)) {
    const translated = translateForm(value, context);
    if ("reason" in translated) {
      refused.push({ path: path.join("."), reason: translated.reason });
      return undefined;
    }
    return translated.binding;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    value.forEach((item, index) => {
      const translated = translateValue(item, [...path, String(index)], refused, depth + 1, context);
      if (translated !== undefined) out.push(translated);
    });
    return out;
  }
  if (!isObject(value) || isAutomationNodeParameterStateBinding(value)) return value;
  const out: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const translated = translateValue(item, [...path, key], refused, depth + 1, context);
    if (translated !== undefined) out[key] = translated;
  }
  return out;
}

/** One form as the state binding it stands for, or why it cannot be one. */
function translateForm(form: JsonObject, context: AutomationStudioFlowDraftBindingContext | undefined): { binding: JsonObject } | { reason: AutomationStudioFlowDraftBindingRefusal["reason"] } {
  const keys = Object.keys(form);
  if (Object.hasOwn(form, "$step")) return translateStepForm(form, context);
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

/**
 * An earlier step's output as the state binding it is stored as, read against
 * the draft in `context` (see the header), or why it cannot be one.
 */
function translateStepForm(form: JsonObject, context: AutomationStudioFlowDraftBindingContext | undefined): { binding: JsonObject } | { reason: AutomationStudioFlowDraftBindingRefusal["reason"] } {
  // No draft, no translation, whatever the form says: a caller not given the
  // draft never stores a position (see the header).
  if (!context) return { reason: "step_binding_not_yet" };
  const position = form.$step;
  const output = form.output;
  const field = form.path;
  if (Object.keys(form).some((key) => key !== "$step" && key !== "output" && key !== "path")) return { reason: "malformed" };
  if (typeof position !== "number" || !Number.isSafeInteger(position) || position < 1) return { reason: "malformed" };
  if (typeof output !== "string" || !OUTPUT_ID.test(output)) return { reason: "malformed" };
  if (field !== undefined && (typeof field !== "string" || !field.split(".").every(isField))) return { reason: "malformed" };
  if (context.at !== undefined && position >= context.at) return { reason: "step_not_earlier" };
  const source = context.stepAt ? context.stepAt(position) : context.steps.find((step) => step.position === position);
  if (!source) return { reason: "step_missing" };
  const id = automationStudioFlowDraftStepId(source);
  const withdrawn = source.disposition === "dropped" || source.disposition === "exploratory";
  if (withdrawn || !automationStudioFlowDraftStepIsProposable(source) || !STEP_ID.test(id)) return { reason: "step_not_usable" };
  const node = context.nodeOf?.(source.actionId);
  if (node && !node.outputs.some((port) => port.id === output)) return { reason: "step_output_unknown" };
  const stored = [AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT, id, output, ...(field === undefined ? [] : [field])].join(".");
  return { binding: automationNodeStateBinding(stored) as unknown as JsonObject };
}

/** One segment of a field path: a field's own name, never a list index. */
function isField(segment: string): boolean {
  return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(segment) && !INDEX.test(segment);
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
