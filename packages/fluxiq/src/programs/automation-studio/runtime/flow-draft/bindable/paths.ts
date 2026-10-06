// What a kept step offers `bind`: the paths under its parameters at which the
// input the draft shows and the argument the step runs with hold the same
// value.
//
// A step's `input` is the model-safe tool argument it was written with, and
// `ranWith` is what it runs with, which a domain may have resolved: a Web click
// written with a `target` handle runs with a selector and an element identity
// instead, which are private and never shown. `bind` checks `ranWith`
// (`../amendment/bind.ts`), so a model reading only the shown input bound a
// `target` the click never ran with -- five times in live run B7 (t262,
// decisions 0019-0055) -- and was told to name a parameter the draft shows.
//
// The list is read from the shown input and kept only where the argument run
// holds the same value at the same path, so nothing private is ever named and
// no shown alias is mapped to what it resolved to. It is an affordance: `bind`
// still decides, and may accept a path not listed here. A value already bound
// is one path; nothing inside a binding, an array or a null is listed.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftHoldsBinding, automationStudioFlowDraftStoredBindingKind } from "../binding-forms.ts";

/** The key a node call's argument holds its parameters under (`../amendment/bind.ts`). */
const PARAMETERS_KEY = "parameters";

/** The keys that make an object one binding rather than a path to values inside it. */
const BINDING_KEYS = ["$state", "$input", "$row", "$step"] as const;

/**
 * The dotted parameter paths a kept step offers `bind`, in the shown input's
 * order: every value the shown input and the argument the step runs with
 * (`ranWith`, else `input`) hold alike, under `parameters` when the argument
 * keeps them there.
 */
export function automationStudioFlowDraftBindablePaths(step: { input: JsonObject; ranWith?: JsonObject | undefined }): string[] {
  const current = step.ranWith ?? step.input;
  const nested = isObject(current[PARAMETERS_KEY]);
  const shown = nested ? step.input[PARAMETERS_KEY] : step.input;
  const runnable = nested ? current[PARAMETERS_KEY] : current;
  if (!isObject(shown) || !isObject(runnable)) return [];
  const paths: string[] = [];
  collect(shown, runnable, [], paths);
  return paths;
}

function collect(shown: JsonObject, runnable: JsonObject, prefix: string[], paths: string[]): void {
  for (const [key, value] of Object.entries(shown)) {
    if (!Object.hasOwn(runnable, key)) continue;
    const ran = runnable[key]!;
    const path = [...prefix, key];
    // A value holding a binding somewhere inside is offered only when it is one stored binding.
    if (value !== null && same(value, ran) && (!automationStudioFlowDraftHoldsBinding(value) || automationStudioFlowDraftStoredBindingKind(value) !== undefined)) paths.push(path.join("."));
    if (isObject(value) && isObject(ran) && !BINDING_KEYS.some((binding) => Object.hasOwn(value, binding))) collect(value, ran, path, paths);
  }
}

function same(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]!));
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key]!, right[key]!));
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
