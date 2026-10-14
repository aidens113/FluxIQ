// A brief's return says why (t581). On the A8 bigbox run every brief came back
// "iteration_limit" or "Flow Bootstrap generation failed", and the supervisor
// resent the same briefs. The return now carries the builder's honest ending
// and what its last trial answered: the predecessor whose entry was missing,
// the step that failed and its code, or the judge's words.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowProposal, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import { gardenBrief } from "./dispatch-fixture.ts";

const brief = gardenBrief("b-read", "list_seeds");
const proposal: AutomationStudioSubflowProposal = { scope: { buildId: "build.1", briefId: "b-read", planDigest: brief.planDigest, subflowKey: "list_seeds" }, revision: 2, digest: "c".repeat(64), subflows: [], summary: "", changedPaths: [] };
const spend = { allowance: undefined, trials: [] };

function trial(verdict: AutomationStudioSubflowTrialResult["verdict"], entryPrepared: boolean, feedback: JsonObject): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, verdict, entryPrepared, feedback };
}

function outcome(change: Partial<AutomationStudioSubflowBuilderOutcome> & { result?: JsonObject; code?: string }): AutomationStudioSubflowBuilderOutcome {
  const loop = change.code
    ? { ok: false, code: change.code, trace: [], steps: [], accounting: {} }
    : { ok: true, result: change.result ?? {}, trace: [], steps: [], accounting: {} };
  const { result: _result, code: _code, ...rest } = change;
  return { loop: loop as unknown as AutomationStudioSubflowBuilderOutcome["loop"], proposal, trial: undefined, promotionAllowed: false, ...rest };
}

const MISSING = trial("execution_failed", false, { code: "subflow.trial_predecessor_missing", missing: ["sign_in"] });
const FAILED_STEP = trial("execution_failed", true, { code: "candidate.execution_incomplete", steps: [
  { step: 1, definitionId: "builtin.control.start", status: "succeeded" },
  { step: 2, definitionId: "builtin.control.call-subflow", status: "failed" },
  { step: 3, definitionId: "web.output.dom-click", label: "open the packet list", control: "Packets", status: "succeeded" },
  { step: 4, definitionId: "web.output.dom-click", label: "choose the packet", control: "Choose", status: "failed", failureCode: "web.target.not_found", happened: "The step's control was not found on the page." }
] });

describe("a brief's return reason", () => {
  it("carries the builder's honest ending and the predecessor whose entry was missing", () => {
    const returned = ending.built(brief, outcome({ result: { ended: "blocked", reason: "Its entry is never prepared." }, ended: { outcome: "blocked", reason: "Its entry is never prepared." }, lastTrial: MISSING, trial: MISSING }), spend);
    expect(returned).toMatchObject({ outcome: "blocked", proposal: { subflowKey: "list_seeds", revision: 2 } });
    expect(returned.reason).toBe("The builder ended this brief blocked: Its entry is never prepared. Its last trial, of revision 2, answered execution_failed (subflow.trial_predecessor_missing): its entry was never prepared, because no proposal of \"sign_in\" had passed its own trial, so this subflow's own steps were not tried.");
  });

  it("says a partial ending with no proposal standing as blocked", () => {
    const returned = ending.built(brief, outcome({ proposal: undefined, ended: { outcome: "partial", reason: "Nothing passed." } }), spend);
    expect(returned.outcome).toBe("blocked");
    expect(returned.reason).toBe("The builder ended this brief blocked: Nothing passed.");
  });

  it("names the subflow's own failing step, its control and code, past the trial's frame steps", () => {
    const returned = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: FAILED_STEP }), spend);
    expect(returned.outcome).toBe("partial");
    expect(returned.reason).toBe("The builder stopped before completing (llm_evidence_loop.iteration_limit). Its last trial, of revision 2, answered execution_failed (candidate.execution_incomplete): step 4 \"choose the packet\" on \"Choose\" failed with web.target.not_found (The step's control was not found on the page.).");
  });

  it("names a failed or stale predecessor, and quotes the judge on a no", () => {
    const failed = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: trial("execution_failed", false, { code: "subflow.trial_predecessor_failed", failedPredecessor: "sign_in" }) }), spend);
    expect(failed.reason).toContain("because the predecessor subflow \"sign_in\" failed while preparing it");
    const stale = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: trial("execution_failed", false, { code: "subflow.trial_predecessor_stale", stale: ["sign_in"] }) }), spend);
    expect(stale.reason).toContain("because the proposal of \"sign_in\" was made against another plan");
    const judged = trial("no", true, { code: "candidate.trial_judged_no", judge: { observed: "The list showed no packets." } });
    const no = ending.built(brief, outcome({ result: { subflowKey: "list_seeds" }, trial: judged }), spend);
    expect(no.reason).toBe("The builder completed revision 2, but its latest trial answered no. Its last trial, of revision 2, answered no (candidate.trial_judged_no): the judge said \"The list showed no packets.\".");
  });

  it("keeps a passing brief's return as it was, and says nothing of a trial that never ran", () => {
    const yes = trial("yes", true, {});
    expect(ending.built(brief, outcome({ result: {}, trial: yes, lastTrial: yes }), spend)).toMatchObject({ outcome: "done", reason: "Revision 2 of the subflow was tried on its own and its trial answered yes." });
    expect(ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit" }), spend).reason).toBe("The builder stopped before completing (llm_evidence_loop.iteration_limit).");
  });
});
