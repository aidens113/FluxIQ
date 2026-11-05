// The page a press was made on, in the few words that name what is on it, for the act's line.
//
// A press on an item's own page is in no list, so its answer has no item to name and the call carries no row. Paid runs
// `run-mw3itjcy-ce4429f7` and `run-mw3if5xt-a2bc72ae` pressed every Save that way, and the second had read no row at
// all when it did. What that answer holds of the item is the title of the page it was pressed on (`evidence.read.title`):
// the page's own words, never a word the model wrote. A title is the page's name, then the site's, so it is read up to
// the site's name. A title with no such mark is said whole, and a site that names itself first reads as itself: that
// names less than it might, and the person's line is all it can get wrong.

import { automationStudioAttemptActCutItemWords } from "./cut-words.ts";

/** What marks a site's name in a title: the bar plainly, so a listing's own dash stays in its words. */
const BAR = " | ";
const SOFTER = /\s[·•–—-]\s(?!.*\s[·•–—-]\s)/u;

/** The few words naming the page `title` is of, or `undefined` where it holds none. */
export function automationStudioAttemptActPageWords(title: string | undefined): string | undefined {
  if (title === undefined) return undefined;
  const whole = title.replace(/\s+/gu, " ").trim();
  const barred = whole.indexOf(BAR);
  const softer = whole.search(SOFTER);
  const words = (barred > 0 ? whole.slice(0, barred) : softer > 0 ? whole.slice(0, softer) : whole).trim();
  return /\p{L}{2}/u.test(words) ? automationStudioAttemptActCutItemWords(words) : undefined;
}
