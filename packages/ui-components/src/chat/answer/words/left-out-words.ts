// The saved steps, said with any step that did something lasting and is out of the Flow. A press
// that did the work and was dropped from the draft is a saved Flow that will not do it again, so
// the line says so rather than "the steps" alone.

import type { ChatSavedState } from "../../ports/index.ts";

const SHOWN = 3;

/** "the steps", or "the steps, except the one that did "Save: Table" (it was left out of the Flow)". */
export function savedStepsWords(saved: ChatSavedState): string {
  const names = "leftOut" in saved ? saved.leftOut?.filter((name) => name.trim().length > 0) ?? [] : [];
  if (names.length === 0) return "the steps";
  const quoted = names.slice(0, SHOWN).map((name) => `"${name.trim()}"`);
  const more = names.length - quoted.length;
  const list = more > 0 ? `${quoted.join(", ")} and ${more} more` : quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  return names.length === 1
    ? `the steps, except the one that did ${list} (it was left out of the Flow)`
    : `the steps, except the ones that did ${list} (they were left out of the Flow)`;
}
