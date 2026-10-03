import type { JsonObject } from "../../../../core/index.ts";

/**
 * Whether a runtime patch was put into the Flow, as the settle after its judged
 * run recorded it on the decision (`../service/runtime-adaptation/judged-promotion.ts`):
 * `applied`, and `notAppliedReason` when it was held back. A listing row carries
 * this so a person scanning adaptations can tell a patch that went into the Flow
 * from one that was held back without opening each one.
 */
export type AutomationStudioJudgedApplication = { applied: boolean; notAppliedReason?: string };

/** The judged application a decision records; `undefined` for a decision that never recorded whether it was applied. */
export function automationStudioJudgedApplication(decision: unknown): AutomationStudioJudgedApplication | undefined {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return undefined;
  const recorded = decision as JsonObject;
  if (typeof recorded.applied !== "boolean") return undefined;
  return typeof recorded.notAppliedReason === "string" && recorded.notAppliedReason
    ? { applied: recorded.applied, notAppliedReason: recorded.notAppliedReason }
    : { applied: recorded.applied };
}
