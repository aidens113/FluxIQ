// One lasting act in a person's words, from the act record and never the model's prose.

import type { ChatAttemptAct } from "../../ports/index.ts";

/** The heading these lines sit under (`./site-words.ts`), and the record's word for an act it can place no better. */
const SITE_HEADING = "On the site";

/** What the act did, and where it stands: landed, may have happened, undone or never done. */
export function actWords(act: ChatAttemptAct): string {
  const where = act.where === "" || act.where === SITE_HEADING ? "" : ` (${act.where})`;
  const undo = act.undo === undefined ? "" : ` To undo it: ${act.undo.how}.`;
  if (act.state === "landed") return `${ended(`${act.what}${where}`)}${undo}`;
  if (act.state === "may_have_landed") return `This may have happened, look to be sure: ${ended(`${act.what}${where}`)}${undo}`;
  if (act.state === "undone") return `${act.what}${where}, then it was undone.`;
  return `Not done: ${ended(`${act.what}${where}`)}`;
}

/** The words as a sentence: an item's words may end cut short ("...") or with a stop of their own, and take no second one. */
function ended(words: string): string {
  return /[.!?…]$/u.test(words) ? words : `${words}.`;
}
