/**
 * What an Automation Studio control actually does in the world.
 *
 * A person who asks for an automation has, by that act, granted everything the
 * automation needs in order to work. Saving, renaming, editing, re-running and
 * every other ordinary operation is the product doing the job it was asked for,
 * and asking permission for it is asking permission for the request itself. So
 * `routine` covers all of that and is never gated.
 *
 * The exceptions are the handful of consequences a person cannot take back:
 * something is destroyed, or money moves. Those, and nothing else, may stop and
 * ask.
 */
export type AutomationStudioActionConsequence =
  | "routine"
  | "delete"
  | "checkout"
  | "payment";
