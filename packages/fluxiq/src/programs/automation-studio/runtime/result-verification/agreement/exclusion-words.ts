import type { AutomationStudioRequestWording } from "../request-rows/index.ts";

/**
 * What a split's no asked again is told (header, t515): Core's words and the
 * advice's own exclusions, naming no site or task. A kept row may still be
 * answered no by the words of the request naming what it asks for, which the
 * row is not (t628): narrowing to the request's own item excludes nothing the
 * request does not say.
 */
export function exclusionRecheckWords(exclusions: readonly string[]): string {
  return "This same evidence was judged before, and that answer advised leaving out rows by words the request never states as an exclusion: "
    + `${quotedExclusions(exclusions)}. `
    + "A request excludes only what its own words state; the words it searches or navigates by say where to look and exclude nothing. "
    + "Answer again from the evidence, and answer no over a row the result keeps only where you quote words of the request that it fails: "
    + "words that exclude it, or the words naming what the request asks for, which that row by its own words is not.";
}

function quotedExclusions(exclusions: readonly string[]): string {
  return exclusions.map((exclusion) => `"${exclusion}"`).join(", ");
}

/**
 * A split's no's advice, labelled as adding an exclusion the request never
 * states (header, t515), as t501 labels a reading: its call, Core's words and
 * the exclusions, then the advice in its own words, unchanged.
 */
export function markedAdvice(unstated: { call: 1 | 2; exclusions: readonly string[] }, advice: string, reasked: boolean): string {
  const again = reasked ? "; asked once more with this named, it advised the same" : "";
  return `Judge call ${unstated.call} (Core's check: this advice adds an exclusion the request never states, ${quotedExclusions(unstated.exclusions)}, and a request excludes only what its own words state, so do not add it unless the request's words say so${again}): ${advice}`;
}

/** Where an advice lists values: after these words, up to the end of the sentence. */
const LIST_LEAD = /\b(?:one of|any of|among|either)\s*:?\s+([^.;\n]+)/giu;
const QUOTED = /["“]([^"”]{1,80})["”]/gu;
const LISTED_NOTE = "Core's note: this advice lists values the request does not say. These values are what the page shows today; where each row itself shows what makes it one the request asks for, test that instead of listing today's values. This is advice to weigh, not a rule.";

/**
 * A judge's `changed` advice, with a note appended where it proposes a list of
 * literal values the request never says (t785, F3 of run `run-mvskodlp-9966d618`,
 * whose advice became the condition). As `markedAdvice` labels advice that adds
 * an unstated exclusion: the advice stays in its own words, never dropped, and a
 * request that says its values gets no note. Two values at least make a list; a
 * value is a quoted text or an item after "one of", "any of", "among" or "either".
 */
export function listedValuesAdvice(advice: string, wording: AutomationStudioRequestWording | undefined): string {
  if (!wording || !advice) return advice;
  const listed = new Set<string>();
  for (const found of advice.matchAll(LIST_LEAD)) {
    for (const item of found[1]!.split(/,|\bor\b|\band\b/iu)) {
      const value = item.replace(/^[\s"“'‘]+|[\s"”'’]+$/gu, "");
      if (value) listed.add(value);
    }
  }
  for (const found of advice.matchAll(QUOTED)) listed.add(found[1]!.trim());
  const values = [...listed];
  if (values.length < 2 || !values.some((value) => !wording.says(value))) return advice;
  return `${advice} (${LISTED_NOTE})`;
}
