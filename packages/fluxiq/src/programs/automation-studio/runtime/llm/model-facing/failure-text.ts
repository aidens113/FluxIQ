// What of a failure's own `expected` and `actual` the model may read (t426).
//
// A failure record's `expected` and `actual` are sentences its producer wrote,
// and the web domain writes how it looked for the step's control into them:
// paid run R4a's typing step stopped with "an element matching selector
// #fb1l6ufkg, element fingerprint" and "nothing matched; 3 control(s) of the
// same family are on the page; best scored 0.27". Both reached the model
// verbatim, in the trial feedback and the repair context, and the model read
// them as a fault of its own to fix: it went looking for a new handle.
//
// Finding a saved control is the extension's work, never the model's (user,
// 2026-10-10): every saved element carries a full fingerprint, and "the LLM
// model shouldnt have to worry about any of that, that's all handled by
// extension". The model names an element by its handle and nothing else. So
// nothing it reads may say how a control was found: no locator, no `#id` or
// `.class` token, no match score, and none of the words that name the finding
// itself. Developer detail stays where it was -- the failure record in the
// trace, the run log and the step folders are unchanged -- and this is applied
// only on the way to a model.
//
// **Two rules, one fail-closed.**
// - A failure in a category about finding the step's target
//   (`target_not_found`, `target_ambiguous`) carries neither text: whatever a
//   producer writes there describes how it looked for the saved target. The
//   model is told what happened in Core's own words for the category, with the
//   control's words, by whoever builds its feedback.
// - Any other failure keeps each text that trips none of the shapes below, and
//   drops each one that does, whole. A dropped text costs the model one line of
//   context; a text rewritten around a hole would still read as an address.
//
// Domain-neutral on purpose: the categories are Core's, and the shapes are
// strings Core screens, not fields it reads (the web-vocabulary rule counts
// names, never data).

import { automationStudioLocatorShapedText } from "../harness/index.ts";

/** Categories whose texts describe how the producer looked for the step's saved target (header). */
const TARGET_CATEGORIES: ReadonlySet<string> = new Set(["target_not_found", "target_ambiguous"]);

/** Words that name how a control is found, in any inflection the producers write. */
const FINDING_WORDS = /\b(?:selectors?|fingerprint(?:s|ed)?|address(?:es|ed|ing)?|re-?address\w*|scor(?:e|es|ed|ing))\b/iu;

/**
 * A match score: a number from -1 to 1 written with two or more decimals, the
 * way every producer writes one (`0.27`, `-0.29`, `(1.00)`). One beside a
 * currency sign, or inside a longer number, is not one.
 */
const MATCH_SCORE = /(?<![\w$€£¥.,])-?[01]\.\d{2,}(?![\w.])/u;

/**
 * The failure's `expected` and `actual` as the model may read them: none for a
 * failure about finding the target, and otherwise each one only when nothing in
 * it says how a control was found (header).
 */
export function automationStudioModelFacingFailureText(failure: { category: string; expected?: string | undefined; actual?: string | undefined }): { expected?: string; actual?: string } {
  if (TARGET_CATEGORIES.has(failure.category)) return {};
  const { expected, actual } = failure;
  return {
    ...(expected !== undefined && sayable(expected) ? { expected } : {}),
    ...(actual !== undefined && sayable(actual) ? { actual } : {})
  };
}

function sayable(text: string): boolean {
  return text.trim() !== "" && !automationStudioLocatorShapedText(text) && !FINDING_WORDS.test(text) && !MATCH_SCORE.test(text);
}
