import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftIsBindingForm,
  automationStudioFlowDraftStoredBindingKind,
  automationStudioFlowDraftTranslateBindings
} from "../binding-forms.ts";
import { automationStudioFlowDraftBindablePaths } from "../bindable/index.ts";
import { automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

/** The key a node call's argument holds its parameters under. */
const PARAMETERS_KEY = "parameters";

type BindRefusal = { ok: false; reason: AutomationStudioFlowDraftAmendmentRefusal["reason"]; parameter?: string; control?: true; bindable?: string[] };

/** One binding form the patch sets, where it sits under the parameters, and the value it replaces. */
type BindLeaf = { path: string[]; form: JsonObject; replaced: JsonValue };

/**
 * Lift the parameters a `bind` names into bindings, or say why not (design
 * t252, D2).
 *
 * Everything is checked before anything is written, so a refused bind leaves
 * the step exactly as it was. Generalizing lifts an argument the step already
 * has: every leaf the patch sets must be a binding form, and must replace a
 * value the step ran with. An earlier step's output (`$step`) names a step
 * before this one in the draft as it stands, and is stored under that step's
 * id (P5, t270). The bindings are written into both what the step
 * runs with and what it shows -- the draft renders them back as forms
 * (`../binding-render.ts`) -- and the first concrete argument is kept as the
 * step's `instance`. A row field needs the step inside a repeat span; whether
 * that span is over a list is the assembler's to check, from the node it
 * repeats over.
 *
 * What the step ran with is what is checked, and what the draft shows (`input`)
 * is read beside it only to say what a key missing there is: one the draft
 * shows is the control the step acted on (`control`, live run
 * `run-musp4h2f-72e8ed99`), not a key the model made up. Either way the
 * refusal carries what the step does offer (`bindable`, `../bindable/paths.ts`).
 */
export function automationStudioFlowDraftAmendmentBind(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  amendment: AutomationStudioFlowDraftAmendment,
  /** The draft as the model was shown it, which a `$step` number is read against; absent, the steps' own positions. */
  numbering?: AutomationStudioFlowDraftShownNumbering
): { ok: true } | BindRefusal {
  if (!automationStudioFlowDraftStepIsProposed(step)) return { ok: false, reason: "not_a_kept_step" };
  const argument = step.ranWith ?? step.input;
  const nested = isObject(argument[PARAMETERS_KEY]);
  const parameters = nested ? argument[PARAMETERS_KEY] as JsonObject : argument;
  const patch = amendment.input === undefined ? undefined : unwrappedPatch(amendment.input, nested);
  if (!patch || !Object.keys(patch).length) return { ok: false, reason: "bind_not_a_binding" };
  const leaves: BindLeaf[] = [];
  const shown = isObject(step.input[PARAMETERS_KEY]) ? step.input[PARAMETERS_KEY] as JsonObject : step.input;
  const problem = collectBindLeaves(patch, parameters, shown, [], leaves);
  if (problem) return problem.reason === "bind_new_key" ? { ...problem, bindable: automationStudioFlowDraftBindablePaths(step) } : problem;
  const bindings: { path: string[]; binding: JsonObject }[] = [];
  for (const leaf of leaves) {
    const parameter = leaf.path.join(".");
    // A Flow input written without its test value is tested with the value it replaces.
    let form = leaf.form;
    if (Object.hasOwn(form, "$input") && !Object.hasOwn(form, "test")) {
      const test = replacedTest(leaf.replaced);
      if (test === undefined) return { ok: false, reason: "bind_malformed", parameter };
      form = { ...form, test };
    }
    // An earlier step's output is read against the draft as it stands, and
    // only a step before this one answers (`../binding-forms.ts`). A `step_*`
    // refusal is told as `bind_malformed`, whose text says what n may be.
    const translated = automationStudioFlowDraftTranslateBindings({ value: form }, numbering ? { steps, at: numbering.number(step), stepAt: (position) => numbering.step(position) } : { steps, at: step.position });
    const binding = translated.parameters.value;
    if (translated.refused.length || !isObject(binding)) return { ok: false, reason: "bind_malformed", parameter };
    if (automationStudioFlowDraftStoredBindingKind(binding)?.kind === "row" && !insideRepeat(steps, step)) return { ok: false, reason: "bind_row_outside_loop", parameter };
    bindings.push({ path: leaf.path, binding });
  }
  const unchanged = bindings.every(({ path, binding }) => JSON.stringify(valueAt(parameters, path)) === JSON.stringify(binding));
  if (unchanged && amendment.settings === undefined) return { ok: false, reason: "already_so" };
  // The run that worked, once: a later bind never replaces it, and a written step has none.
  if (step.instance === undefined && step.written !== true && step.checkedCandidate === undefined && !automationStudioFlowDraftHoldsBinding(argument)) step.instance = structuredClone(argument);
  for (const { path, binding } of bindings) {
    if (step.ranWith) setAt(containerOf(step.ranWith, nested), path, binding);
    if (step.input !== step.ranWith) setAt(containerOf(step.input, nested), path, binding);
  }
  if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
  return { ok: true };
}

/** The patch under the parameters: written with or without `parameters` around it. */
function unwrappedPatch(patch: JsonObject, nested: boolean): JsonObject {
  const keys = Object.keys(patch);
  return nested && keys.length === 1 && keys[0] === PARAMETERS_KEY && isObject(patch[PARAMETERS_KEY]) ? patch[PARAMETERS_KEY] as JsonObject : patch;
}

/**
 * Every binding form the patch sets, with the value each replaces, or the
 * first leaf that is not a form, or that names a parameter the step does not
 * have. An object that is not a form is a path to forms below it, and has to
 * be an object the step already has. `shown` is the same place in what the
 * draft shows, when it has one: a key there and not in `existing` is the
 * control the step acted on.
 */
function collectBindLeaves(patch: JsonObject, existing: JsonObject, shown: JsonObject | undefined, path: string[], leaves: BindLeaf[]): BindRefusal | undefined {
  for (const [key, value] of Object.entries(patch)) {
    const at = [...path, key];
    const parameter = at.join(".");
    const has = Object.hasOwn(existing, key);
    const newKey = (): BindRefusal => ({ ok: false, reason: "bind_new_key", parameter, ...(shown !== undefined && Object.hasOwn(shown, key) ? { control: true as const } : {}) });
    if (automationStudioFlowDraftIsBindingForm(value)) {
      if (!has) return newKey();
      leaves.push({ path: at, form: value, replaced: existing[key]! });
      continue;
    }
    if (!isObject(value) || Object.hasOwn(value, "$state") || !Object.keys(value).length) return { ok: false, reason: "bind_not_a_binding", parameter };
    if (!has) return newKey();
    const below = existing[key];
    if (!isObject(below) || Object.hasOwn(below, "$state")) return { ok: false, reason: "bind_not_a_binding", parameter };
    const shownBelow = shown?.[key];
    const problem = collectBindLeaves(value, below, isObject(shownBelow) ? shownBelow : undefined, at, leaves);
    if (problem) return problem;
  }
  return undefined;
}

/** The test value a Flow input takes from the value it replaces: that value, or the test of an input already bound there. */
function replacedTest(replaced: JsonValue): JsonValue | undefined {
  if (replaced === null) return undefined;
  const stored = automationStudioFlowDraftStoredBindingKind(replaced);
  if (stored) return stored.kind === "input" ? stored.test : undefined;
  return automationStudioFlowDraftHoldsBinding(replaced) ? undefined : replaced;
}

/** Whether a step is inside a span some step repeats: that step, through the one it names as `through`. */
function insideRepeat(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): boolean {
  const at = steps.indexOf(step);
  return steps.some((first, start) => {
    if (first.routing?.kind !== "repeat") return false;
    const through = first.routing.through;
    const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
    return at === start || (end >= start && at >= start && at <= end);
  });
}

/** Where a step's parameters are kept in one of its arguments, made when it has none yet. */
function containerOf(argument: JsonObject, nested: boolean): JsonObject {
  if (!nested) return argument;
  if (!isObject(argument[PARAMETERS_KEY])) argument[PARAMETERS_KEY] = {};
  return argument[PARAMETERS_KEY] as JsonObject;
}

function valueAt(root: JsonObject, path: readonly string[]): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const key of path) value = isObject(value) ? value[key] : undefined;
  return value;
}

function setAt(root: JsonObject, path: readonly string[], value: JsonValue): void {
  let target = root;
  for (const key of path.slice(0, -1)) {
    if (!isObject(target[key])) target[key] = {};
    target = target[key] as JsonObject;
  }
  target[path[path.length - 1]!] = structuredClone(value);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
