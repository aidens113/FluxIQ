// How a request, a row label and a judge's reply are read into words, so the
// three can be compared: case- and plural-insensitive, punctuation dropped.
//
// A segment ends at sentence or list punctuation, so a phrase never runs from
// one clause into the next: the request's "charging cases, list each pair" is
// not the phrase "cases list", and a label's "Wireless Earbuds, Bluetooth" is
// not "earbuds bluetooth". A decimal point ends one too, which only costs a
// phrase made of digits, and those are never phrases here (`request-phrases.ts`).

/** One word: as compared, as written, and the segment it sits in. */
export type AutomationStudioRequestRowWord = { word: string; raw: string; segment: number };

/** What ends a segment. */
const SEGMENT_BREAK = /[.,;:!?()[\]{}"“”|\n\r\t]+/u;
/** What separates words inside a segment. */
const WORD_BREAK = /[^\p{L}\p{N}]+/u;
/** A run of letters and digits, the shape of an id. */
const ID_RUN = /[\p{L}\p{N}]+/gu;
/** The shortest id a reply may name a row by (live run `run-muw60j7c-bb7c9a62`: `B0J5MCMBAY`). */
const ID_MIN_LENGTH = 6;

/**
 * The words of a text, lower-cased and singular (`earbuds` and `earbud` are
 * one word), each with the segment it sits in. An apostrophe joins rather than
 * splits, so "store's" is one word.
 */
export function automationStudioRequestRowWords(text: string): AutomationStudioRequestRowWord[] {
  const words: AutomationStudioRequestRowWord[] = [];
  text.replace(/['’]/gu, "").split(SEGMENT_BREAK).forEach((segment, index) => {
    for (const raw of segment.split(WORD_BREAK)) {
      if (raw) words.push({ word: singular(raw.toLowerCase()), raw, segment: index });
    }
  });
  return words;
}

/**
 * The ids a text names: runs of letters and digits, at least six long, holding
 * both, upper-cased. A product's catalogue number is one (`B0J5MCMBAY`), a word
 * like "Bluetooth" is not, and neither is a price.
 */
export function automationStudioRequestRowIds(text: string): string[] {
  return [...new Set((text.match(ID_RUN) ?? [])
    .filter((run) => run.length >= ID_MIN_LENGTH && /\p{L}/u.test(run) && /\p{N}/u.test(run))
    .map((run) => run.toUpperCase()))];
}

/** A plural's singular, by its last letter: enough to make "cases" "case" on both sides of a comparison. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}
