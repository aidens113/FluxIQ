// One lasting act in a person's words, from the act record and never the model's prose.

import type { ChatAttemptAct } from "../../ports/index.ts";

/** What the act did, and where it stands: landed, may have happened, undone or never done. */
export function actWords(act: ChatAttemptAct): string {
  const where = act.where === "" ? "" : ` (${act.where})`;
  const undo = act.undo === undefined ? "" : ` To undo it: ${act.undo.how}.`;
  if (act.state === "landed") return `${act.what}${where}.${undo}`;
  if (act.state === "may_have_landed") return `This may have happened, look to be sure: ${act.what}${where}.${undo}`;
  if (act.state === "undone") return `${act.what}${where}, then it was undone.`;
  return `Not done: ${act.what}${where}.`;
}
