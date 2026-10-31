// The subflow test takes no revision and digest to mean the latest proposal
// (K7); a supplied pair must still be the latest, and one of the two alone is
// refused with an instruction. Neither is needed for a run from a step either.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest } from "../../../index.ts";
import { testScope } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };

function gateWith(latest: AutomationStudioSubflowProposal | undefined, ran: number[]) {
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => latest && structuredClone(latest), port: async (request: AutomationStudioSubflowTrialRequest) => {
    ran.push(request.proposal.revision);
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: { said: "ok" }, entryPrepared: true };
  } });
}

describe("the subflow test's latest default", () => {
  it("tests the latest proposal where neither revision nor digest is given", async () => {
    const ran: number[] = [];
    const answer = await gateWith(proposal, ran).test({});
    expect(ran).toEqual([2]);
    expect(answer.evidence).toMatchObject({ revision: 2, digest: proposal.digest });
  });

  it("does not require the pair, and says so in the tool's words", () => {
    const gate = gateWith(proposal, []);
    expect(gate.tool.inputSchema).not.toHaveProperty("required");
    expect(String(gate.tool.description)).toContain("Leave revision and digest out");
  });

  it("refuses a supplied pair that is not the latest exactly as before", async () => {
    const ran: number[] = [];
    const gate = gateWith(proposal, ran);
    for (const stale of [{ revision: 1, digest: proposal.digest }, { revision: 2, digest: "a".repeat(64) }]) {
      const answer = await gate.test(stale);
      expect(answer.evidence).toMatchObject({ ok: false, code: "subflow.trial_stale_revision", latestRevision: 2, latestDigest: proposal.digest });
    }
    expect(ran).toEqual([]);
  });

  it("refuses one of the two with an instruction to give both or neither", async () => {
    const ran: number[] = [];
    const gate = gateWith(proposal, ran);
    for (const half of [{ revision: 2 }, { digest: proposal.digest }]) {
      const answer = await gate.test(half);
      expect(answer.evidence).toMatchObject({ ok: false, code: "subflow.trial_input_invalid" });
      expect(String((answer.evidence as JsonObject).instruction)).toContain("both revision and digest");
    }
    expect(ran).toEqual([]);
  });

  it("answers as before with no proposal", async () => {
    const answer = await gateWith(undefined, []).test({});
    expect(answer.evidence).toMatchObject({ ok: false, code: "subflow.trial_stale_revision" });
    expect(String((answer.evidence as JsonObject).instruction)).toContain("no valid latest proposal");
  });
});
