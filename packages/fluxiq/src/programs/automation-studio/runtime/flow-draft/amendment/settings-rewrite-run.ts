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
//
// **An `input` is held to the same rule where the change takes none.** Only
// `rerun` (a patch over what the step ran with) and `bind` (the parameters to
// lift) read an amendment's `input`; every other change dropped it unsaid. Live
// run `run-muxkzdjw-31a13429` (lane A round 4, decision 0029) sent
// `{"step":13,"change":"add","act":"a1.quantity","input":{"node":"web.output.dom-type",
// "parameters":{"target":{"handle":"t964"},"text":"3"}}}` about the press of
// "Get coupons" that collected the coupon: the model meant "add the quantity
// step", was answered "applied", and the coupon press claimed the quantity. An
// `input` naming another node, or giving a parameter the step ran with another
// value, written out or as a patch, is refused whole the same way; one that
// repeats what the step ran with says nothing new and passes.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** The key a node call's argument holds its parameters under. */
const PARAMETERS_KEY = "parameters";

/** The key a node call's argument names its node under. */
const NODE_KEY = "node";

/**
 * Whether `settings` -- or `input`, given only for a change that takes none
 * (not `rerun` or `bind`) -- would make the step another action, or give a
 * parameter the step ran with a value it did not run with.
 */
export function automationStudioFlowDraftSettingsRewriteRun(step: AutomationStudioFlowDraftStep, settings: JsonObject | undefined, input?: JsonObject | undefined): boolean {
  return rewritesParameters(step, settings) || (input !== undefined && (namesAnotherNode(step, input) || rewritesParameters(step, parametersOf(input))));
}

/** Whether `input` names a node other than the one the step ran. */
function namesAnotherNode(step: AutomationStudioFlowDraftStep, input: JsonObject): boolean {
  const node = input[NODE_KEY];
  return typeof node === "string" && node !== step.actionId && node !== step.input[NODE_KEY];
}

/** Whether `settings` would give a parameter the step ran with a value it did not run with. */
function rewritesParameters(step: AutomationStudioFlowDraftStep, settings: JsonObject | undefined): boolean {
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
