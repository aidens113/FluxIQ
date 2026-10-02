// The words of the control a draft step acted on, as a step may carry them.
//
// **Why a step carries them at all.** A step's `input` names a control by the
// token the caller minted for it -- a handle, on the web -- and a token says
// nothing once the page it named is gone. Live run `run-muqiho5c-e830ce01`
// pressed "Not now" (t1082), was told so on the call's own result, and six
// decisions later added that step as its "put three in my cart" act, believing
// it was Add to cart: the draft it reads every decision showed only
// `input: {target: {handle: "t1082"}}`. It completed, and the cart was empty.
//
// **They are page text**, so they cross the evidence boundary the way the
// permission gate lets a control's name cross it
// (`../action-permissions/gate.ts`): carried only when the model was already
// shown them -- here, in the very call's own evidence -- plain, with nothing
// markup could hide in, and bounded. Anything else is withheld rather than
// refused: the call happened either way, and losing its result over the words
// that describe it would throw away the step they were meant to name.
//
// They are a description of the step and never a parameter of it: the Flow is
// written from `input`, `ranWith` and `settings` (`../llm/node-tools/draft-step.ts`).

import type { JsonValue } from "../../../../core/index.ts";

/** The longest the words may be, as the gate bounds a control's name. Past it they are cut, never widened. */
const MAX_WORDS = 120;
/** How deep the call's evidence is searched for them; deeper strings are not looked at. */
const MAX_DEPTH = 32;

/**
 * The control's words as a draft step may carry them, or nothing when they
 * may not travel: not a string, empty, not plain text, or never shown in
 * `evidence`, the evidence of the call that declared them.
 */
export function automationStudioFlowDraftControlWords(value: unknown, evidence: JsonValue): string | undefined {
  if (typeof value !== "string") return undefined;
  const words = normalised(value);
  if (!words || /[\u0000-\u001f\u007f<>]/u.test(words)) return undefined;
  // Found whole before it is cut: a long name only partly shown is no proof the rest was.
  if (!shownIn(evidence, words)) return undefined;
  return words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS - 3).trimEnd()}...` : words;
}

/** Whether any string of the evidence holds the words, whitespace collapsed on both sides. */
function shownIn(evidence: JsonValue, words: string): boolean {
  const pending: Array<{ value: JsonValue; depth: number }> = [{ value: evidence, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (typeof value === "string") {
      if (value.includes(words) || normalised(value).includes(words)) return true;
      continue;
    }
    if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) continue;
    for (const item of Array.isArray(value) ? value : Object.values(value)) pending.push({ value: item as JsonValue, depth: depth + 1 });
  }
  return false;
}

function normalised(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
