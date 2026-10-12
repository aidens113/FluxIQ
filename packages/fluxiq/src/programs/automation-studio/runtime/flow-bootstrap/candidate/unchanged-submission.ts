// What the model is told when it submits a Flow that has not changed (t464).
//
// Lane B round 8 (`run-mv5jnc62-01c3609a`) resubmitted one script unchanged
// seven times after its trial failed. Three of those were accepted as new
// revisions -- the script was the same word for word, but the digest follows
// the resolved plan, which moved as exploration went on -- and each new
// revision was "test next", so the build spent its 64 calls re-testing a Flow
// it had not changed. Lane C round 8 (`run-mv5jnc51-9eac63f2`, step 0076)
// resubmitted a Flow the judge had refuted, and was accepted as revision 11 and
// told to test it, a test the gate then refused as unchanged after a no.
//
// So a submission that changes nothing is not a new revision. The submission
// controller (`./submission.ts`) refuses it with this check, which says that
// nothing changed, names the revision it is the same as, and gives what failed
// last: the standing trial's verdict and feedback, or the judge's finding for a
// refuted Flow. Every word of that is Core's own or the trial's, which the
// model was already shown.
//
// The refusal is counted like any other (`./submission-refusal.ts`), under its
// own code, so the run of refusals is keyed as t442 keyed it: two unchanged
// resubmissions in a row are the same refusal.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialResult, AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

const SUBMIT = "core.submit_candidate";
const TEST = "core.test_candidate";

/** The refusal check for a submission that changes nothing, with what failed last. */
export function automationStudioCandidateUnchangedRefusal(input: {
  /** The standing revision the submission is the same as, when it is one; absent for a Flow refuted under an earlier revision. */
  standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined;
  /** The standing revision's latest trial, when it was tried. */
  lastTrial: AutomationStudioCandidateTrialResult | undefined;
  /** The judge's finding, when this exact Flow was judged no. */
  refuted: JsonObject | undefined;
}): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const { standing, lastTrial, refuted } = input;
  const code = refuted ? "candidate.unchanged_after_no" : "candidate.unchanged_submission";
  const same = standing
    ? `Nothing changed: this is the Flow of revision ${standing.revision}, word for word or step for step, so it was not made a new revision`
    : "Nothing changed: this is the same Flow as one the judge already refuted, so it was not made a new revision";
  return {
    ok: false,
    issueCodes: [code],
    feedback: {
      ok: false,
      code,
      unchanged: true,
      ...(standing ? { revision: standing.revision, digest: standing.digest } : {}),
      ...(lastTrial ? { lastTrial: { verdict: lastTrial.verdict, feedback: structuredClone(lastTrial.feedback) } } : {}),
      ...(refuted ? { judged: structuredClone(refuted) } : {}),
      instruction: `${same}. ${whatFailed(standing, lastTrial, refuted)}`
    }
  };
}

/** What failed last and the way out, in the words the trial gate uses for the same verdicts (`./trial-gate.ts`). */
function whatFailed(standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined, lastTrial: AutomationStudioCandidateTrialResult | undefined, refuted: JsonObject | undefined): string {
  if (refuted) {
    return "The judge found its trial did not do what the instruction asks (what it found is under judged), and submitting it again cannot change that: this exact Flow cannot be tested again or completed. "
      + `Change the Flow to fix what the judge found, submit the whole changed Flow with ${SUBMIT}, then test the new revision.`;
  }
  if (!lastTrial) {
    return `Revision ${standing?.revision} still stands and has not been tested: test it with ${TEST} using exactly that revision and digest, or change the Flow and submit the whole changed Flow.`;
  }
  if (lastTrial.verdict === "yes") {
    return `Its trial already answered yes: complete with exactly revision ${standing?.revision} and its digest.`;
  }
  return `Its last trial answered ${lastTrial.verdict}; what failed is under lastTrial (the step that stopped, and what it says happened). `
    + "Submitting the same Flow again cannot change that. Change the step that feedback names, or the steps that lead to it, and submit the whole changed Flow; "
    + `test the same revision again with ${TEST} only if that feedback says trying again may pass.`;
}
