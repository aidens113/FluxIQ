import type { AutomationStudioFaultAssessment } from "./contracts.ts";

/**
 * A lasting act the effect check showed did not happen, read as unacted: making
 * it again is not a second act, so the normal retry path and the four-attempt
 * floor apply. The fault keeps its category and code, so the ledger still says
 * what failed; only what the run may do about it changes.
 */
export function automationStudioFaultNotLanded(assessed: AutomationStudioFaultAssessment): AutomationStudioFaultAssessment {
  const { actUncertain: _settled, ...fault } = assessed;
  return { ...fault, disposition: "retry", effect: "unacted", reason: `${assessed.reason} The effect check then showed it did not take effect, so it is made again.` };
}
