// The screen for a control's own words, the page's own name for it (t748).
//
// A control's words come from the page: its accessible name, visible text,
// label or placeholder (`./control-words.ts`). The user's rule (2026-10-10) is
// that the model never sees how a control is found, and that naming a control
// by its own words is fine. So a control's words are no words only where they
// carry what finding is written in: a locator, a `#id` or `.class` token, a
// match score, or a word that only ever names the finding (selector,
// fingerprint). Ordinary page words that the failure-text screen also drops
// as finding talk ("address", "score": `./sayable-text.ts`) stay: rerun
// round 3's checkout confirm button, whose words held "address", was named by
// nothing in every trial's feedback and act words.
//
// Domain-neutral on purpose: the shapes are strings Core screens, not fields
// it reads (the web-vocabulary rule counts names, never data).

import { automationStudioLocatorShapedText } from "../harness/locator-text.ts";

/** Words that only ever name how a control is found, never an ordinary control's words. */
const FINDING_ONLY_WORDS = /\b(?:selectors?|fingerprint(?:s|ed)?)\b/iu;

/**
 * A match score: a number from -1 to 1 written with two or more decimals, the
 * way every producer writes one (`0.27`, `-0.29`, `(1.00)`). One beside a
 * currency sign, or inside a longer number, is not one.
 */
const MATCH_SCORE = /(?<![\w$€£¥.,])-?[01]\.\d{2,}(?![\w.])/u;

/** Whether a model may read `text` as a control's own words: something is in it, and nothing in it is how a control is found (header). */
export function automationStudioModelFacingControlText(text: string): boolean {
  return text.trim() !== "" && !automationStudioLocatorShapedText(text) && !FINDING_ONLY_WORDS.test(text) && !MATCH_SCORE.test(text);
}
