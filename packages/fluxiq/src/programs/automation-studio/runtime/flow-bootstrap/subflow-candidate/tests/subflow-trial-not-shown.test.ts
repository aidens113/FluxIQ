// t661, as the whole candidate's gate (`../../candidate/tests/trial-gate-not-shown.test.ts`): a subflow trial that
// stopped at a control on the page but not shown is told to change the steps that lead to it, and one the port did
// not start because the purse cannot pay both judge calls is no trial.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "f".repeat(64), subflows: [], summary: "Choose a branch", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function answered(request: AutomationStudioSubflowTrialRequest, verdict: AutomationStudioSubflowTrialResult["verdict"], feedback: JsonObject, entryPrepared: boolean): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict, feedback, entryPrepared };
}

describe("a subflow trial that stopped at a control on the page but not shown", () => {
  it("is told a step before it must show it, and to resubmit the subflow, never to test the same revision unchanged", async () => {
    const feedback = { code: "candidate.execution_incomplete", partial: true, steps: [
      { step: 1, status: "succeeded", label: "open the branch list" },
      { step: 2, status: "failed", label: "make Eastside my branch", targetNotShown: true }
    ] };
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => answered(request, "execution_failed", feedback, true) });
    const told = String(((await gate.test(receipt)).evidence as JsonObject).instruction);
    expect(told).toMatch(/^Step 2 \("make Eastside my branch"\) found its control on the page, but the control was not shown/u);
    expect(told).toContain("submit the subflow with core.submit_subflow, then test the new revision");
    expect(told).not.toMatch(/test this same revision again/u);
  });
});

describe("a subflow trial the purse cannot judge", () => {
  it("is refused without a retry reason, counts no trial, keeps no verdict and tells the port no verdict", async () => {
    const weighed: unknown[] = [];
    const port = Object.assign(async (request: AutomationStudioSubflowTrialRequest) => answered(request, "not_judged", { code: "subflow.trial_unaffordable", judgeCalls: 2, refusedBy: "llm_budget.run_cost_limit", leftUsd: 0.004 }, false),
      { weighed: (answer: unknown) => { weighed.push(answer); } });
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port });
    const result = await gate.test(receipt);
    expect(result).toMatchObject({ resultCode: "subflow.trial_unaffordable", effectApplied: false, evidence: { ok: false, code: "subflow.trial_unaffordable", notRun: { leftUsd: 0.004 } } });
    expect(result.resultReason).toBeUndefined();
    expect(String((result.evidence as JsonObject).instruction)).not.toMatch(/entry/iu);
    expect(weighed).toEqual([]);
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
  });
});
