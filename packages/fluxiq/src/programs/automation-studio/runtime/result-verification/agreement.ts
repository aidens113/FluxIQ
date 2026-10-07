// Agreement between result checks. Runtime checks keep a single affirmative
// judgement; build-test checks require an affirmative confirming judgement.
// Unknown, silent, unavailable or absent confirmation leaves the result unsure.
// Only two agreeing negatives refute; conflicting answers remain unverified.
// This pure boundary preserves any negative reading for the repair controller.

import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "./contracts.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "./repair-directive.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "./unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "./verdict.ts";

/** What one call that judged `does_not_answer` said. */
type JudgeReading = NonNullable<AutomationStudioResultVerification["unconfirmedReading"]>;

export type AutomationStudioResultVerificationAgreementInput = {
  /** The verdict the first call reached. */
  first: AutomationStudioResultVerification;
  /** The verdict the second call reached, asked only when `automationStudioResultVerificationAskAgain` said so. */
  second?: AutomationStudioResultVerification | undefined;
  /** True when a first `answers` is confirmed by a second call (the build-test judge). */
  confirmAnswer?: boolean | undefined;
};

/** How a verification reads a first answer: whether a `yes` is confirmed too. */
export type AutomationStudioResultVerificationAskAgainOptions = { confirmAnswer?: boolean | undefined };

/**
 * Whether a first verdict is asked once more: the model answered, and did not
 * answer `yes` -- or did, and the verification confirms answers. A reply that
 * carried no verdict and a call that never came back are not asked again.
 */
export function automationStudioResultVerificationAskAgain(first: AutomationStudioResultVerification, options: AutomationStudioResultVerificationAskAgainOptions = {}): boolean {
  return first.basis === "model" && (first.verdict !== "answers" || options.confirmAnswer === true);
}

/**
 * The one verification a run records, from one or two calls.
 *
 * Every outcome carries `verdicts` (the verdict words, in the order asked) and
 * `calls`. A second verdict given for a first that is not asked again is
 * ignored.
 */
export function automationStudioResultVerificationAgreement(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultVerification {
  const { first, second } = input;
  if (!second && first.basis === "model" && first.verdict === "answers" && input.confirmAnswer === true) {
    return { schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.unconfirmed, reason: `This result was checked once: the first answer was that it does what was asked, but the required confirming check was not supplied. ${UNSETTLED.model_unconfirmed.run}`, observation: first.observation, verdicts: [first.verdict], calls: 1 };
  }
  if (!second || !automationStudioResultVerificationAskAgain(first, { confirmAnswer: input.confirmAnswer })) return { ...first, verdicts: [first.verdict], calls: 1 };
  const verdicts: AutomationStudioResultVerdict[] = [first.verdict, second.verdict];
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  if (first.verdict === "answers") {
    // A confirmation that never came back usable confirms nothing (run-mux6nxst-c9bca37c): the yes is unconfirmed.
    if (second.basis === "model_unavailable") {
      return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked once: the first answer was that it does what was asked, and the second check, which confirms a yes, gave no answer, because it did not come back usable (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
    }
    if (second.verdict === "answers") return { ...first, verdicts, calls: 2 };
    if (second.verdict !== "does_not_answer") {
      return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence: the first answer was that it does what was asked, and the confirming check gave ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
    }
    return unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was that it does what was asked, the second that it does not. ${UNSETTLED.model_disagreed.run}`, verdicts);
  }
  if (first.verdict === "does_not_answer" && second.verdict === "does_not_answer") {
    // The first call's `repair` stands, and the second call's is not merged in.
    // One question asked twice with the same evidence reaches identical Core
    // findings by construction; only the model's prose can differ, and two
    // readings of one result spliced together would be a directive neither call
    // gave. The failure record the repair is entered with is the first call's for
    // the same reason.
    return {
      ...first,
      // Nothing about the steps: this file reads only the two verdicts, and a
      // build's test can pass with a step it excused failing. "Although every
      // step of the run succeeded" was said above "Step 15 (×) failed" (t193
      // 1002-M, `run-murzln6g-11debe1d`, C6).
      reason: "The result was judged not to answer the request the Flow was built for, twice and with the same evidence.",
      verdicts,
      calls: 2
    };
  }
  if (second.verdict === "answers") {
    return unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was ${said(first)}, the second that it does. ${UNSETTLED.model_disagreed.run}`, verdicts);
  }
  return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence, and neither answer was that it does what was asked, nor were both that it does not: the first was ${said(first)}, the second ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
}

/** An answer in Core's own words, as it finishes "the first was ...". */
function said(verification: AutomationStudioResultVerification): string {
  if (verification.basis === "model_unavailable") return "no answer, because the check did not come back usable";
  if (verification.basis === "model_silent") return "no answer, because the reply gave none";
  if (verification.verdict === "does_not_answer" && passedOverRows(verification)) return "that it does what was asked, without saying why the rows a condition alone left out that name the item asked for are excluded";
  if (verification.verdict === "does_not_answer") return "that it does not do what was asked";
  if (verification.verdict === "answers") return "that it does what was asked";
  return "that it could not be told";
}

/** Whether a `does_not_answer` is a yes Core did not take (`verdict.ts`): it carries that finding and no reading of its own. */
function passedOverRows(verification: AutomationStudioResultVerification): boolean {
  return verification.repair?.judgement === undefined
    && (verification.repair?.findings ?? []).some((finding) => finding.code === AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem);
}

/**
 * A verification two checks did not settle. Its verdict is `unsure`, because
 * nobody could tell, and it carries no failure record, because it does not
 * fail the run (`automationStudioResultVerificationFailsRun`).
 *
 * It keeps the reading of the call that judged `does_not_answer`, where one
 * did, as `unconfirmedReading` (live run murwcmx2: the first call advised
 * narrowing a condition, the second did not come back, and the build's repair
 * was told only "unverified"). At most one of the two calls can have judged
 * `does_not_answer` here -- two did is a refutation -- so nothing is spliced.
 */
function unsettled(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  basis: "model_disagreed" | "model_unconfirmed",
  code: string,
  reason: string,
  verdicts: AutomationStudioResultVerdict[]
): AutomationStudioResultVerification {
  const reading = unconfirmedReading(first) ?? unconfirmedReading(second);
  return { schemaVersion: first.schemaVersion, verdict: "unsure", basis, code, reason, observation: first.observation, verdicts, calls: 2, ...(reading ? { unconfirmedReading: reading } : {}) };
}

/** What a call that judged `does_not_answer` said, copied off its directive; nothing for any other call or an empty reading. */
function unconfirmedReading(verification: AutomationStudioResultVerification): JudgeReading | undefined {
  if (verification.verdict !== "does_not_answer") return undefined;
  const judgement = verification.repair?.judgement;
  if (!judgement) return undefined;
  const reading: JudgeReading = {
    ...(judgement.expected ? { expected: judgement.expected } : {}),
    ...(judgement.observed ? { observed: judgement.observed } : {}),
    ...(judgement.advice ? { advice: judgement.advice } : {})
  };
  return Object.keys(reading).length ? reading : undefined;
}
