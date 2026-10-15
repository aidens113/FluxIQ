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

  // A8 frozen pair 3 `run-mv9zn5ob-d929084d` (t645, with t647): every trial met a page its builder never explored, because
  // the trial's start undid an act made while exploring, and the supervisor never heard Core's finding of it.
  it("carries each of Core's own findings of the last trial in Core's words, after the trial's account", () => {
    const said = "act-4 (press \"Choose this bed\" button, call c12) was made while this brief explored, and the start reset took it back before this trial; no step of this subflow, nor of a subflow run before it, does it.";
    const finding = { code: "trial.explored_on_absorbed_act", act: "act-4", did: "press \"Choose this bed\" button", call: "c12", said };
    const judged = trial("no", true, { code: "candidate.judge_no", judge: { observed: "The packet was planted in the wrong bed." }, coreFindings: [finding, { code: "has a space", said: "never said" }, { code: "trial.other" }] });
    const returned = ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: judged }), spend);
    expect(returned.reason).toBe("The builder stopped before completing (llm_evidence_loop.iteration_limit). Its last trial, of revision 2, answered no (candidate.judge_no): the judge said \"The packet was planted in the wrong bed.\"."
      + ` Core found (trial.explored_on_absorbed_act): ${said}`);
    // Beside a failed step too, and nothing when the feedback carries none.
    const failed = trial("execution_failed", true, { ...FAILED_STEP.feedback, coreFindings: [finding] });
    expect(ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: failed }), spend).reason).toMatch(/failed with web\.target\.not_found \(.*\)\. Core found \(trial\.explored_on_absorbed_act\): act-4 /u);
    expect(ending.built(brief, outcome({ code: "llm_evidence_loop.iteration_limit", lastTrial: FAILED_STEP }), spend).reason).not.toContain("Core found");
  });

  // A8 frozen pair 3 `run-mv9zn5ob-d929084d` (t645): fourteen refusals of an output no step could make came back as codes
  // that never named the output or said the plan was at fault.
  it("says an output refused as no value by its interface name, with the plan's advice to drop it and keep after", () => {
    const producer = gardenBrief("b-open", "open_packet", [], (value) => {
      value.interface = { inputs: [], outputs: [{ id: "bedName", name: "Bed name", valueType: { kind: "unknown" } }] };
    });
    const submitted = { toolId: "core.submit_subflow", resultCode: "subflow.scope_refused:0a1b2c3d" };
    const carried = refusalCodes.encode({ refusals: 4, sentAgain: 0, family: "subflow.scope_refused", issues: [{ code: "subflow.output_not_a_value", path: "flow.output.bedName" }] });
    const stopped = ending.built(producer, outcome({ proposal: undefined, code: "llm_evidence_loop.repeat_refused", failed: { exhaustion: { lastIssueCodes: [...carried, "llm_evidence_loop.repeat_refused"] }, trace: [submitted, submitted] } }), spend);
    expect(stopped.outcome).toBe("blocked");
    expect(stopped.reason).toBe("The builder stopped before completing (llm_evidence_loop.repeat_refused). It was stopped by llm_evidence_loop.repeat_refused. "
      + "The calls it stopped on, latest first: core.submit_subflow answered subflow.scope_refused (subflow.output_not_a_value: output \"bedName\") (2 in a row). "
      + "The plan asks this subflow to hand on output \"bedName\", a value none of its steps makes: if a later subflow needs only what this one leaves on the target, "
      + "change the plan with project.amend_plan to drop the value and keep the later subflow after this one; otherwise send a changed brief saying where on the target this subflow reads it.");
    // An output the brief's interface does not hand on is not named, and no advice is given for it.
    const unknown = refusalCodes.encode({ refusals: 2, sentAgain: 0, family: "subflow.scope_refused", issues: [{ code: "subflow.output_unknown_port", path: "flow.output.other" }] });
    const other = ending.built(producer, outcome({ proposal: undefined, code: "llm_evidence_loop.repeat_refused", failed: { exhaustion: { lastIssueCodes: unknown }, trace: [submitted] } }), spend);
    expect(other.reason).toContain("subflow.scope_refused (subflow.output_unknown_port)");
    expect(other.reason).not.toContain("project.amend_plan");
    // Core's own stop names the output and gives the same advice.
    expect(ending.outputStopped("bedName", ["subflow.output_unknown_port", "subflow.output_not_a_value"])).toBe("Core stopped this brief: core.submit_subflow refused output \"bedName\" under two different bindings (subflow.output_unknown_port, subflow.output_not_a_value), so another binding would only be refused again. "
      + "The plan asks this subflow to hand on output \"bedName\", a value none of its steps makes: if a later subflow needs only what this one leaves on the target, "
      + "change the plan with project.amend_plan to drop the value and keep the later subflow after this one; otherwise send a changed brief saying where on the target this subflow reads it.");
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
