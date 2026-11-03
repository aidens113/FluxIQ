import type { AutomationStudioProjectAgentRole } from "../index.ts";

/**
 * Who made a lasting act: the supervisor (its whole-candidate trials), or the
 * brief whose builder, repair or reset made it, under the role that brief ran as.
 */
export type AutomationStudioProjectBuildActOwner = { role: "supervisor" } | { role: Exclude<AutomationStudioProjectAgentRole, "supervisor">; briefId: string };
