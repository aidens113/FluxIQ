import type { AutomationStudioInstructedConsequence, AutomationStudioInstructedActRead, AutomationStudioInstructedRead } from "../../../flows/executable/permissions/index.ts";

export /**
 * The entries with the acts' answers beside them. Not enumerable, so the list
 * copies, compares and serialises as the entries alone: what is stored with a
 * Flow is the four-field entries and nothing more.
 */
function withActReads(entries: AutomationStudioInstructedConsequence[], acts: readonly AutomationStudioInstructedActRead[]): AutomationStudioInstructedRead {
  return Object.defineProperty(entries, "acts", { value: Object.freeze([...acts]), enumerable: false });
}
