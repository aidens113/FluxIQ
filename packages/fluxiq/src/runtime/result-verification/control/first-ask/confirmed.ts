import type { ResultFirstAskTrail } from "./trail.ts";

/**
 * Whether the outcome's yes is first-ask confirmed (`./index.ts`): a
 * confirming verification's yes, both checks answering yes, the second asked
 * the converse question rather than the same one repeated, neither check's
 * verdict changed by asking it again, and no call re-asked after the two.
 */
export function resultFirstAskConfirmed(trail: ResultFirstAskTrail): boolean {
  const { outcome, first, second } = trail;
  if (!trail.confirmAnswer || !second || trail.verdictChanged || trail.reasks > 0) return false;
  // An identical repeat at temperature 0 is one opinion counted twice (t691).
  if (trail.secondAsked === "same") return false;
  if (outcome.basis !== "model" || outcome.verdict !== "answers") return false;
  return [first, second].every((check) => check.basis === "model" && check.verdict === "answers");
}
