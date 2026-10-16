import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioResultRepairDirective } from "./repair.ts";
import type { AutomationStudioResultVerdict, AutomationStudioResultVerdictBasis } from "./verdict.ts";

/** The verdict, the reason a person reads, and the observation behind it. */
export type AutomationStudioResultVerification = import("../standing-no/index.ts").AutomationStudioResultStandingNoCarrier & {
  schemaVersion: "automation-studio.result-verification.v1";
  verdict: AutomationStudioResultVerdict;
  basis: AutomationStudioResultVerdictBasis;
  /** Core's stable code for why this verdict was reached. */
  code: string;
  /** Why, in a sentence, in Core's own words. */
  reason: string;
  /** What was actually observed: counts, never a model's prose or a row's contents. */
  observation: string;
  /**
   * The verdict each verification call returned, in the order asked: one; two when the first answered
   * anything but `answers`, or `answers` on a verification that confirms it (`confirmAnswer`); more when a
   * contradicted unsure (`contradictedUnsure`) or a refuted no (`refutedNo`) was asked again. Verdict words
   * only, never the model's prose. Absent when no model was asked.
   */
  verdicts?: AutomationStudioResultVerdict[];
  /** The verification calls made or attempted: 1, 2, 3 with a re-ask, or 4 where both refuted nos were asked again. Absent when no model was asked. */
  calls?: number;
  /**
   * Set exactly on a confirming verification's (`confirmAnswer`) yes that its
   * two checks reached with no call re-asked after them and no check's verdict
   * changed between its asks (`../first-ask/`, t677): what the playback hold
   * reads in place of counting calls. A retry after a temporary fault, or the
   * exclusion-evidence recheck of a yes, does not clear it. Never on a runtime check.
   */
  firstAskConfirmed?: true;
  /**
   * What to fix, present exactly when the verdict is `does_not_answer`. An
   * `unsure` carries none: nobody judged the result wrong, and
   * `recovery/refuted-result/attempt.ts` builds no repair from one.
   */
  repair?: AutomationStudioResultRepairDirective;
  /**
   * On a verification two checks did not settle (`model_disagreed`,
   * `model_unconfirmed`), the reading of the call that judged `does_not_answer`,
   * as screened for its `repair.judgement`: one judge's reading the other call
   * did not confirm. Never a `repair` or a `failure` record, so it fails no run
   * and builds no runtime repair; a build's repair is told it
   * (`build-test/judge.ts`; live run murwcmx2 was told only "unverified").
   * Absent when no call judged `does_not_answer` or it said nothing more. Like
   * every reading here, the model's prose, never recorded on a run (`run-record.ts`).
   *
   * `recordContradicts` is Core's, not the model's: set where Core's own record
   * refutes the reading, `whole` where it refutes every reason it gives and
   * `part` where some still stand, beside the label its fields carry
   * (`./agreement.ts`, `./refuted-no/reask.ts`, t641). A build's gate reads it
   * as the fact, never the label's words.
   */
  unconfirmedReading?: NonNullable<AutomationStudioResultRepairDirective["judgement"]> & { recordContradicts?: "whole" | "part" | undefined };
  /**
   * The reading of a call that judged `answers` (`expected`, `observed`),
   * screened as a refutation's is (`./judgement-screen.ts`). Kept on a yes, and
   * on a split (`model_disagreed`) beside the other call's, so a build sees the
   * evidence each relied on (t477, `run-mv5uu9g1-9d80deea`). Never a repair or
   * its advice. On a yes held for its exclusion evidence that advised a change
   * (`changeAdvised`, t636) it carries that change too (`advice`), so a build
   * can weigh it; it is still no repair.
   */
  answeredReading?: { expected?: string; observed?: string; advice?: string };
  /** On an `unsure` a model gave, what it doubted, screened as a refutation's is: what an unsure beside a yes is weighed by (`./agreement.ts`, t503). Never a repair. */
  unsureReading?: NonNullable<AutomationStudioResultRepairDirective["judgement"]>;
  /**
   * On an unsure beside a yes or a no, the unsure call (1 or 2) whose doubt the
   * record contradicts -- pages left unread where every paging read says its list
   * ended (t503), or rows merged where the dedupe removed none (`about: "dedupe"`,
   * `./refuted-no/dedupe-doubt.ts`, t628), or a step said to choose an option the
   * request does not name where the option is the request's own words (`about:
   * "narrowing"`, `./unsure-doubts/`, t655) -- and Core's words naming that record:
   * asked once more with it named (`reasked` once it was); the rule stands (`./agreement.ts`).
   */
  contradictedUnsure?: { call: 1 | 2; record: string; about?: "dedupe" | "narrowing"; reasked?: true };
  /** The calls whose no Core's record wholly refutes, and Core's findings (`./refuted-no/`, t607): each asked once more (`reasked`); a no still refuted is unsure. */
  refutedNo?: { calls: Array<1 | 2>; findings: string[]; reasked?: true };
  /**
   * On a double no where Core's record could weigh them (`./agreement.ts`,
   * t664): one entry per call, `recordContradicts` where the record refutes its
   * no wholly or in part, absent where the no stands whole. Recomputed when a
   * re-ask's answers are weighed again (`./refuted-no/reask.ts`). Read by
   * `./build-yes-hold/weighed-nos.ts`; never model-facing.
   */
  weighedNos?: Array<{ call: 1 | 2; recordContradicts?: "whole" | "part" }>;
  /**
   * Present exactly when the verification fails the run
   * (`automationStudioResultVerificationFailsRun`): what the run must report.
   */
  failure?: AutomationStudioFailureRecord;
  /**
   * The exact code of what stopped the verification (a call's diagnostic code,
   * or the error's name), for a debug reading the record; never in `reason` or
   * `observation`, which are said in the chat. Absent when nothing failed.
   */
  failureCode?: string;
  /** Core's bounded missing-proof lines for a yes lacking row-local exclusion evidence. Not a refutation or permission to promote; never recorded on a run. */ exclusionEvidenceMissing?: string[];
  /** Beside it, set exactly when every call asked answered a plain yes (none no, none unsure, none unanswered) and Core held that yes for the exclusion evidence it lacked (`../verdict/`, `./agreement.ts`, t611): what a build reads, never the reason's words. Never a yes or permission to promote. */ yesUnconfirmed?: true;
  /** On a yes Core held for its exclusion evidence (`exclusionEvidenceMissing`) whose reply also said the Flow needs a change (`patchNeeded: true`, `../verdict/`, t636): in place of `yesUnconfirmed`, which is said only of a plain yes. A recheck's yes keeps the advice's code (`answersWithChangeAdvised`, `./verify.ts`). Never a yes or permission to promote. */ changeAdvised?: true;
};

/**
 * Why a run was not verified at all.
 *
 * This is not a verdict and must never be read as one. A run that produces no
 * records has no result to judge, and a deployment with no model configured
 * cannot ask for a judgement -- neither is the model saying "it looks fine".
 * Recording the reason is what keeps the two apart on a run's record.
 */
export type AutomationStudioResultVerificationSkipped = {
  schemaVersion: "automation-studio.result-verification.v1";
  performed: false;
  code: string;
  reason: string;
  /** The error's own name, when the verification threw before a verdict. Never in `reason`. */
  failureCode?: string;
};

/** What a finished run's verification produced: a verdict, or a stated reason there is none. */
export type AutomationStudioResultVerificationOutcome =
  | (AutomationStudioResultVerification & { performed: true })
  | AutomationStudioResultVerificationSkipped;
