// The one screen for a sentence a model may read about a control's failure: it
// says nothing about how that control was found (t426, t431).
//
// A failure's own `expected`/`actual` (`./failure-text.ts`) reach the model,
// and are text a domain wrote. Finding a saved control is the extension's
// work, never the model's (user, 2026-10-10), so a text that carries a
// locator, a `#id` or `.class` token, a match score, or a word that names the
// finding itself is not sayable. It is dropped whole: a text rewritten around
// a hole would still read as an address.
//
// A control's own words are the page's, and are screened only for what
// finding is written in (`./control-text.ts`, t748). This screen is that one
// plus the ordinary words finding talk uses ("address", "score"), which a
// failure's text uses for the finding and a page uses for anything.
//
// Domain-neutral on purpose: the shapes are strings Core screens, not fields
// it reads (the web-vocabulary rule counts names, never data).

import { automationStudioModelFacingControlText } from "./control-text.ts";

/** Ordinary words finding talk uses, beside the finding-only ones `./control-text.ts` screens, in any inflection the producers write. */
const FINDING_WORDS = /\b(?:address(?:es|ed|ing)?|re-?address\w*|scor(?:e|es|ed|ing))\b/iu;

/** Whether a model may read `text`: something is in it, and nothing in it says how a control was found (header). */
export function automationStudioModelFacingSayableText(text: string): boolean {
  return automationStudioModelFacingControlText(text) && !FINDING_WORDS.test(text);
}
