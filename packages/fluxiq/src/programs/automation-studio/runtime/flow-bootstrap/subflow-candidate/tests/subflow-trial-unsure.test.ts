// An unsure trial says that testing the same revision again is allowed while
// retests are left (t632), and the better move only where Core's record
// contradicts what kept it from a yes (t641). A8 wave 8 `run-mv9gbsm5-2957581c`
// (0051-0054): a builder followed an unsure trial's no-reading back to a
// revision already judged no instead of testing again. A8 wave 14 candidate
// towels `run-mv9ul5dy-e9a1b1c1` (0083): a re-test called the better move
// because one judge said yes spent the last trial on a wrong revision.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION } from "../../candidate/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 3, digest: "e".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function unsure(request: AutomationStudioSubflowTrialRequest, feedback: JsonObject = {}): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed", ...feedback }, entryPrepared: true };
}

/** A split's feedback: one call's yes, the other's no, and nothing of Core's record against the no. */
const SPLIT: JsonObject = {
  unconfirmedReading: { observed: "Two stored sites show only \"Open next weekend\"." },
  answeredReading: { observed: "Every stored site is open this weekend." }
};

describe("an unsure subflow trial", () => {
  it("says a re-test of the same revision stays allowed, but not the better move where nothing of Core's record contradicts the no, then, once retests run out, to change the subflow", async () => {
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request, SPLIT) });
    for (let trial = 1; trial < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION; trial += 1) {
      const ran = await gate.test(receipt);
      const evidence = ran.evidence as JsonObject;
      expect(ran.resultReason).toBe("retry_allowed");
      expect(evidence.retestsLeft).toBe(AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - trial);
      // One judge's yes is not one of Core's findings (t641).
      expect(evidence.retestAdvised).toBe(false);
      const told = String(evidence.instruction);
      expect(told).toContain("Testing this same revision again, with the same revision and digest, stays allowed");
      expect(told).toContain("Nothing in Core's record contradicts what kept this trial from a yes (retestAdvised is false)");
      expect(told).not.toContain("is the better move");
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"], feedback: { instruction: told, retestAdvised: false } });
    }
    const last = await gate.test(receipt);
    const told = String((last.evidence as JsonObject).instruction);
    expect(last.resultReason).toBeUndefined();
    expect(told).toContain("this revision has no retests left");
    expect(told).not.toContain("allowed");
    expect(last.evidence).not.toHaveProperty("retestAdvised");
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"], feedback: { instruction: told } });
  });

  it("calls a re-test the better move where Core's record wholly contradicts the no's reading, or the doubt", async () => {
    const contradicted: JsonObject = { unconfirmedReading: { observed: "Judge call 2 (contradicted by Core's record: ...): ...", recordContradicts: "whole" } };
    for (const feedback of [contradicted, { doubtContradicted: "Judge call 1 could not tell, saying the list has pages its read never reached; Core's record says otherwise." }]) {
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request, feedback) });
      const evidence = (await gate.test(receipt)).evidence as JsonObject;
      expect(evidence.retestAdvised).toBe(true);
      expect(String(evidence.instruction)).toContain("testing this same revision again, with the same revision and digest, is the better move");
    }
    // A reading the record contradicts only in part is no reason to test again unchanged.
    const part = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request, { unconfirmedReading: { observed: "...", recordContradicts: "part" } }) });
    expect(((await part.test(receipt)).evidence as JsonObject).retestAdvised).toBe(false);
  });

  it("is said in words naming no site, task or product", async () => {
    for (const feedback of [SPLIT, { doubtContradicted: "Core's record says otherwise." }]) {
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => unsure(request, feedback) });
      const told = String(((await gate.test(receipt)).evidence as JsonObject).instruction);
      expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|sponsored)\b/iu);
    }
  });
});
