// What the status says as a build's test call ends (t769 b13): the verdict of
// a test that ran, that it didn't run and why, or that it was checked against
// the recorded run and never tried on the site.
//
// A test call is a builder's or the supervisor's `core.test_*` tool row
// (`core.test_candidate`, `core.test_subflow`). Its closing row carries the
// gate's code in its record ("Result: candidate.trial_no", a part's under
// `subflow.`, the supervisor's under `project.`), and Core's own account in
// words after it (`Said: ...` for a test that ran, `Declined: ...` for one the
// gate refused before running anything; Core's `runtime/activity/candidate/`).
//
// Round 6 showed both lies this replaces (`run-mvrj7qgf-a44a1427`, moments
// 21-25; `run-mvrj7qg9-b6dc94f6`, step 0215): a refused test's closing row
// read as a refusal, which the line never shows, so the line kept "Testing one
// part of the Flow" until the next row; and a whole-Flow test refused for
// leftovers said only "The test didn't run". Now a refused test says it didn't
// run, and why, in Core's words or, where Core's words are only that it
// couldn't start, in the words for its code here. Never a code or an id.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** A test call's closing code: a gate's verdict or refusal, under the candidate's, a part's or the project's name. */
const CODE = /^(?:candidate|subflow|project)\.(trial_[a-z_]+)$/u;
const RESULT = /(?:^|·\s*)Result:\s*([^\s·]+)/u;
/** Core's words after the codes: everything after the marker is words (`ui/activity-action/record.ts`). */
const WORDS = /(?:^|\s·\s)(Said|Declined|Changed): (.+)$/su;
/** Core's account of a failure the recorded run kept (`runtime/activity/candidate/offline-words.ts`). */
const KEPT_ON_RECORDING = /^checked against the recorded run\b/iu;
/** Core's card words for a refusal it has no words for, which say no reason. */
const NO_REASON = /^the test couldn't start$/iu;

const VERDICTS: ReadonlyMap<string, string> = new Map([
  ["trial_yes", "The test passed: the Flow did what you asked"],
  ["trial_no", "The test failed: the Flow didn't do what you asked. Next: changing it and testing again"],
  ["trial_execution_failed", "The test failed: a step didn't work. Next: changing the Flow and testing again"],
  ["trial_unsure", "The test couldn't be judged. Next: testing the Flow again"],
  ["trial_not_judged", "The test couldn't be judged. Next: testing the Flow again"]
]);

/** A failure the recorded run kept, by its verdict: the site was never touched. */
const KEPT: ReadonlyMap<string, string> = new Map([
  ["trial_no", "Checked against the recorded run, not the site: the Flow still didn't do what you asked. Next: changing it and testing again"],
  ["trial_execution_failed", "Checked against the recorded run, not the site: a step still didn't work. Next: changing the Flow and testing again"]
]);
const KEPT_OTHER = "Checked against the recorded run, not the site. Next: deciding what to do";

/** Why a gate ran nothing, by its refusal, for a row whose own words give no reason. */
const NOT_RUN_REASONS: ReadonlyMap<string, string> = new Map([
  ["trial_reset_required", "the site first has to be put back the way the build found it"],
  ["trial_start_differs", "the start page still differs from the way the build found it"],
  ["trial_retest_limit", "these steps were already tested as often as they may be, so they have to change first"],
  ["trial_same_failure", "these steps stopped at the same step twice, so that step has to change first"],
  ["trial_unchanged_after_no", "these exact steps already failed the test, so they have to change first"],
  ["trial_stale_revision", "only the latest saved steps can be tested"],
  ["trial_input_invalid", "only the latest saved steps can be tested"],
  ["trial_step_unwitnessed", "a step that changes something on the site has to be tried once while exploring first"],
  ["trial_unavailable", "no test can run here"]
]);
const NOT_RUN = "The test didn't run";
const NOT_RUN_NEXT = "The test didn't run. Next: deciding what to do";

/**
 * The line for a test call's closing `event`. `recordedOnly` is true when the
 * call checked the Flow against the recorded run and ran none of it on the
 * site, which says the recording's failure was kept even from a Core whose
 * words do not.
 */
export function activityTestEnding(event: ClientGatewayActivity, recordedOnly: boolean): string {
  const text = event.detail?.text ?? "";
  const words = WORDS.exec(text);
  const said = words?.[1] === "Said" ? words[2]!.trim() : undefined;
  const declined = words?.[1] === "Declined" ? words[2]!.trim() : undefined;
  const name = CODE.exec(RESULT.exec(words ? text.slice(0, words.index) : text)?.[1] ?? "")?.[1];
  const verdict = name === undefined ? undefined : VERDICTS.get(name);
  if (declined !== undefined || (name !== undefined && verdict === undefined)) {
    const reason = declined !== undefined && !NO_REASON.test(declined) ? declined : name === undefined ? undefined : NOT_RUN_REASONS.get(name);
    return reason ? `${NOT_RUN}: ${reason}` : NOT_RUN_NEXT;
  }
  if ((said !== undefined && KEPT_ON_RECORDING.test(said)) || (recordedOnly && name !== "trial_yes")) return (name === undefined ? undefined : KEPT.get(name)) ?? KEPT_OTHER;
  return verdict ?? NOT_RUN_NEXT;
}
