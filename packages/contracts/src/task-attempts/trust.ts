/**
 * How far a saved thing has been proven, derived and never set by hand.
 *
 * - `unproven`: no judged live run, or a failure since the last one. A draft that
 *   passed only in simulation is `unproven`: a simulated pass is never proof.
 * - `provisional`: a judged yes.
 * - `established`: enough zero-model runs since the last failure.
 *
 * The tiers of `decideAutomationStudioChangeConfidence`, whose lowest is called
 * `unverified` there. It is `unproven` here because `unverified` on these records
 * is a result's label, and "is this answer right" and "does this Flow do the task"
 * are separate questions (plan, D4).
 */
export const AUTOMATION_STUDIO_TRUST_TIERS = Object.freeze(["unproven", "provisional", "established"] as const);

export type AutomationStudioTrustTier = (typeof AUTOMATION_STUDIO_TRUST_TIERS)[number];
