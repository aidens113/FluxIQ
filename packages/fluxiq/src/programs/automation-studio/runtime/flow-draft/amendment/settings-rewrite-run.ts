// An amendment's `settings` never rewrite what a step ran with.
//
// **The failure this closes.** Live run `run-mux74k5q-1c3c2127` (C1, decision
// 0025) sent `{"step":12,"change":"add","act":"a1.quantity","settings":{"target":
// {"handle":"t964"}}}` about a press of the Spain chip (t958). Settings were
// merged over the step unchecked, and the Flow is written with them over the
// parameters the step ran with (`../../llm/node-tools/draft-step.ts`), so the
// Flow would have pressed the quantity field -- a step nobody ran, carrying an
// act nobody did, proved by the run of another control.
//
// **The rule.** A step is what it ran with. A settings key the step ran with,
// given a value other than the one it ran with, is a different step, and the
// amendment carrying it is refused whole (`settings_rewrite_run`): neither its
// disposition nor its act is applied. "Ran with" is the parameters of what it
// ran with (`ranWith`) and of what it was shown with (`input`), under
// `parameters` where the argument keeps them there: a press shown by a handle
// runs as a selector, and its `target` is still the control it acted on. A key
// given the value either holds says nothing new and passes. Keys the step did
// not run with -- an expected state, a timeout, a wait condition -- apply as
// before. Checked once, in `./apply.ts`, before an amendment changes anything,
// so it covers every place this directory merges settings: `./apply.ts`,
// `./move.ts`, `./bind.ts` and `./route.ts`.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** The key a node call's argument holds its parameters under. */
const PARAMETERS_KEY = "parameters";

/** Whether `settings` would give a parameter the step ran with a value it did not run with. */
export function automationStudioFlowDraftSettingsRewriteRun(step: AutomationStudioFlowDraftStep, settings: JsonObject | undefined): boolean {
  if (!settings) return false;
  const ranWith = [parametersOf(step.ranWith), parametersOf(step.input)].filter((value): value is JsonObject => value !== undefined);
  return Object.entries(settings).some(([key, value]) => {
    const held = ranWith.filter((parameters) => Object.hasOwn(parameters, key));
    return held.length > 0 && !held.some((parameters) => sameValue(parameters[key]!, value));
  });
}

/** Where an argument keeps its parameters: under `parameters` when it nests them, else the argument itself. */
function parametersOf(argument: JsonObject | undefined): JsonObject | undefined {
  if (!argument) return undefined;
  const nested = argument[PARAMETERS_KEY];
  return isObject(nested) ? nested : argument;
}

/** Structural equality of two JSON values, whatever order their keys were written in. */
function sameValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => sameValue(entry, right[index]!));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key]!, right[key]!));
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
