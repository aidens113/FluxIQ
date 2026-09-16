// A decision call that was made, paid for, and came back unusable.
//
// The exploration runner's `decide` callback throws this, and only this, to say
// "the provider was asked and its answer cannot be acted on, for a reason
// another attempt could fix": a malformed reply, a reply that failed Core's
// checks, a timeout, a moment of provider unavailability. The runner counts it
// as a step that did not advance and asks again, so one bad reply no longer
// ends an exploration, and the progress guard ends one whose replies stay bad.
//
// Anything else `decide` throws still ends the exploration as it always did. A
// refusal before the call was sent, a budget that would not pay for it, an
// authorization that ended -- none of those improves by asking again, so none of
// them is this.

export class AutomationStudioExplorationUnusableDecisionError extends Error {
  readonly name = "AutomationStudioExplorationUnusableDecisionError";

  /** The issue codes the call ended with. Codes only, never a model's words. */
  constructor(readonly issueCodes: readonly string[]) {
    super(`The exploration decision call returned nothing usable${issueCodes.length ? `: ${issueCodes.join(", ")}` : "."}`);
  }
}
