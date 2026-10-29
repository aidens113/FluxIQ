// The words a condition tests by, read from the way its sender says it
// (debug of `run-mvtdoyf3-47ffaac1`, F1): what the request's words are held
// against to tell whether a condition is the request's
// (`../computed-facts/left-out-accounted.ts`), and whether a quote is one
// condition's reason or another's (`unquoted-rows.ts`).
//
// **What counts.** A run's condition is worded as the Flow authored it
// (`../read-account/condition.ts`): its subject (a column, an attribute, the
// item's text), the value its own read found on a row it kept where it says one
// (`(read "..." on a row it kept)`), then its relations and the text or number
// each compares. Every word of the subject, of that value and of the compared
// texts is a word it tests by, and so is every number it writes. The words that
// only spell how it tests -- `is`, `present`, `not`, `contains`, `atLeast`, a
// lacking test's own note `(a row is kept only when it has no ...)`, a date
// bound's ` as a date` -- are not. A build test's replay names a condition by
// the field it tested alone (`../build-test/read-rows.ts`), so there the field
// is the only word known, and the words are not whole: what it compared is not
// said. Nothing here names a site; the words are the condition's own.

import type { AutomationStudioRequestRowsTest } from "../request-rows/index.ts";
import { automationStudioRequestRowWordCarries, automationStudioRequestRowWords } from "../request-rows/words.ts";

/** A lacking presence test's own note after its wording (`../read-account/condition.ts`). */
const LACKING_NOTE = / \(a row is kept only when it has no .*\)$/su;
/** A date bound's own suffix (`../read-account/condition.ts`, t790). */
const DATE_NOTE = / as a date$/u;
/** What a value or a wording that may not be said reads as. */
const WITHHELD = "(withheld)";
/**
 * Words, as compared (`words.ts`), that spell how a condition tests or what
 * kind of value it reads, never what it tests: its relations, as a grammar
 * spells them, and the kind words of a subject read for itself.
 */
const HOW_WORDS: ReadonlySet<string> = new Set([
  "is", "not", "present", "absent", "contain", "contains", "equal", "equals", "match", "matche", "matches", "startswith", "endswith",
  "atleast", "atmost", "lessthan", "greaterthan", "morethan", "fewerthan", "min", "max", "gt", "gte", "lt", "lte", "eq", "ne", "neq",
  "oneof", "in", "between", "before", "after", "attribute", "text", "and"
]);

/**
 * The words a condition tests by (header): `text`, those words as written,
 * one space between each; `numbers`, the numbers it writes; and `whole`, true
 * where its sender gave its wording, none of it withheld, so these are every
 * word it tests by, and false where only its field is known. Nothing where the
 * sender said neither a wording nor a field.
 */
export function automationStudioRequestConditionWords(test: AutomationStudioRequestRowsTest): { text: string; numbers: string[]; whole: boolean } | undefined {
  const wording = test.wording?.trim();
  if (wording) {
    const words = automationStudioRequestRowWords(wording.replace(LACKING_NOTE, "").replace(DATE_NOTE, ""));
    return {
      text: words.filter((word) => automationStudioRequestRowWordCarries(word.word) && !HOW_WORDS.has(word.word)).map((word) => word.raw).join(" "),
      numbers: [...new Set(words.filter((word) => /^\p{N}+$/u.test(word.word)).map((word) => word.word))],
      whole: !wording.includes(WITHHELD)
    };
  }
  const field = test.field?.trim();
  return field ? { text: automationStudioRequestRowWords(field).map((word) => word.raw).join(" "), numbers: [], whole: false } : undefined;
}
