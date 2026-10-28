import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { automationStudioResultChangeCountDiffers } from "./count-differs.ts";

/** Core's code for a yes it did not take because the trial's change does not prove a part, or reads as a move other than a part asks (`./index.ts`). */
const CODE = "core.result.change_not_proven";

type Proof = NonNullable<AutomationStudioRunResultSummary["siteChange"]>["proofs"][number];

/** What each proof that is no proof says, in Core's words. */
const NOT_PROOF: Readonly<Partial<Record<Proof["proof"], string>>> = Object.freeze({
  no_change: "it asks for a change, and every place that change shows read the same before and after this trial",
  already_in_end_state: "the state it asks for already held before this trial began, and no step of this build was seen making that change",
  unproven: "a place its change shows was not read before or after this trial, so Core cannot say what changed there"
});

/**
 * `verification` as it stands, or, where it is a yes and the judged summary's
 * `siteChange` proves some part with a typed effect only as `no_change`,
 * `already_in_end_state` or `unproven`, or shows a change part's change at a
 * place as a whole move other than the count it asks
 * (`./count-differs.ts`) (`./index.ts`), that yes not taken:
 * `unsure`, unconfirmed, the reason naming each such part and its proof. Never
 * a no Core made: nothing fails a run on it, and no repair is built from it.
 * What the yes compared and the calls it took are kept.
 */
export function automationStudioResultSiteChangeHeld(verification: AutomationStudioResultVerification, summary: AutomationStudioRunResultSummary | undefined): AutomationStudioResultVerification {
  if (verification.verdict !== "answers") return verification;
  const unproved = (summary?.siteChange?.proofs ?? []).filter((proof) => NOT_PROOF[proof.proof] !== undefined);
  const differs = automationStudioResultChangeCountDiffers(summary?.siteChange);
  if (!unproved.length && !differs.length) return verification;
  const parts = [
    ...unproved.map((proof) => `part "${proof.part}" (${proof.proof}: ${NOT_PROOF[proof.proof]})`),
    ...differs.map(({ part, said }) => `part "${part}" (moved other than asked: ${said})`)
  ].join("; ");
  return {
    schemaVersion: verification.schemaVersion,
    verdict: "unsure",
    basis: "model_unconfirmed",
    code: CODE,
    reason: `The result was judged to do what was asked, and Core did not take that yes, because what Core read of the site just before and just after this trial does not prove ${parts}. ${UNSETTLED.model_unconfirmed.run}`,
    observation: verification.observation,
    ...(verification.verdicts ? { verdicts: [...verification.verdicts] } : {}),
    ...(verification.calls !== undefined ? { calls: verification.calls } : {}),
    ...(verification.answeredReading ? { answeredReading: { ...verification.answeredReading } } : {})
  };
}
