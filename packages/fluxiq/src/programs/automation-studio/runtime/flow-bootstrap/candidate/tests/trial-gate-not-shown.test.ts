// t661. A8 bigbox cart (`run-mvac0ddx-f52ba929`): a trial stopped at a step whose control was found but hidden -- the
// menu holding it had been closed again -- and the gate said the step was right and to test the same revision again.
// A stop whose feedback says `targetNotShown` is now told to change the steps that lead to it. A8 towels
// (`run-mvac0nmw-52ed30b2`, fix 8): a trial ran the site and paid one judge call it could not confirm; a trial the
// port did not start because the purse cannot pay both judge calls is no trial, and is refused without a retry reason.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, automationStudioCandidateNotShownInstruction, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../index.ts";

const candidate = { revision: 5, digest: "a1b2c3d4" } as unknown as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: 5, digest: "a1b2c3d4" };

/** A trial that stopped at step 3 of a hardware store's Flow, its control measured on the page but not shown. */
const stoppedHidden: AutomationStudioCandidateTrialResult = {
  revision: 5, digest: "a1b2c3d4", verdict: "execution_failed", trialRunId: "trial.1",
  feedback: { code: "candidate.execution_incomplete", steps: [
    { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
    { step: 2, definitionId: "web.output.dom-click", label: "open the aisle menu", status: "succeeded" },
    { step: 3, definitionId: "web.output.dom-click", label: "choose the paint aisle", status: "failed", failureCode: "web.target.not_shown", targetNotShown: true, retryable: false }
  ] }
};

describe("a trial that stopped at a control on the page but not shown", () => {
  it("is told to change the steps that lead to it, never to test the same revision unchanged", async () => {
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.store", port: async () => structuredClone(stoppedHidden) } });
    const evidence = (await gate.test(receipt)).evidence as JsonObject;
    const told = String(evidence.instruction);
    expect(told).toMatch(/^Step 3 \("choose the paint aisle"\) found its control on the page, but the control was not shown/u);
    expect(told).toContain("A step before it must show it");
    expect(told).toContain("submit the whole candidate, then test the new revision");
    expect(told).not.toMatch(/test this same revision again|Nothing in your script needs to change/u);
    expect(gate.completion({ revision: 5, digest: "a1b2c3d4" })).toMatchObject({ ok: false, feedback: { instruction: told } });
  });

  it("says nothing of it for any other stop, and names the subflow's own resubmission when asked", () => {
    const onPage = { ...stoppedHidden, feedback: { steps: [{ step: 3, status: "failed", targetOnPage: true }] } };
    expect(automationStudioCandidateNotShownInstruction(onPage)).toBeUndefined();
    expect(automationStudioCandidateNotShownInstruction({ ...stoppedHidden, verdict: "no" })).toBeUndefined();
    expect(automationStudioCandidateNotShownInstruction(stoppedHidden, "submit the subflow with core.submit_subflow")).toContain("submit the subflow with core.submit_subflow, then test");
  });
});

describe("a trial the purse cannot judge", () => {
  const unaffordable: AutomationStudioCandidateTrialResult = {
    revision: 5, digest: "a1b2c3d4", verdict: "not_judged",
    feedback: { code: "candidate.trial_unaffordable", judgeCalls: 2, judgeCallUsd: 0.0054, neededUsd: 0.0108, refusedBy: "llm_budget.run_cost_limit", leftUsd: 0.006 }
  };

  it("is refused without a retry reason, counts no trial and keeps no verdict", async () => {
    let asked = 0;
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.store", port: async () => {
      asked += 1;
      return structuredClone(unaffordable);
    } } });
    const answered = await gate.test(receipt);
    expect(answered).toMatchObject({ resultCode: "candidate.trial_unaffordable", effectApplied: false, targetsUnchanged: true });
    expect(answered.resultReason).toBeUndefined();
    expect(answered.evidence).toMatchObject({ ok: false, code: "candidate.trial_unaffordable", notRun: { neededUsd: 0.0108, leftUsd: 0.006 } });
    expect(String((answered.evidence as JsonObject).instruction)).toContain("do not test again");
    // No trial was counted: completion still asks for one, and the retest bound is untouched.
    expect(gate.completion({ revision: 5, digest: "a1b2c3d4" })).toMatchObject({ ok: false, issueCodes: ["candidate.trial_required"] });
    for (let more = 0; more < 4; more += 1) expect((await gate.test(receipt)).resultCode).toBe("candidate.trial_unaffordable");
    expect(asked).toBe(5);
  });
});
