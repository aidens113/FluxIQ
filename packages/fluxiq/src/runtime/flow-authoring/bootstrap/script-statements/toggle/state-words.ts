// Whether two writings of a step name one control, seen in its two states (t792).
//
// A control that shows its state by its own words changes them when it is
// pressed: "Like" becomes "Unlike", "Save" becomes "Saved", "Follow" becomes
// "Following". A step is written from what a look showed, so a repair that
// looked after the trial's press names the control by its other state's words.
// Compared whole, those parameters are another step's, the trial's toggle is
// tied to nothing, and the repaired step flips the control back: the bug the
// identity tie exists to stop (`./toggle-tie.ts`).
//
// The toggle's own signature says which words those are. A signature that
// carries the words the press gained and lost (`gains`, `loses`: lists of
// words) is read for exactly that, and for nothing else; a signature without
// them names no words, and the writings must be equal. Two writings are the
// same control in its two states when they have the same shape -- the same
// keys, lists of the same length -- and every value is equal, except text
// whose words differ only by words of that one signature: compared lower case,
// split on anything that is not a letter or a digit, in any order. A list of
// words (a control's class list) may differ the same way in its length. Text
// that differs by any other word, or by the words of another toggle's
// signature, is another control. No word list is Core's own: the words are
// the ones the domain recorded for this press. Pure.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** Whether `a` and `b` are one writing of a control, up to the words `signature` says its two states differ by (header). */
export function automationStudioToggleSameAcrossStates(a: JsonValue, b: JsonValue, signature: JsonObject): boolean {
  const words = stateWords(signature);
  return words !== undefined && same(a, b, words);
}

/** The words the press gained and lost, lower case; none where the signature carries no such lists (header). */
function stateWords(signature: JsonObject): ReadonlySet<string> | undefined {
  const lists = [signature.gains, signature.loses];
  if (!lists.every((list) => Array.isArray(list) && list.every((word) => typeof word === "string"))) return undefined;
  const words = new Set((lists as string[][]).flat().flatMap(wordsOf));
  return words.size ? words : undefined;
}

function same(a: JsonValue, b: JsonValue, words: ReadonlySet<string>): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b || differsOnlyBy(wordsOf(a), wordsOf(b), words);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length && a.every((value, index) => same(value, b[index]!, words))) return true;
    return isWordList(a) && isWordList(b) && differsOnlyBy(a.flatMap(wordsOf), b.flatMap(wordsOf), words);
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && same(a[key]!, b[key]!, words));
  }
  return a === b;
}

/** Whether two texts' words differ, and only by the signature's words (header). */
function differsOnlyBy(a: readonly string[], b: readonly string[], words: ReadonlySet<string>): boolean {
  const left = new Set(a), right = new Set(b);
  const differing = [...left].filter((word) => !right.has(word)).concat([...right].filter((word) => !left.has(word)));
  return differing.length > 0 && differing.every((word) => words.has(word));
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
}

function isWordList(value: readonly JsonValue[]): value is string[] {
  return value.every((item) => typeof item === "string");
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
