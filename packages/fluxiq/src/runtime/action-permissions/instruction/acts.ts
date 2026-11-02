import type { AutomationStudioInstructedConsequence, AutomationStudioInstructedActRead, AutomationStudioInstructedRead } from "../../../flows/executable/permissions/index.ts";

/** Each act's own answer on a read, or `undefined` for a plain list of entries that carries none. */
export function automationStudioInstructedActReads(read: readonly AutomationStudioInstructedConsequence[] | undefined): readonly AutomationStudioInstructedActRead[] | undefined {
  return (read as AutomationStudioInstructedRead | undefined)?.acts;
}
