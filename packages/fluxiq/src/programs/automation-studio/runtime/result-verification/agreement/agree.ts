import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict/index.ts";
import { automationStudioResultVerificationAskAgain } from "./ask-again.ts";
import { bothReadings } from "./both-readings.ts";
import { changeAdvised } from "./change-advised.ts";
import { contradictedUnsure } from "./contradicted-unsure.ts";
import { listedValuesAdvice } from "./exclusion-words.ts";
import { noRecordOf } from "./no-record.ts";
import { said } from "./said.ts";
import { standingNoOf } from "./standing-record.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";
import { unsettled } from "./unsettled.ts";
import { refutedMark, splitRefuted, weighedNos } from "./weighed-no.ts";
import { advisedChange, answeredYes, yesReading } from "./yes-readings.ts";

/** The agreement, `reasked` naming the call a split's no was asked again for (t515), so its mark says so. */
export function agree(input: AutomationStudioResultVerificationAgreementInput, reasked?: 1 | 2): AutomationStudioResultVerification {
  const { first, second } = input;
  if (!second && first.basis === "model" && first.verdict === "answers" && input.confirmAnswer === true) {
    return { schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.unconfirmed, reason: `This result was checked once: the first answer was that it does what was asked, but the required confirming check was not supplied. ${UNSETTLED.model_unconfirmed.run}`, observation: first.observation, verdicts: [first.verdict], calls: 1 };
  }
  if (!second || !automationStudioResultVerificationAskAgain(first, { confirmAnswer: input.confirmAnswer })) {
    // A runtime check's single yes that said the Flow needs a change is not confirmed (header, t515).
    if (first.basis === "model" && first.verdict === "answers" && first.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answersWithChangeAdvised) return changeAdvised(first);
    return { ...first, verdicts: [first.verdict], calls: 1 };
  }
  const verdicts: AutomationStudioResultVerdict[] = [first.verdict, second.verdict];
  if ((first.exclusionEvidenceMissing || second.exclusionEvidenceMissing) && first.verdict !== "does_not_answer" && second.verdict !== "does_not_answer") {
    return {
      schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing",
      reason: "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.",
      observation: first.observation, verdicts, calls: 2,
      exclusionEvidenceMissing: [...(first.exclusionEvidenceMissing ?? []), ...(second.exclusionEvidenceMissing ?? [])],
      // Both calls answered yes, one or both held for the evidence it lacked (header, t611). An unsure, or a call that did not answer, beside it is no yes.
      ...(answeredYes(first) && answeredYes(second) ? { yesUnconfirmed: true as const } : {}),
      // A yes that advised a change, held or taken, says so, and what a yes compared is kept (t636, `../verdict/`).
      ...(advisedChange(first) || advisedChange(second) ? { changeAdvised: true as const } : {}),
      ...yesReading(first, second)
    };
  }
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const weigh = { wording: input.wording, reasked, record: noRecordOf(input) };
  if (first.verdict === "answers") {
    // A confirmation that never came back usable confirms nothing (run-mux6nxst-c9bca37c): the yes is unconfirmed.
    if (second.basis === "model_unavailable") {
      return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked once: the first answer was that it does what was asked, and the second check, which confirms a yes, gave no answer, because it did not come back usable (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
    }
    if (second.verdict === "answers") return { ...first, verdicts, calls: 2 };
    if (second.verdict !== "does_not_answer") {
      return { ...unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence: the first answer was that it does what was asked, and the confirming check gave ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts), ...contradictedUnsure(2, second, input) };
    }
    // The no's reading labelled where Core's record refutes any of it, as every other branch labels it (header, t652).
    return { ...unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was that it does what was asked, the second that it does not. ${UNSETTLED.model_disagreed.run}`, verdicts, { ...weigh, refuted: splitRefuted(input, 2) }), ...refutedMark(input, [2]) };
  }
  if (first.verdict === "does_not_answer" && second.verdict === "does_not_answer") {
    // A no whose every reason Core's record refutes is marked, to be asked once more (t607, `../refuted-no/`).
    const refuted = refutedMark(input, [1, 2]);
    const weighed = weighedNos(input);
    // Both readings, each its own call's and labelled so (`bothReadings`):
    // two calls with the same evidence reach identical Core findings, but their
    // prose can name different defects. Live run `run-mv6i27oi-a87fb247` (D1):
    // the first blamed paging against the record, the second named the two
    // stored rows that were wrong, and only the first was forwarded.
    return {
      // The agreed nos' advice keeps its words; a list of values the request never says gets a note (t785, `./exclusion-words.ts`).
      ...notedAdvice(bothReadings(first, second, input.reads, input.recordSets, weighed), input.wording),
      // Each call's weighing as a field a gate reads (`../build-yes-hold/`, t664), never from the labels above; absent without the record.
      ...(noRecordOf(input) ? { weighedNos: ([1, 2] as const).map((call) => ({ call, ...(weighed.has(call) ? { recordContradicts: weighed.get(call)!.wholly ? "whole" as const : "part" as const } : {}) })) } : {}),
      // Nothing about the steps: this file reads only the two verdicts, and a
      // build's test can pass with a step it excused failing. "Although every
      // step of the run succeeded" was said above "Step 15 (×) failed" (t193
      // 1002-M, `run-murzln6g-11debe1d`, C6).
      reason: "The result was judged not to answer the request the Flow was built for, twice and with the same evidence.",
      verdicts,
      calls: 2,
      ...refuted,
      // A build test's no keeps Core's record of it, for the gate that keeps the build's trials (header, t633). Core-only.
      ...standingNoOf(input)
    };
  }
  if (second.verdict === "answers") {
    return { ...unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was ${said(first)}, the second that it does. ${UNSETTLED.model_disagreed.run}`, verdicts, { ...weigh, refuted: splitRefuted(input, 1) }), ...contradictedUnsure(1, first, input), ...refutedMark(input, [1]) };
  }
  // Neither yes nor two nos (header, t628): a doubt Core's record contradicts is marked, to be asked once more (t503), and
  // the no's reading, where one said no, is labelled where the record refutes any of it (t607). Re-asking that no alone
  // could not make two yeses, so it is asked only after a contradicted doubt asked again comes back yes.
  const noCall: 1 | 2 | undefined = first.verdict === "does_not_answer" ? 1 : second.verdict === "does_not_answer" ? 2 : undefined;
  const refuted = noCall ? splitRefuted(input, noCall) : undefined;
  const doubt = contradictedUnsure(1, first, input).contradictedUnsure ? contradictedUnsure(1, first, input) : contradictedUnsure(2, second, input);
  return {
    ...unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence, and neither answer was that it does what was asked, nor were both that it does not: the first was ${said(first)}, the second ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts, { refuted }),
    ...doubt
  };
}

/** The verification with its repair advice noted where it lists values the request never says; the advice stays whole. */
function notedAdvice(verification: AutomationStudioResultVerification, wording: AutomationStudioResultVerificationAgreementInput["wording"]): AutomationStudioResultVerification {
  const judgement = verification.repair?.judgement;
  if (!verification.repair || !judgement?.advice) return verification;
  const advice = listedValuesAdvice(judgement.advice, wording);
  return advice === judgement.advice ? verification : { ...verification, repair: { ...verification.repair, judgement: { ...judgement, advice } } };
}
