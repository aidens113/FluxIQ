import type { AutomationStudioInstructedActText, AutomationStudioInstructedRead } from "../../../flows/executable/permissions/index.ts";
import { withActReads } from "./attach.ts";

/** A read in which no act was answered: what a read that failed holds, so each of its acts is treated as lasting. */
export function automationStudioInstructedReadUnanswered(acts: readonly AutomationStudioInstructedActText[]): AutomationStudioInstructedRead {
  return acts.length ? withActReads([], acts.map((act) => ({ act: act.id, quote: act.quote, consequences: null }))) : [];
}
