import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActRecordData } from "./contracts.ts";

/**
 * The record as an attempt that ended achieved leaves it: every act that stood (landed, or may have) is marked `doneInAchieved`,
 * so a later attempt carries it with no room for another landing (`./record.ts`, `hasRoom`; `./seed.ts`, header). Nothing else changes.
 * Called only at an achieved ending: an attempt that did not finish leaves its acts unmarked, and the same words go on to finish them.
 */
export function automationStudioAttemptActMarkDoneInAchieved(data: AutomationStudioAttemptActRecordData): AutomationStudioAttemptActRecordData {
  return { ...data, acts: data.acts.map((act) => (stood(act) && act.doneInAchieved !== true ? { ...act, doneInAchieved: true as const } : act)) };
}

function stood(act: AutomationStudioAttemptActEntry): boolean {
  return act.state === "landed" || act.state === "may_have_landed";
}
