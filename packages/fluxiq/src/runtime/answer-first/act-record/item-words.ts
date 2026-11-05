// The item an act was on, in the few words that tell it apart, for the act's line.
//
// A press says which item of a list it acted on, in the words the page printed under that item
// (`evidence.actedOnItem`, or the sentence `evidence.actedOn`): `item 3/8 (£60, Round pine dining
// table, 90cm, Kelford)`. "Save. Save. Save." names no listing; "Save: Round pine dining table,
// 90cm" does. The row's own words are hashed in the record and kept nowhere in the clear for ties
// (`./row-ties.ts`); this is only the short line a person reads, put through the same word check as
// every other line of an act (`./words.ts`), and never anything the model wrote.
//
// Only a press inside a list says this: a press on an item's own page has no list item to name, and
// `./item-names.ts` says what stands in for it.

import { automationStudioAttemptActCutItemWords } from "./cut-words.ts";

/** `item 3/8 (words)` or `row 3 (words)`, alone or inside the sentence `webNodeActedOn` says. */
const ITEM = /(?:^|\bacted on )(?:item \d+\/\d+|row \d+) \((.*)\)(?: only\b.*)?$/su;

/** The words of the item an act was on, or `undefined` when its sentence names a place and no words. */
export function automationStudioAttemptActItemWords(actedOn: string | undefined): string | undefined {
  const inside = actedOn === undefined ? undefined : ITEM.exec(actedOn.replace(/\s+/gu, " ").trim())?.[1];
  if (inside === undefined) return undefined;
  // A leading price or count tells nothing of which listing it is: start at the first segment with a word in it.
  const segments = inside.split(", ").map((segment) => segment.trim()).filter((segment) => segment !== "");
  const first = segments.findIndex((segment) => /\p{L}{2}/u.test(segment));
  if (first < 0) return undefined;
  return automationStudioAttemptActCutItemWords(segments.slice(first).join(", "));
}
