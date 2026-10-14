import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../candidate/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };

function answer(request: AutomationStudioSubflowTrialRequest, overrides: Partial<AutomationStudioSubflowTrialResult> = {}): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: { said: "ok" }, entryPrepared: true, ...overrides };
}

function gateWith(port?: (request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioSubflowTrialResult>) {
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port });
}

const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

describe("the subflow trial gate", () => {
  it("asks the port with the scope and the exact latest proposal, and keeps its partial verdict", async () => {
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const gate = gateWith(async (request) => {
      asked.push(request);
      return answer(request);
    });
    expect(gate.tool.toolId).toBe(AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID);
    const ran = await gate.test(receipt);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.scope).toEqual(scope);
    expect(asked[0]!.proposal).toEqual(proposal);
    expect(Object.isFrozen(asked[0]!.proposal)).toBe(true);
    expect(ran.evidence).toMatchObject({ ok: true, partial: true, verdict: "yes", subflowKey: "find_listing", promotionCredit: false, entryPrepared: true });
    expect(gate.standing(proposal)).toMatchObject({ partial: true, scope: "subflow", verdict: "yes" });
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });

  it("is no trial for the whole-candidate gate: a partial yes fed to its completion still answers candidate.trial_required", async () => {
    const gate = gateWith(async (request) => answer(request));
    await gate.test(receipt);
    const yes = gate.standing(proposal)!;
    expect(yes.verdict).toBe("yes");
    const candidate = { revision: yes.revision, digest: yes.digest } as AutomationStudioFlowCandidate;
    const whole = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.whole", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} }) } });
    const completion = whole.completion({ revision: yes.revision, digest: yes.digest });
    expect(completion).toMatchObject({ ok: false, issueCodes: ["candidate.trial_required"] });
  });

  it("refuses completion before a trial, after a no, and closes a proposal judged no", async () => {
    const gate = gateWith(async (request) => answer(request, { verdict: "no", feedback: { said: "wrong rows" } }));
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
    await gate.test(receipt);
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unchanged_after_no"] });
    expect(gate.refuted(proposal.digest)).toEqual({ said: "wrong rows" });
    expect((await gate.test(receipt)).resultCode).toBe("subflow.trial_unchanged_after_no");
  });

  it("answers a verdict about another brief, or another revision, as execution_failed", async () => {
    const otherBrief = gateWith(async (request) => answer(request, { identity: { ...identity, briefId: "brief-2" } }));
    expect((await otherBrief.test(receipt)).evidence).toMatchObject({ verdict: "execution_failed", feedback: { code: "subflow.trial_result_mismatch" } });
    const notPartial = gateWith(async (request) => ({ ...answer(request), partial: false }) as unknown as AutomationStudioSubflowTrialResult);
    expect((await notPartial.test(receipt)).evidence).toMatchObject({ verdict: "execution_failed", feedback: { code: "subflow.trial_result_invalid" } });
  });

  it("keeps a yes from an unprepared entry from completing, and lets it be tried again", async () => {
    const gate = gateWith(async (request) => answer(request, { entryPrepared: false }));
    const ran = await gate.test(receipt);
    expect(ran.resultReason).toBe("retry_allowed");
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_yes"] });
  });

  it("tests only the latest proposal, and says when no runner is here", async () => {
    expect((await gateWith(async (request) => answer(request)).test({ revision: 1, digest: proposal.digest })).resultCode).toBe("subflow.trial_stale_revision");
    const none = gateWith();
    expect((await none.test(receipt)).resultCode).toBe("subflow.trial_unavailable");
    expect(none.completion(proposal)).toEqual({ ok: true });
  });
});
