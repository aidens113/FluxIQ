// The values an advice lists (t785), the one reading `../agreement/exclusion-words.ts`
// notes advice by and the trial's mark suggestion reads back (t790, run
// `run-mvswewhy-e4e469d4`, `../../service/candidate-trial/row-mark.ts`). A value
// is an item after "one of", "any of", "among" or "either", up to the end of
// the sentence, or a quoted text.

/** Where an advice lists values: after these words, up to the end of the sentence. */
const LIST_LEAD = /\b(?:one of|any of|among|either)\s*:?\s+([^.;\n]+)/giu;
const QUOTED = /["“]([^"”]{1,80})["”]/gu;

/** Every value an advice lists, each once, in the order it lists them. */
export function automationStudioResultAdviceListedValues(advice: string): string[] {
  const listed = new Set<string>();
  for (const found of advice.matchAll(LIST_LEAD)) {
    for (const item of found[1]!.split(/,|\bor\b|\band\b/iu)) {
      const value = item.replace(/^[\s"“'‘]+|[\s"”'’]+$/gu, "");
      if (value) listed.add(value);
    }
  }
  for (const found of advice.matchAll(QUOTED)) listed.add(found[1]!.trim());
  return [...listed];
}
