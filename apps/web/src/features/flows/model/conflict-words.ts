import type { FlowConflict } from "../wire";

/**
 * The conflict banner's sentence: "This Flow changed while you were editing (FluxIQ repair
 * changed step 5). Your change was not saved." Who changed it comes from the versions saved
 * since; the steps are numbered as the Flow is now.
 */
export function conflictWords(conflict: FlowConflict): string {
  const who = [...new Set(conflict.changedBy.map((change) => change.madeByLabel))];
  const steps = conflict.steps.length === 0 ? "" : conflict.steps.length === 1 ? ` step ${conflict.steps[0]}` : ` steps ${listWords(conflict.steps)}`;
  const actor = who.length ? listWords(who) : "Someone";
  return `This Flow changed while you were editing (${actor} changed${steps || " it"}). Your change was not saved.`;
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
