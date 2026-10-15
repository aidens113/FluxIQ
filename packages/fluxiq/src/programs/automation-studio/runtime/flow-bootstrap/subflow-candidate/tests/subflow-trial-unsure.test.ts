// An unsure trial says that testing the same revision again is allowed, and
// when it is the better move, while retests are left (t632). A8 wave 8
// `run-mv9gbsm5-2957581c` (0051-0054): a builder followed an unsure trial's
// no-reading back to a revision already judged no instead of testing again.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION } from "../../candidate/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 3, digest: "e".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function unsure(request: AutomationStudioSubflowTrialRequest): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed" }, entryPrepared: true };
}

describe("an unsure subflow trial", () => {
  it("says a re-test of the same revision is allowed and when it is the better move, then, once retests run out, to change the subflow", async () => {
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request) });
    for (let trial = 1; trial < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION; trial += 1) {
      const ran = await gate.test(receipt);
      const evidence = ran.evidence as JsonObject;
      expect(ran.resultReason).toBe("retry_allowed");
      expect(evidence.retestsLeft).toBe(AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - trial);
      const told = String(evidence.instruction);
      expect(told).toContain("Testing this same revision again, with the same revision and digest, is allowed");
      expect(told).toContain("it is the better move when the feedback names no defect");
      expect(told).toContain("one judge call said yes (answeredReading)");
      expect(told).toContain("would take back what answered an earlier no");
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"], feedback: { instruction: told } });
    }
    const last = await gate.test(receipt);
    const told = String((last.evidence as JsonObject).instruction);
    expect(last.resultReason).toBeUndefined();
    expect(told).toContain("this revision has no retests left");
    expect(told).not.toContain("is allowed");
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"], feedback: { instruction: told } });
  });

  it("is said in words naming no site, task or product", async () => {
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request) });
    const told = String(((await gate.test(receipt)).evidence as JsonObject).instruction);
    expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge)\b/iu);
  });
});
