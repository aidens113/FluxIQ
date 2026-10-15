// A no's claim that a stored row is a kind of thing the request excludes, where
// the row's own words say it is the item asked for (t607).
//
// **Why.** A8 everything-store `run-mv8p0p7c-c8412344`, whole test 2: beside
// calling two listings one, both judges called the second -- the item asked
// for, its name saying "... with" a part the request excludes -- an excluded
// part. The judge's standing instruction already says an item sold with or
// including an excluded part is still the item, and Core already reads labels
// that way for the rows a condition left out
// (`../request-rows/left-out-naming-the-item.ts`).
//
// **What Core measures, and only that.** The request phrase every stored row
// names first is the item. A sentence that calls a named stored row excluded by
// the request, an accessory, or a row that should not be listed, and mentions a
// phrase of the request that row's label names only after the item, is
// refuted when every named stored row's label names the item first: by its own
// words the row is the item, said with something else. Core states the word
// order it read; whether the request excludes the row stays the judge's to say
// on the re-ask. A row whose label names another phrase first, a phrase the
// sentence does not mention, or a row Core cannot find is not refuted.

import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows, AutomationStudioResultNoRecord } from "./types.ts";
import { automationStudioRequestRowWords } from "../request-rows/index.ts";

/** Words that call a row a kind of thing the request leaves out. Generic, never any site's. */
const EXCLUDED_KIND = /\b(?:request|instructions?|task|user)\s+(?:explicitly\s+|also\s+|clearly\s+)?(?:excludes?|rules?\s+out)\b|\bexcluded\s+by\s+the\s+(?:request|instructions?)\b|\baccessor(?:y|ies)\b|\bshould(?:\s+not|n['’]t)\s+be\s+(?:listed|included|kept|stored|there)\b|\bshould\s+(?:be\s+)?(?:left\s+out|excluded|removed|dropped)\b/iu;

/** The claim a sentence makes that a named stored row is an excluded kind of thing (header); nothing where it makes none. */
export function automationStudioResultExcludedKindClaim(sentence: string, named: AutomationStudioResultNoNamedRows, record: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  if (!EXCLUDED_KIND.test(sentence) || !named.stored.length) return undefined;
  const { phrases, item } = record;
  if (!phrases || !item || named.unmatched) return { refuted: false };
  const words = automationStudioRequestRowWords(sentence).map((word) => word.word);
  const findings: string[] = [];
  for (const label of new Set(named.stored.map((row) => row.label))) {
    const [first, ...after] = phrases.phrasesOf(label);
    if (!first || !startsWith(first.words, item)) return { refuted: false };
    const mentioned = after.filter((phrase) => !startsWith(phrase.words, item) && contains(words, phrase.words));
    if (mentioned.length) findings.push(`"${label}" names "${phrases.said(item)}" first and ${mentioned.map((phrase) => `"${phrases.said(phrase.words)}"`).join(", ")} only after it.`);
  }
  return findings.length ? { refuted: true, finding: findings.join(" ") } : { refuted: false };
}

function startsWith(words: readonly string[], start: readonly string[]): boolean {
  return start.length <= words.length && start.every((word, index) => words[index] === word);
}

function contains(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}
