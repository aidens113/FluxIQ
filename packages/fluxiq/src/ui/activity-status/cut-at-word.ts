// A sentence cut to a bound where a word ends, never inside one.
//
// The status a person reads is bounded twice -- the background keeps at most
// 160 characters of Core's sentence (`background/activity/pacer.ts`), and the
// overlay at most as many as its card holds (`content/activity-overlay/`) --
// and a cut by count lands inside a word: "Search Bri…", "trying another w…",
// "the check found the…" for "they" (U-4 of the run-muw60j7c-bb7c9a62 UI
// review). A word cut in two reads as a different word, or none.
//
// So the cut falls after the last whole word that fits with the ellipsis. A
// comma, colon or dash left hanging at the end is dropped ("rows,…" reads as
// "rows…"), and a quote the cut leaves open is closed after the ellipsis, so a
// name reads as cut rather than as a shorter name ("into “Search…”"). One
// word longer than the bound has no word end to cut at; it is cut where the
// bound falls. Pure: no DOM.

import { longestWordCut } from "./word-cut.ts";

const ELLIPSIS = "…";

/** `text` when it is at most `max` characters, else its longest run of whole words that fits with an ellipsis. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  return longestWordCut(text, (candidate) => candidate.length <= max) ?? `${text.slice(0, Math.max(max - 1, 0))}${ELLIPSIS}`;
}
