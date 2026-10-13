// A candidate build that stalls tests its latest revision instead of ending,
// while that revision can still be tested (t477).
//
// Lane C round 10 (`run-mv5uu9g1-9d80deea`) stalled on a run of looks and
// ended the build at 114 s of 540 s, with revision 3 accepted, judged `unsure`
// once and two retests left, though one judge had said yes and the model had
// just confirmed what that judge saw. The user's rule: a build never gives up
// on a recoverable failure. So the loop's stall asks this
// (`../../llm/decision-handlers/stall-recovery.ts`), and the answer is the
// retest of the latest revision when the trial gate would run one
// (`./trial-gate.ts`, `retestable`): a revision not judged no, not failed the
// same way twice, not yet passed, with trials left.
//
// **Bounded.** One stall-run retest per revision and trial count: a stall
// again before any new trial of that revision -- the retest was refused for a
// reset, say -- ends the build, as does a revision with no retest left. The
// gate still bounds the trials themselves. Each ending carries the code that
// says why nothing was left (`candidate.stall_*`).

import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, type AutomationStudioFlowCandidateTrialGate } from "./trial-gate.ts";

/** The code a stall ends under when its retest was already run at this revision and trial count. */
export const AUTOMATION_STUDIO_CANDIDATE_STALL_RETESTED_CODE = "candidate.stall_retest_already_run";

/** The loop's `recoverStall` for a candidate build, reading `gate`. */
export function automationStudioCandidateStallRetest(gate: Pick<AutomationStudioFlowCandidateTrialGate, "retestable">): NonNullable<AutomationStudioLlmEvidenceLoopInput["recoverStall"]> {
  const ran = new Set<string>();
  return () => {
    const now = gate.retestable();
    if ("why" in now) return { endedBecause: now.why };
    const at = `${now.revision}\n${now.digest}\n${now.trials}`;
    if (ran.has(at)) return { endedBecause: AUTOMATION_STUDIO_CANDIDATE_STALL_RETESTED_CODE };
    ran.add(at);
    return { call: { toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, input: { revision: now.revision, digest: now.digest } } };
  };
}
