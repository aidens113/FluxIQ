// The one screen for a sentence a model may read about a control: it says
// nothing about how that control was found (t426, t431).
//
// A failure's own `expected`/`actual` (`./failure-text.ts`) and a control's
// own words (`./control-words.ts`) both reach the model, and both are text a
// domain wrote. Finding a saved control is the extension's work, never the
// model's (user, 2026-10-10), so a text that carries a locator, a `#id` or
// `.class` token, a match score, or a word that names the finding itself is
// not sayable. It is dropped whole: a text rewritten around a hole would still
// read as an address.
//
// Domain-neutral on purpose: the shapes are strings Core screens, not fields
// it reads (the web-vocabulary rule counts names, never data).

import { automationStudioLocatorShapedText } from "../harness/locator-text.ts";

/** Words that name how a control is found, in any inflection the producers write. */
const FINDING_WORDS = /\b(?:selectors?|fingerprint(?:s|ed)?|address(?:es|ed|ing)?|re-?address\w*|scor(?:e|es|ed|ing))\b/iu;

/**
 * A match score: a number from -1 to 1 written with two or more decimals, the
 * way every producer writes one (`0.27`, `-0.29`, `(1.00)`). One beside a
 * currency sign, or inside a longer number, is not one.
 */
const MATCH_SCORE = /(?<![\w$€£¥.,])-?[01]\.\d{2,}(?![\w.])/u;

/** Whether a model may read `text`: something is in it, and nothing in it says how a control was found (header). */
export function automationStudioModelFacingSayableText(text: string): boolean {
  return text.trim() !== "" && !automationStudioLocatorShapedText(text) && !FINDING_WORDS.test(text) && !MATCH_SCORE.test(text);
}
