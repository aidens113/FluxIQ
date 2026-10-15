// A brief's return says why (t581). On the A8 bigbox run every brief came back
// "iteration_limit" or "Flow Bootstrap generation failed", and the supervisor
// resent the same briefs. The return now carries the builder's honest ending
// and what its last trial answered: the predecessor whose entry was missing,
// the step that failed and its code, or the judge's words.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowProposal, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/generation-failure/index.ts";
import { automationStudioCandidateRefusalCodes as refusalCodes } from "../../../service/candidate-failure/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import { gardenBrief } from "./dispatch-fixture.ts";

const brief = gardenBrief("b-read", "list_seeds");
const proposal: AutomationStudioSubflowProposal = { scope: { buildId: "build.1", briefId: "b-read", planDigest: brief.planDigest, subflowKey: "list_seeds" }, revision: 2, digest: "c".repeat(64), subflows: [], summary: "", changedPaths: [] };
const spend = { allowance: undefined, trials: [] };

function trial(verdict: AutomationStudioSubflowTrialResult["verdict"], entryPrepared: boolean, feedback: JsonObject): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, verdict, entryPrepared, feedback };
}

function outcome(change: Partial<AutomationStudioSubflowBuilderOutcome> & { result?: JsonObject; code?: string; failed?: JsonObject }): AutomationStudioSubflowBuilderOutcome {
  const loop = change.code
    ? { ok: false, code: change.code, trace: [], steps: [], accounting: {}, ...change.failed }
    : { ok: true, result: change.result ?? {}, trace: [], steps: [], accounting: {} };
  const { result: _result, code: _code, failed: _failed, ...rest } = change;
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

  it("names an invalid configuration's check, its figures and its sentence (t584, t588)", () => {
    const configuration = { check: "tool.description_length", values: { toolId: "core.submit_subflow", length: 2140, max: 2000 }, words: "The tool core.submit_subflow describes itself in 2140 characters; a tool may use at most 2000." };
    const returned = ending.built(brief, outcome({ proposal: undefined, code: "llm_evidence_loop.invalid_configuration", failed: { configuration } }), spend);
    expect(returned.outcome).toBe("blocked");
    expect(returned.reason).toBe("The builder stopped before completing (llm_evidence_loop.invalid_configuration). Its configuration was refused by the check tool.description_length (toolId \"core.submit_subflow\", length 2140, max 2000): The tool core.submit_subflow describes itself in 2140 characters; a tool may use at most 2000.");
  });

  it("names the guard and the calls a stopped loop stopped on, a run of the same answer counted, never the model's words (t588)", () => {
    const refused = { decision: "tool_call", toolId: "core.run_node", nodeId: "web.dom.type", resultCode: "web.action.rejected", resultReason: "not_at_start_location" };
    const trace = [
      { iteration: 1, decision: "tool_call", toolId: "web.page.read" },
      { iteration: 2, ...refused }, { iteration: 3, ...refused }, { iteration: 4, ...refused },
      { iteration: 5, decision: "tool_call", toolId: "core.run_node", nodeId: "web.dom.type", resultCode: "llm_evidence_loop.rejected.repeat_without_progress" },
      { iteration: 6, decision: "tool_call", toolId: "a tool the model named", resultCode: "llm_evidence_loop.unknown_tool" }
    ];
    const returned = ending.built(brief, outcome({ proposal: undefined, code: "llm_evidence_loop.repeat_without_progress", failed: { trace } }), spend);
    expect(returned.reason).toBe("The builder stopped before completing (llm_evidence_loop.repeat_without_progress). The calls it stopped on, latest first: tool_call answered llm_evidence_loop.unknown_tool; core.run_node on web.dom.type answered llm_evidence_loop.rejected.repeat_without_progress; core.run_node on web.dom.type answered web.action.rejected (not_at_start_location) (3 in a row).");
  });

  it("says what one of Core's own build failures thrown by the builder stopped on, and leaves any other throw as it was (bigbox debug C1)", () => {
    const thrown = new AutomationStudioFlowBootstrapGenerationError({
      code: "flow_bootstrap.evidence_repeat_without_progress", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received",
      issueCodes: ["llm_evidence_loop.repeat_refused"],
      evidenceLoop: { iterationCount: 3, decisionCount: 3, toolCallCount: 3, evidenceBytes: 10, steps: [
        { toolId: "core.run_node", iteration: 1, nodeId: "web.dom.type", resultCode: "web.action.rejected", resultReason: "not_at_start_location" },
        { toolId: "core.run_node", iteration: 2, nodeId: "web.dom.type", resultCode: "web.action.rejected", resultReason: "not_at_start_location" }
      ] }
    });
    const returned = ending.thrown(brief, thrown, false, spend);
    expect(returned).toMatchObject({ outcome: "blocked" });
    expect(returned.reason).toBe("The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused. The calls it stopped on, latest first: core.run_node on web.dom.type answered web.action.rejected (not_at_start_location) (2 in a row).");
    expect(ending.thrown(brief, new Error("The page closed."), false, spend).reason).toBe("The builder failed: The page closed.");
  });

  // A8 wave 7 `run-mv9dd0fk-8cd2e522` (t630): "core.submit_subflow answered subflow.scope_refused:b54daa6d (3 in a row)" hid
  // `subflow.input_unread` behind the digest, and the supervisor amended the plan without knowing the input was the cause.
  it("says a refused submission's run by its issue codes and the unread input's name, with the plan's advice, where the stop's codes carry them", () => {
    const opening = gardenBrief("b-open", "open_packet");
    const submitted = { toolId: "core.submit_subflow", resultCode: "subflow.scope_refused:b54daa6d" };
    const carried = refusalCodes.encode({ refusals: 3, sentAgain: 0, family: "subflow.scope_refused", issues: [{ code: "subflow.input_unread", path: "flow.line.3" }] });
    const failure = (issueCodes: string[]) => new AutomationStudioFlowBootstrapGenerationError({
      code: "flow_bootstrap.evidence_repeat_without_progress", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received",
      issueCodes,
      evidenceLoop: { iterationCount: 4, decisionCount: 4, toolCallCount: 4, evidenceBytes: 10, steps: [
        { toolId: "core.run_node", iteration: 1, nodeId: "web.output.dom-extract_list", resultCode: "web.inspect.succeeded" },
        { ...submitted, iteration: 2 }, { ...submitted, iteration: 3 }, { ...submitted, iteration: 4 }
      ] }
    });
    const returned = ending.thrown(opening, failure([...carried, "llm_evidence_loop.repeat_refused"]), false, spend);
    expect(returned).toMatchObject({ outcome: "blocked" });
    expect(returned.reason).toBe("The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused. "
      + "The calls it stopped on, latest first: core.submit_subflow answered subflow.scope_refused (subflow.input_unread: input \"packet\") (3 in a row); core.run_node on web.output.dom-extract_list answered web.inspect.succeeded. "
      + "The plan gives this subflow a value no step of it reads: change the plan with project.amend_plan, so that it takes only values a step of it types or opens, or carry its parts in the subflow that reads that value.");
    expect(returned.reason).not.toContain("b54daa6d");
    expect(returned.reason).not.toContain("candidate.last_submission");
    // With no issue carried, the code is said as it was, and no advice is given.
    expect(ending.thrown(opening, failure(["llm_evidence_loop.repeat_refused"]), false, spend).reason).toContain("core.submit_subflow answered subflow.scope_refused:b54daa6d (3 in a row); core.run_node");
    expect(ending.thrown(opening, failure(["llm_evidence_loop.repeat_refused"]), false, spend).reason).not.toContain("project.amend_plan");
  });
});

