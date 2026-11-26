import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialResult } from "../contracts.ts";

// A whole trial's yes over a read Core flagged stands only on the converse check (t692, t1056).
//
// The builder's gate of a subflow already holds such a yes unsure
// (`../../subflow-candidate/subflow/trial-gate.ts`, `subflow.trial_rows_unaccounted`): a read that kept every item it
// saw after an act ran over a narrower read of the same list (`keptEveryRow`, the trial feedback's `reads`) is
// accounted for only where the judge's second call asked the converse question of each stored row and agreed
// (`firstAskConfirmed`). The whole gate kept the same yes as a yes, so a single-subflow build whose supervisor's loop
// then stopped short handed back that Flow as its candidate although its builder had held the yes unsure
// (`project-agents/single-subflow/tests/kept-every-row-build.test.ts`, t1056). Now the whole gate holds it the same
// way: such a yes is kept unsure, its revision stays open to a re-test, and nothing completes or is rescued on it.

/** The code a yes held for rows nothing accounted for carries. */
const ROWS_UNACCOUNTED = "candidate.trial_rows_unaccounted";

/** Said for such a yes while the revision may still be tested. Generic words. */
const ROWS_UNACCOUNTED_RETESTABLE = "The judges answered yes, but a read of this Flow kept every item it saw after an act ran over a narrower read of the same list, and the yes was not confirmed by a judge call asking of each row it stored whether the request asks for it, so this revision cannot complete yet. "
  + "Read keptEveryRow: each row such a read stores must be one the request's own words ask for in its answer. If the request asks for only some of them, give that read a condition that keeps exactly those, submit the whole candidate, then test the new revision; "
  + "if it asks for every one of them, test this same revision again (retestsLeft says how many times).";

export const automationStudioCandidateTrialRows = Object.freeze({
  /** `answer`, or, where it is a yes over a flagged read the converse did not confirm, the same trial kept unsure. */
  held(answer: AutomationStudioCandidateTrialResult): AutomationStudioCandidateTrialResult {
    if (answer.verdict !== "yes" || answer.feedback.firstAskConfirmed === true) return answer;
    const flagged = (Array.isArray(answer.feedback.reads) ? answer.feedback.reads : []).flatMap((read) => {
      if (!isObject(read) || typeof read.nodeId !== "string" || !isObject(read.keptEveryRow)) return [];
      return [{ read: read.nodeId, ...(typeof read.keptEveryRow.said === "string" ? { said: read.keptEveryRow.said } : {}) }];
    });
    if (!flagged.length) return answer;
    return { ...answer, verdict: "unsure", feedback: { ...answer.feedback, code: ROWS_UNACCOUNTED, keptEveryRow: flagged } };
  },
  /** The instruction for a trial `held` kept unsure, while its revision may be tested again; else undefined. */
  instruction(answer: AutomationStudioCandidateTrialResult, retestable: boolean): string | undefined {
    return answer.verdict === "unsure" && retestable && answer.feedback.code === ROWS_UNACCOUNTED ? ROWS_UNACCOUNTED_RETESTABLE : undefined;
  }
});

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
