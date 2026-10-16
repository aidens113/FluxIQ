// A playback's double no, held to its build's two yeses on the same rows
// (t660).
//
// **Why.** A8 frozen pair 6 candidate `run-mvac1av6-f7b0f9e2`: a build's
// judged test of its Flow stored nine rows and both judge calls said yes. The
// playback of that same Flow stored the very same nine rows, read the same way,
// and both calls said no, each blaming a step Core's own record said removed no
// row. Two agreeing nos refute (`../agreement.ts`), so the run was failed, its
// Flow re-authored, and the re-author broke it. The second call of each pair
// reuses the first's cached prompt, so each pair is close to one draw: what
// Core holds is four judgements, two each way, on evidence Core measured to be
// the same.
//
// **Only nos Core's record refutes (t664).** A8 frozen pair 7 candidate towels
// `run-mvahlxuu-760d9e28`: the build's yes was itself the wrong one -- it never
// looked at the one kept row that was not the item asked for -- and the
// playback's two nos named that row, with nothing in Core's record against
// them. Two yeses against two nos is no measurement of which side is right; a
// no Core's own record contradicts is. So a no is set aside only where Core's
// record contradicts at least part of its reading (`./weighed-nos.ts`), and a
// no that stands whole is never set aside.
//
// **The rule, and only that.** A run's result check that ends in two agreeing
// nos (`does_not_answer`, basis `model`) is recorded unverified
// (`model_disagreed`, `core.result.build_yes_disagrees`) -- never refuted, so
// nothing is repaired on it -- where all of this holds, read in this order:
//
// - the caller names the trial its build judged the very Flow revision this run
//   executed by (`./judged-trial.ts`);
// - that trial was judged yes by exactly two calls, the first asked and the
//   second confirming it (t296): a yes reached only by asking again calls that
//   first said otherwise is no confirmed yes (t664, `FIRST_ASK_CONFIRMED_CALLS`);
// - it was judged against the same request (instruction digest);
// - the rows it stored are the rows this run stored, read by Core from both
//   runs' stores and compared by content (`./same-stored-rows.ts`);
// - Core's record contradicts at least part of each call's no.
//
// Whatever the answer, a double no says why (`./because.ts`): the first of
// these that failed, or `held`. A double no Core's own arithmetic reached
// (`core_observation`) is never held: that is Core's measurement, not a
// judge's. The hold never makes a yes: the result stays unconfirmed, with the
// no's reading kept beside it (`unconfirmedReading`), and a later run of the
// same Flow is checked afresh.

import type { AutomationStudioResultVerificationOutcome } from "../contracts/index.ts";
import type { AutomationStudioResultRecordSetInput } from "../result-summary.ts";
import type { AutomationStudioResultBuildYesHoldBecause, AutomationStudioResultBuildYesHoldRecord } from "./because.ts";
import type { AutomationStudioResultJudgedBuildTrial, AutomationStudioResultJudgedBuildTrialMissing } from "./judged-trial.ts";
import { automationStudioResultSameStoredRows } from "./same-stored-rows.ts";
import { automationStudioResultEveryNoContradicted, automationStudioResultWeighedNos } from "./weighed-nos.ts";

/** Core's code for a playback's double no held to its build's two yeses on the same rows (header). */
export const AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES = "core.result.build_yes_disagrees";

/**
 * The judge calls behind a first-ask confirmed yes: the first call's yes and
 * the second call's confirmation (t296), and no other. Every re-ask adds a
 * call of its own (`../verify.ts` records each ask's intervention, and the
 * build-test judge counts them, `../build-test/judge.ts` `spentBy`): a refuted
 * no asked again (t607), a contradicted unsure asked again (t503), a split's no
 * asked again (t515). A yes reached only through one is not a two-call yes
 * (t664: the debugged towels trial's false yes was two nos asked again, four
 * calls). A call asked again after a temporary fault, or after Core's
 * exclusion-evidence recheck, adds one too; such a yes is passed over as well,
 * which is the side a doubt falls on: the hold is the act that sets nos aside.
 */
const FIRST_ASK_CONFIRMED_CALLS = 2;

/**
 * The outcome a run's result check records (header): `outcome` as it came,
 * unless it is a double no the build's confirmed yes on the same rows holds,
 * which is recorded unverified; and, for every double no, whether it was held
 * and why (`hold`). `trial` and `trialRecordSets` are read only for a double no.
 */
export async function automationStudioResultBuildYesHold(input: {
  outcome: AutomationStudioResultVerificationOutcome;
  runId: string;
  instructionDigest: string | undefined;
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  trial: () => Promise<AutomationStudioResultJudgedBuildTrial | AutomationStudioResultJudgedBuildTrialMissing | undefined>;
  trialRecordSets: (trialRunId: string) => Promise<readonly AutomationStudioResultRecordSetInput[]>;
}): Promise<{ outcome: AutomationStudioResultVerificationOutcome; hold?: AutomationStudioResultBuildYesHoldRecord }> {
  const { outcome } = input;
  if (outcome.performed !== true || outcome.verdict !== "does_not_answer" || outcome.basis !== "model") return { outcome };
  if ((outcome.verdicts ?? []).filter((verdict) => verdict === "does_not_answer").length < 2) return { outcome };
  const kept = (because: AutomationStudioResultBuildYesHoldBecause) => ({ outcome, hold: { held: false, because } });
  const trial = await input.trial();
  if (!trial || "missing" in trial) return kept(trial?.missing ?? "no_build_trial");
  if (trial.trialRunId === input.runId) return kept("no_build_trial");
  if (trial.verdict !== "yes" || trial.calls !== FIRST_ASK_CONFIRMED_CALLS) return kept("trial_not_confirmed");
  if (!input.instructionDigest || trial.instructionDigest !== input.instructionDigest) return kept("request_differs");
  if (!automationStudioResultSameStoredRows(input.recordSets, await input.trialRecordSets(trial.trialRunId))) return kept("rows_differ");
  const weighed = automationStudioResultWeighedNos(outcome);
  if (!weighed) return kept("nos_not_weighed");
  if (!automationStudioResultEveryNoContradicted(weighed)) return kept("no_stands_whole");
  const { repair, failure: _failure, ...rest } = outcome;
  const reading = repair?.judgement ? { ...repair.judgement } : undefined;
  return {
    outcome: {
      ...rest,
      verdict: "unsure",
      basis: "model_disagreed",
      code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES,
      reason: "This result was judged twice not to answer the request, but the build's test of this same Flow stored exactly these rows and was judged twice to answer it, and Core's own record contradicts part of each of these judgements. This result is unverified rather than refuted, and nothing is changed on it.",
      ...(reading ? { unconfirmedReading: reading } : {})
    },
    hold: { held: true, because: "held" }
  };
}