// A8 social `run-mv8ic6mk-09bf12ff` (t611): a builder whose latest proposal had passed its trial was refused the shape of
// its completion until its loop stopped, and came back partial, so the supervisor amended a subflow that had passed. A
// standing yes is Core's receipt: the brief is done however its loop stopped, and a return that is not done says a yes.
describe("a brief whose latest proposal has a standing yes", () => {
  const yes = trial("yes", true, {});
  const receipts = { allowance: undefined, trials: [{ kind: "subflow_trial" as const, receiptId: "receipt.b-read.1", digest: "e".repeat(64) }] };
  const DONE = "Revision 2 of the subflow was tried on its own and its trial answered yes. The brief is done on that trial's receipt, though the builder did not complete with it.";

  it("is done with its receipt when the builder was stopped by ending-shape refusals", () => {
    const refusedShape = { decision: "complete", resultCode: "subflow.ending_shape" };
    const returned = ending.built(brief, outcome({ code: "llm_evidence_loop.repeat_without_progress", failed: { exhaustion: { lastIssueCodes: ["subflow.ending_shape"] }, trace: [refusedShape, refusedShape] }, trial: yes, lastTrial: yes }), receipts);
    expect(returned).toMatchObject({ outcome: "done", proposal: { subflowKey: "list_seeds", revision: 2, digest: proposal.digest }, trials: receipts.trials });
    expect(returned.reason).toBe(`${DONE} The builder stopped before completing (llm_evidence_loop.repeat_without_progress). It was stopped by subflow.ending_shape. The calls it stopped on, latest first: complete answered subflow.ending_shape (2 in a row).`);
  });

  it("is done with its receipt when the builder ran out of turns or of allowance", () => {
    const limit = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", trial: yes, lastTrial: yes }), receipts);
    expect(limit).toMatchObject({ outcome: "done", proposal: { revision: 2, digest: proposal.digest }, trials: receipts.trials });
    expect(limit.reason).toBe(`${DONE} The builder stopped before completing (llm_evidence_loop.iteration_limit).`);
  });

  it("is done when the builder ended it honestly, and a clean receipt reads as it did", () => {
    const ended = ending.built(brief, outcome({ result: { ended: "partial", reason: "Unsure it is right." }, ended: { outcome: "partial", reason: "Unsure it is right." }, trial: yes, lastTrial: yes }), spend);
    expect(ended).toMatchObject({ outcome: "done", reason: `${DONE} The builder then ended it partial: Unsure it is right.` });
    expect(ending.built(brief, outcome({ result: {}, trial: yes, lastTrial: yes }), spend).reason).toBe("Revision 2 of the subflow was tried on its own and its trial answered yes.");
  });

  it("is not done for a yes whose entry was not prepared, or a yes of another proposal", () => {
    const unprepared = trial("yes", false, { code: "subflow.trial_predecessor_missing", missing: ["sign_in"] });
    expect(ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", trial: unprepared, lastTrial: unprepared }), spend).outcome).toBe("partial");
    const other = { ...yes, digest: "f".repeat(64) };
    expect(ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", trial: other }), spend).outcome).toBe("partial");
  });

  it("is done on a throw by the same check, and a throw with no such yes says its failure first as before", () => {
    const failure = new AutomationStudioFlowBootstrapGenerationError({
      code: "flow_bootstrap.evidence_repeat_without_progress", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received",
      issueCodes: ["llm_evidence_loop.repeat_refused"]
    });
    const thrownDone = ending.thrown(brief, failure, false, { ...receipts, accepted: proposal, trial: yes });
    expect(thrownDone).toMatchObject({ outcome: "done", proposal: { subflowKey: "list_seeds", revision: 2, digest: proposal.digest }, trials: receipts.trials });
    expect(thrownDone.reason).toBe(`${DONE} The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused.`);
    // No yes, a yes of another brief, or a yes whose entry was not prepared: today's return.
    for (const trialOf of [undefined, trial("unsure", true, {}), { ...yes, identity: { ...yes.identity, briefId: "b-other" } }, trial("yes", false, {})]) {
      const returned = ending.thrown(brief, failure, false, { ...receipts, accepted: proposal, trial: trialOf });
      expect(returned).toMatchObject({ outcome: "partial", proposal: { revision: 2 } });
      expect(returned.reason).toBe("The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused.");
    }
  });

  it("says a last yes of a revision the builder then replaced, where the return once said nothing", () => {
    const older = { ...yes, revision: 1, digest: "a".repeat(64) };
    const returned = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", trial: undefined, lastTrial: older }), spend);
    expect(returned.outcome).toBe("partial");
    expect(returned.reason).toBe("The builder stopped before completing (llm_evidence_loop.iteration_limit). Its last trial, of revision 1, answered yes, but revision 2 was submitted after it and was never tried.");
  });
});
