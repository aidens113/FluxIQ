import type { AutomationStudioFaultEffect } from "./contracts.ts";

/**
 * Transport statuses the runtime retries, and whether the request behind each
 * one could already have been carried out.
 *
 * The line is drawn at what the status *says about processing*, not at how
 * severe it sounds. 408, 425 and 429 all state that the request was not
 * processed -- it arrived too slowly, too early, or too often -- so repeating it
 * is safe even for a node that acts on the world. 503 states the service is not
 * handling requests at all. 500, 502 and 504 are ambiguous: the origin may have
 * run the work and only the answer was lost, so a mutating node must not repeat
 * one blindly.
 *
 * Everything else is deterministic. A 400, a 401, a 403, a 404, a 409, a 422 all
 * say the same thing on the second attempt as on the first, so retrying one
 * spends the run's time and the person's money to be told what it already knows.
 * A 401 in particular is `auth_required` and belongs to a person, not to a loop.
 */
const TRANSIENT_STATUS_EFFECTS: ReadonlyMap<number, AutomationStudioFaultEffect> = new Map<number, AutomationStudioFaultEffect>([
  [408, "unacted"],
  [425, "unacted"],
  [429, "unacted"],
  [500, "ambiguous"],
  [502, "ambiguous"],
  [503, "unacted"],
  [504, "ambiguous"]
]);

/** The statuses the runtime retries by default, for a caller that needs the list rather than the question. */
export const AUTOMATION_STUDIO_TRANSIENT_STATUSES: readonly number[] = Object.freeze([...TRANSIENT_STATUS_EFFECTS.keys()]);

/**
 * Whether this transport status is one the runtime retries, and what it implies
 * about the request having been carried out. Nothing back means the status is
 * deterministic: the same request will be answered the same way.
 */
export function automationStudioTransientStatusEffect(status: number | undefined): AutomationStudioFaultEffect | undefined {
  if (status === undefined || !Number.isInteger(status)) return undefined;
  return TRANSIENT_STATUS_EFFECTS.get(status);
}
