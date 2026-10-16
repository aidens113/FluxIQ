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
// **The rule, and only that.** A run's result check that ends in two agreeing
// nos (`does_not_answer`, basis `model`) is recorded unverified
// (`model_disagreed`, `core.result.build_yes_disagrees`) -- never refuted, so
// nothing is repaired on it -- where all of this holds:
//
// - the caller names the trial its build judged the very Flow revision this run
//   executed by (`./judged-trial.ts`);
// - that trial was judged yes, by at least two calls (a confirmed yes, t296);
// - it was judged against the same request (instruction digest);
// - the rows it stored are the rows this run stored, read by Core from both
//   runs' stores and compared by content (`./same-stored-rows.ts`).
//
// Different rows, another request, a trial judged anything but a confirmed yes,
// or no such trial: the double no is judged as before. A double no Core's own
// arithmetic reached (`core_observation`) is never held: that is Core's
// measurement, not a judge's. The hold never makes a yes: the result stays
// unconfirmed, with the no's reading kept beside it (`unconfirmedReading`), and
// a later run of the same Flow is checked afresh.

import type { AutomationStudioResultVerificationOutcome } from "../contracts/index.ts";
import type { AutomationStudioResultRecordSetInput } from "../result-summary.ts";
import type { AutomationStudioResultJudgedBuildTrial } from "./judged-trial.ts";
import { automationStudioResultSameStoredRows } from "./same-stored-rows.ts";

/** Core's code for a playback's double no held to its build's two yeses on the same rows (header). */
export const AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES = "core.result.build_yes_disagrees";

/** The fewest judge calls behind a confirmed yes (t296). */
const CONFIRMED_CALLS = 2;

/**
 * The outcome a run's result check records (header): `outcome` as it came,
 * unless it is a double no the build's confirmed yes on the same rows holds,
 * which is recorded unverified. `trial` and `trialRecordSets` are read only
 * for such a double no.
 */
export async function automationStudioResultBuildYesHold(input: {
  outcome: AutomationStudioResultVerificationOutcome;
  runId: string;
  instructionDigest: string | undefined;
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  trial: () => Promise<AutomationStudioResultJudgedBuildTrial | undefined>;
  trialRecordSets: (trialRunId: string) => Promise<readonly AutomationStudioResultRecordSetInput[]>;
}): Promise<AutomationStudioResultVerificationOutcome> {
  const { outcome } = input;
  if (outcome.performed !== true || outcome.verdict !== "does_not_answer" || outcome.basis !== "model") return outcome;
  if ((outcome.verdicts ?? []).filter((verdict) => verdict === "does_not_answer").length < 2 || !input.instructionDigest) return outcome;
  const trial = await input.trial();
  if (!trial || trial.verdict !== "yes" || trial.calls < CONFIRMED_CALLS || trial.instructionDigest !== input.instructionDigest || trial.trialRunId === input.runId) return outcome;
  if (!automationStudioResultSameStoredRows(input.recordSets, await input.trialRecordSets(trial.trialRunId))) return outcome;
  const { repair, failure: _failure, ...rest } = outcome;
  const reading = repair?.judgement ? { ...repair.judgement } : undefined;
  return {
    ...rest,
    verdict: "unsure",
    basis: "model_disagreed",
    code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES,
    reason: "This result was judged twice not to answer the request, but the build's test of this same Flow stored exactly these rows and was judged twice to answer it. Four checks disagree on the same rows, so this result is unverified rather than refuted, and nothing is changed on it.",
    ...(reading ? { unconfirmedReading: reading } : {})
  };
}
