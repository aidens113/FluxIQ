// The saved steps, said with any step that did something lasting and is out of the Flow. A press
// that did the work and was dropped from the draft is a saved Flow that will not do it again, so
// the line says so rather than "the steps" alone.
//
// A step is named by what it did, in the site's words ("Save: Table"). A name that is only a place
// or an id ("Step 13", "d7", a handle) is no words a person reads, so such a step is counted, never
// quoted: "one step that did something on the site". Core says that phrase itself where it has no
// name (`left-out-steps.ts` in the service's task memory).

import type { ChatSavedState } from "../../ports/index.ts";

const SHOWN = 3;
/** What Core says of a step nothing names; the same words as there. */
const SOMETHING = "one step that did something on the site";

/** A name no person reads: Core's own phrase, a position ("Step 13"), or one unbroken run with a digit in it (an id or a handle). */
function unnamed(name: string): boolean {
  return name === SOMETHING || /^step\s*\d+$/iu.test(name) || (!/\s/u.test(name) && /\d/u.test(name) && /[a-z]/iu.test(name) && /^[\w.:#-]+$/u.test(name) && name.length >= 2);
}

function counted(count: number): string {
  return count === 1 ? "one step that did something on the site" : `${count} steps that did something on the site`;
}

/** "the steps", or "the steps, except the one that did "Save: Table" (it was left out of the Flow)". */
export function savedStepsWords(saved: ChatSavedState): string {
  const all = "leftOut" in saved ? saved.leftOut?.map((name) => name.trim()).filter((name) => name.length > 0) ?? [] : [];
  if (all.length === 0) return "the steps";
  const names = all.filter((name) => !unnamed(name));
  const without = all.length - names.length;
  const quoted = names.slice(0, SHOWN).map((name) => `"${name}"`);
  const more = names.length - quoted.length;
  const list = more > 0 ? `${quoted.join(", ")} and ${more} more` : quoted.length <= 1 ? quoted[0] ?? "" : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  const what = names.length === 0 ? counted(without) : `${names.length > 1 || without > 0 ? "the ones" : "the one"} that did ${list}${without > 0 ? ` and ${counted(without)}` : ""}`;
  return all.length > 1 ? `the steps, except ${what} (they were left out of the Flow)` : `the steps, except ${what} (it was left out of the Flow)`;
}
