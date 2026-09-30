import type { JsonObject } from "../../../../../core/index.ts";

/**
 * One rung of a section's trim ladder: the section a little smaller, given the
 * node the failure is about so that node is the last thing any rung removes.
 * Rungs apply cumulatively to the section as it was built, so a level always
 * means the same reduction of the same input.
 */
export type AutomationStudioRecoverySectionTrim = (section: JsonObject, failedNodeId: string | undefined) => JsonObject;
