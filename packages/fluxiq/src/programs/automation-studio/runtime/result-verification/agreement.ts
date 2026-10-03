// What two checks of one result come to.
//
// A verification is asked once, and a first answer that the result answers the
// request stands -- unless the verification confirms answers (`confirmAnswer`,
// set only by the build-test judge, below). Any other answer the model actually gave -- `no`, or
// `unknown` -- is asked once more with the same evidence, because either one
// used to fail a run whose every step succeeded, and at temperature 0 both were
// measured to flip. On 2026-09-18 two playbacks of one Flow stored
// byte-identical rows, the oracle scored both 14 of 14, and one was judged to
// answer and the other not to. On 2026-09-21 the same stored rows, verified ten
// times, came back `yes` eight times and `unknown` twice, and a Lab run that
// matched 14 of 14 was failed on one `unknown` (run-mublcbqf-9e815106).
//
//   first      second                            recorded as
//   yes        (not asked)                       the first, as it stands
//   no         no                                refuted, `calls: 2`
//   no         yes                               `model_disagreed`
//   unknown    yes                               `model_disagreed`
//   no         unknown, silent or unavailable    `model_unconfirmed`
//   unknown    no, unknown, silent, unavailable  `model_unconfirmed`
//   silent or  (not asked)                       the first: fails closed
//   unavailable
//
// A verification that confirms answers (`confirmAnswer`) asks a first `yes`
// once more too, and reads the pair:
//
//   yes        yes                               the first, `calls: 2`
//   yes        no                                `model_disagreed`, carrying
//                                                the no's reading
//   yes        unknown, silent or unavailable    the first, `calls: 2`
//
// Only the build-test judge sets it, because its `yes` finishes a build: in live
// run murwcmx2 two build judges (steps 0032 and 0051) were sent the same request
// but for one step number, answered `no` and then `yes`, and that one `yes`
// finished the build on rows the playback judge refused. A second call that
// says nothing contradicts nothing: on correct results a `yes` was measured to
// flip to `unknown`, never to `no`, so only a `no` unsettles it. The runtime
// result check keeps the rule above; its `yes` fails nothing either way.
//
// Only two agreeing `no`s refute. Two answers that never said `yes` and never
// agreed on `no` are not proof that the run failed, so they leave it unverified
// and keep the status its steps earned. A first call that gave no answer at
// all -- a reply without the field, or a call that did not come back -- is not
// asked again: nothing was said that a repeat could confirm or contradict, and
// it fails closed as it always has. Core's own count-based observations never
// reach this file: they are settled before any call.
//
// An unsettled outcome keeps one thing more than its verdict words: the
// expected, observed and advice of the call that judged `no`, as one reading
// the other call did not confirm (`unconfirmedReading`). It fails nothing; a
// build's repair is told it.
//
// Pure: no call is made here, and nothing is read but the two verdicts.

import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "./contracts.ts";
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
  if (!second || !automationStudioResultVerificationAskAgain(first, { confirmAnswer: input.confirmAnswer })) return { ...first, verdicts: [first.verdict], calls: 1 };
  const verdicts: AutomationStudioResultVerdict[] = [first.verdict, second.verdict];
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  if (first.verdict === "answers") {
    // Only a `no` contradicts a confirmed `yes`; a second call that said nothing leaves it standing.
    if (second.verdict !== "does_not_answer") return { ...first, verdicts, calls: 2 };
    return unsettled(first, second, "model_disagreed", codes.disagree, "The two checks of this result disagreed: asked twice with the same evidence, the model judged that it answers the request and then that it does not. Neither answer is taken over the other, so the result is unverified.", verdicts);
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
      reason: "The result was judged not to answer the request the Flow was built for, twice and with the same evidence, although every step of the run succeeded.",
      verdicts,
      calls: 2
    };
  }
  if (second.verdict === "answers") {
    return unsettled(first, second, "model_disagreed", codes.disagree, `The two checks of this result disagreed: asked twice with the same evidence, the model judged ${said(first)} and then that it answers the request. Neither answer is taken over the other, so the result is unverified and the run keeps the status its steps earned.`, verdicts);
  }
  return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `Asked twice with the same evidence, the model never judged that this result answers the request and never twice that it does not: it judged ${said(first)}, and then ${said(second)} (${second.code}). That is not proof the run failed, so the result is unverified and the run keeps the status its steps earned.`, verdicts);
}

/** A verdict in Core's own words. */
function said(verification: AutomationStudioResultVerification): string {
  if (verification.basis === "model_unavailable") return "nothing, because the call did not come back usable";
  if (verification.basis === "model_silent") return "nothing, because the reply carried no verdict";
  if (verification.verdict === "does_not_answer") return "that it does not answer the request";
  if (verification.verdict === "answers") return "that it answers the request";
  return "that it could not tell";
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
