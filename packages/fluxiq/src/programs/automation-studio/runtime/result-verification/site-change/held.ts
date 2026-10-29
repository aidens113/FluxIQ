import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
// The leaves, not the barrel: `../computed-facts/` reads `../request-rows/` and `../read-account/`, which reach back here through `../agreement/`.
import { automationStudioResultActPassesFact } from "../computed-facts/act-passes.ts";
import { automationStudioResultComputedNo } from "../computed-facts/computed-no.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { automationStudioResultChangeCountDiffers } from "./count-differs.ts";

/** Core's code for a yes it did not take because the trial's change does not prove a part, or reads as a move other than a part asks (`./index.ts`). */
const CODE = "core.result.change_not_proven";

type Proof = NonNullable<AutomationStudioRunResultSummary["siteChange"]>["proofs"][number];

/** What each proof that is no proof says, in Core's words. */
const NOT_PROOF: Readonly<Partial<Record<Proof["proof"], string>>> = Object.freeze({
  no_change: "it asks for a change, and every place that change shows read the same before and after this trial",
  already_in_end_state: "the state it asks for already held before this trial began, and no step of this build was seen making that change",
  contradicted: "it asks to add, and a place this part's change shows went back to how it was before this trial, so the trial undid what it asks for"
});

/** What a proof that is no proof says; nothing for a proof that proves. */
function notProof(proof: Proof): string | undefined {
  return NOT_PROOF[proof.proof];
}

/**
 * `verification` as it stands, or, where it is a yes over a part whose
 * requested act did not run -- its proof `not_run`, or any proof (a `shown`
 * one among them) carrying `notRun` for a pass (t796; `../computed-facts/act-passes.ts`)
 * -- a Core no: the trial did not do what the part asks on those passes,
 * whatever the page shows, and the no names the step, the passes and why, as
 * the computed fact does before any judge (`../verify.ts`). Otherwise, where
 * it is a yes and the judged summary's
 * `siteChange` proves some part with a typed effect only as `no_change`,
 * `already_in_end_state` or `contradicted`, or shows a change part's change at a
 * place as a whole move other than the count it asks
 * (`./count-differs.ts`) (`./index.ts`), that yes not taken:
 * `unsure`, unconfirmed, the reason naming each such part and its proof. Never
 * a no Core made: nothing fails a run on it, and no repair is built from it.
 * What the yes compared and the calls it took are kept.
 *
 * `unproven` (a place not read, or an end state whose only witnesses are lists
 * that read the same) is not held: Core read nothing that says the run failed,
 * the packet says what was not read, and the judge decides from the run and
 * its end view. Holding it made every yes unsure wherever a look could not be
 * taken (t775 integration).
 */
export function automationStudioResultSiteChangeHeld(verification: AutomationStudioResultVerification, summary: AutomationStudioRunResultSummary | undefined): AutomationStudioResultVerification {
  if (verification.verdict !== "answers") return verification;
  // A requested act that did not run on a pass is a Core no, never a held yes (header, t796).
  const notRun = summary ? automationStudioResultActPassesFact({ summary, instructions: [], requestText: "" }).filter((fact) => fact.status === "fails") : [];
  if (notRun.length && summary) return { ...automationStudioResultComputedNo(summary, notRun), ...(verification.verdicts ? { verdicts: [...verification.verdicts] } : {}), ...(verification.calls !== undefined ? { calls: verification.calls } : {}) };
  const unproved = (summary?.siteChange?.proofs ?? []).filter((proof) => notProof(proof) !== undefined);
  const differs = automationStudioResultChangeCountDiffers(summary?.siteChange);
  if (!unproved.length && !differs.length) return verification;
  const parts = [
    ...unproved.map((proof) => `part "${proof.part}" (${proof.proof}: ${notProof(proof)})`),
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
