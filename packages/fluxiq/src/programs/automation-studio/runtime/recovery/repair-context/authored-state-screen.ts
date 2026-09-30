// What an author wrote into a Flow document, as much of it as can be said
// without saying what the person's data was.
//
// This is the second screen in this directory and it exists because the first
// one was not the whole story. `parameter-screen.ts` was tightened three times
// -- a credential screen, a locator screen, a length bound, and every value not
// carried named in `withheld` -- and each tightening made the *other* disclosure
// of the same object look worse by comparison. `runtime/recovery/context.ts`
// carries `expectedState` into `expected_transition` whole, and the only screen
// on it was the locator screen the whole context passes. So a credential
// authored into an `expectedState` condition was refused by the parameter screen
// and printed three sections above it, in the very same request, while
// `parametersWithheld` named it as withheld. The tightened path was never the
// exposure. The loose one beside it was.
//
// **What the two screens agree on, which is the point of this file.** No
// credential-shaped string travels. Whatever does not travel is named, by the
// same dotted path, so a reader comparing the two sections of one request
// compares two spellings of one string rather than reconciling two notations.
// Neither bounds a string's length, a collection's size or a key's length any
// more (2026-09-30, "the model sees the whole page"): an authored expectation is
// carried whole.
//
// **Why the whole object is not simply refused.** It is the document the model
// is being asked to repair. A repair told what failed and never what was
// supposed to happen is being asked to work blind, and
// `runtime/executor/expected-transition.ts` reads `expectedState` straight off
// `node.parameterValues`, so this is the authored Flow rather than a value some
// run resolved. Screening it keeps the evidence and removes the hazard;
// withdrawing it would remove both.
//
// **A refused value keeps its key with `null`**, as it does in the parameter
// screen and for the reason stated there: the shape of what the author wrote is
// the half that can always be given, and a condition list whose comparands were
// refused still tells a repair how many conditions there were and what relation
// each one asserted. The hazard that buys -- a model copying `expected: null`
// back into a patch -- is the hazard `step_parameters` already carries on the
// same request, and the withheld list is the answer to it: the list is how a
// screened value is told from an authored one. Naming is not decoration here; it
// is what makes the `null` honest.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/harness/index.ts";

/** An authored document value as the repair is shown it, with what did not survive named. */
export type AutomationStudioScreenedAuthoredState = {
  /** The authored object with every refused value replaced by `null`, its key kept. */
  value: JsonObject;
  /**
   * The dotted paths whose authored value is not in `value` as the Flow wrote
   * it, in the order they were met. Never the values themselves.
   *
   * Rooted at the caller's own name for the object, so the path names the same
   * position `parameter-screen.ts` names for the same value on the same node.
   *
   * **A list member is a dotted segment, not a bracketed index, and the reason is
   * measured rather than stylistic.** This record is carried inside a section, so
   * it passes the whole-context locator screen with everything else -- and
   * `expectedState.conditions[1].assert.expected` *is* locator-shaped: a `.`
   * after a `]` satisfies the class-selector shape's lookbehind, the redaction
   * leaves something that still trips the screen, and what reaches the model is
   * the string `[locator withheld]` where the path should be. The record would be
   * destroyed by the screen that was meant to protect it, which is the silent
   * drop this whole line of work exists to stop.
   * `expectedState.conditions.1.assert.expected` survives it intact, while a path
   * through an author's own locator-shaped key -- `expectedState.#confirm` -- is
   * still caught, which is the screen doing its job on a path rather than
   * mangling one.
   */
  withheld: string[];
};

/** A recursion guard, not a size bound: no authored expectation nests this deep. */
const MAX_AUTHORED_DEPTH = 64;

/**
 * Screens one authored document object.
 *
 * `rootPath` is what the caller calls the object, and it is the caller's to
 * choose because it is the caller's section the paths will be read in. Passing
 * the key the Flow authored it under is what makes the two screens' records
 * comparable.
 *
 * No `deniedKeys` argument, and that is deliberate rather than an omission. The
 * domain's declared keys are a rule about *keys*, and `selector` is one of them
 * -- the web domain's flat condition shape is `{ kind, expected, selector }`, so
 * enforcing the declaration here would refuse a condition for naming its own
 * subject. A locator's *value* is what must not travel, and the whole-context
 * locator screen in `context.ts` is what removes it. What is asked here is the
 * question a declaration cannot answer: whether the string is shaped like a
 * credential.
 */
export function automationStudioScreenedAuthoredState(authored: JsonObject, rootPath: string): AutomationStudioScreenedAuthoredState {
  const withheld: string[] = [];
  const value = screenedAuthoredObject(authored, withheld, rootPath, 0);
  return { value, withheld };
}

function screenedAuthoredObject(source: JsonObject, withheld: string[], prefix: string, depth: number): JsonObject {
  const screened: JsonObject = {};
  for (const [key, value] of Object.entries(source)) screened[key] = screenedAuthoredValue(value, withheld, `${prefix}.${key}`, depth);
  return screened;
}

/**
 * One authored value. A number and a boolean are what the author wrote and hold
 * no page and no person, so they are carried whole; structure is walked; only a
 * string is screened, because a string is the only place in a condition where a
 * credential or a paragraph of page text can sit.
 *
 * The walk runs before the whole-context locator screen, which is the right
 * order rather than an accident: the credential check must see the text the
 * author wrote, and redacting a locator neither hides a credential nor creates
 * one.
 */
function screenedAuthoredValue(value: JsonValue, withheld: string[], path: string, depth: number): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : refused(withheld, path);
  if (typeof value === "string") return screenAutomationStudioLlmEvidence(value, []).secretShaped ? refused(withheld, path) : value;
  if (depth > MAX_AUTHORED_DEPTH) return refused(withheld, path);
  if (!Array.isArray(value)) return screenedAuthoredObject(value, withheld, path, depth + 1);
  return value.map((item, index) => screenedAuthoredValue(item, withheld, `${path}.${index}`, depth + 1));
}

function refused(withheld: string[], path: string): null {
  note(withheld, path);
  return null;
}

function note(withheld: string[], path: string): void {
  if (!withheld.includes(path)) withheld.push(path);
}
