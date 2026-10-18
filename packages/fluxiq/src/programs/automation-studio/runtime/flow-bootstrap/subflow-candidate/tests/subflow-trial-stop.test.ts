// The builder's gate says what stopped an execution-failed trial and closes a
// revision that stopped the same way twice (lane 3, `run-mvcvzwk1-c1d869e4`,
// steps 0083 and 0085: two whole tests answered `candidate.trial_port_failed`
// and nothing else, and the builder tested the same revision again, blind).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function answer(request: AutomationStudioSubflowTrialRequest, feedback: JsonObject): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "execution_failed", feedback, entryPrepared: true };
}
function gateWith(port: (request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioSubflowTrialResult>) {
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, whole: true });
}

/** A whole test's feedback as the single-subflow path carries it to the builder: the whole gate's, `stoppedBy` already in it. */
const wholeRunnerFailed: JsonObject = {
  code: "candidate.trial_port_failed",
  stoppedBy: { kind: "trial_runner", failure: "TypeError", said: "Core's own trial runner stopped with an error (TypeError) while running this trial or reading what it did, so no step of the Flow is named and no judge was asked." },
  wholeTest: { revision: 4, digest: "e".repeat(64), verdict: "execution_failed" }
};

describe("the subflow trial gate's execution-failed answers", () => {
  it("says the trial runner failed, never a step the feedback does not name, and closes the revision when it fails the same way again", async () => {
    let asked = 0;
    const gate = gateWith(async (request) => {
      asked += 1;
      return answer(request, structuredClone(wholeRunnerFailed));
    });
    const first = (await gate.test(receipt)).evidence as JsonObject;
    expect(first).toMatchObject({ verdict: "execution_failed", retestsLeft: 2, feedback: { stoppedBy: { kind: "trial_runner", failure: "TypeError" } } });
    expect(String(first.instruction)).toMatch(/^The subflow did not run to its end, so this revision cannot complete\. Core's own trial runner stopped/u);
    expect(String(first.instruction)).not.toContain("Read the feedback for the step that failed");
    const second = (await gate.test(receipt)).evidence as JsonObject;
    expect(second).toMatchObject({ verdict: "execution_failed", retestsLeft: 0, failedStep: { kind: "trial_runner" } });
    expect(String(second.instruction)).toContain("Core's trial runner failed the same way in two trials of this revision");
    expect((await gate.test(receipt)).evidence).toMatchObject({ ok: false, code: "subflow.trial_same_failure" });
    expect(asked).toBe(2);
    expect(gate.completion(proposal)).toMatchObject({ ok: false, feedback: { failedStep: { kind: "trial_runner" } } });
  });

  it("names the step a run stopped at, and closes the revision once it stops there the same way twice", async () => {
    const feedback: JsonObject = { code: "candidate.execution_incomplete", steps: [{ step: 3, definitionId: "web.output.dom-press", label: "open the next page", status: "failed", failureCode: "web.target.not_found", retryable: true }] };
    const gate = gateWith(async (request) => answer(request, structuredClone(feedback)));
    const first = (await gate.test(receipt)).evidence as JsonObject;
    expect(first).toMatchObject({ retestsLeft: 2, feedback: { stoppedBy: { kind: "step", step: 3, failureCode: "web.target.not_found" } } });
    expect(String(first.instruction)).toContain("Step 3 (\"open the next page\") failed and the run stopped there (web.target.not_found).");
    const second = (await gate.test(receipt)).evidence as JsonObject;
    expect(second).toMatchObject({ retestsLeft: 0, failedStep: { kind: "step", step: 3 } });
    expect(String(second.instruction)).toContain("This revision stopped at the same step with the same failure in two trials");
  });

  it("says a trial port of its own that threw failed, by kind only, and never that a subflow before this one did", async () => {
    const gate = gateWith(async () => { throw new TypeError("secret page text"); });
    const ran = (await gate.test(receipt)).evidence as JsonObject;
    expect(ran).toMatchObject({ verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_port_failed", stoppedBy: { kind: "trial_runner", failure: "TypeError" } } });
    expect(String(ran.instruction)).not.toContain("A subflow that runs before this one");
    expect(JSON.stringify(ran)).not.toContain("secret page text");
  });
});
