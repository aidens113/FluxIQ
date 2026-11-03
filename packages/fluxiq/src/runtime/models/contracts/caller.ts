/**
 * The person a model call is made for: whose unlocked Secret Keys key pays.
 *
 * Not an authorization. A model call made while building, exploring,
 * repairing, verifying, diagnosing or adapting a Flow needs no grant: nothing
 * is issued, held, digest-checked, confirmed or revoked around it. What stays
 * gated is a lasting real-world consequence of an *action* -- moving money,
 * deleting, sending -- which the action permission gate asks the person about
 * one act at a time. Spend is bounded by the run's own budget and the Flow's
 * configured cost ceiling.
 */
export type AutomationStudioLlmModelCaller = {
  actorUserId: string;
  actorSessionId: string;
};
