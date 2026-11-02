import type { AutomationStudioActionDeclarationRecord } from "../../../flows/executable/permissions/index.ts";

/**
 * The actions that acted and said they would cause nothing lasting.
 *
 * An observing action is not among them however it declared: it did not act,
 * so "it acted and said it would cause nothing" is not true of it, and counting
 * reads here would make a build that looked at a page look like a build that
 * pressed things and swore each press was harmless.
 */
export function automationStudioDeclaredNothingLasting(
  records: readonly AutomationStudioActionDeclarationRecord[]
): AutomationStudioActionDeclarationRecord[] {
  return records.filter((record) => record.action.effect !== "observe" && record.consequences.length === 0);
}
