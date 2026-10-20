// An offline trial at the subflow trial gate (traces and offline trials,
// Decisions 3 and 6), as at the whole gate: no start hook and no site reset,
// and its yes is evidence only, never the yes that completes the brief.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../../environment/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION } from "../../candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

/** A gate whose port answers the verdicts given in turn under `kind`, with a start hook and a reset that count their calls. */
function gateOf(kind: AutomationStudioRunEnvironmentKind | undefined, verdicts: AutomationStudioSubflowTrialResult["verdict"][], whole?: true) {
  const calls = { trials: 0, hooks: 0, resets: 0, ran: 0 };
  const run = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    calls.trials += 1;
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: verdicts.shift() ?? "yes", feedback: { said: "ok" }, entryPrepared: true };
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, {
    environmentKind: kind,
    prepareStart: async () => {
      calls.hooks += 1;
      return "reset" as const;
    }
  });
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async () => {
      calls.resets += 1;
      return { kind: "admit" };
    },
    trialRan: () => {
      calls.ran += 1;
      return [];
    }
  };
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset, ...(whole ? { whole } : {}) });
  return { gate, calls };
}

describe("an offline trial at the subflow trial gate", () => {
  it("runs no start hook and no site reset, and records nothing it did as left on the site", async () => {
    const { gate, calls } = gateOf("trace", ["no"]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ trials: 1, hooks: 0, resets: 0, ran: 0 });
    expect(answered.evidence).toMatchObject({ verdict: "no", partial: true });
  });

  it("answers its yes as evidence, never keeps it, so the brief cannot complete on it, the judged whole run included", async () => {
    for (const whole of [undefined, true as const]) {
      const { gate } = gateOf("fixture", ["unsure", "yes"], whole);
      await gate.test(receipt);
      expect(gate.standing(proposal)?.verdict).toBe("unsure");
      const answered = await gate.test(receipt);
      expect(answered).toMatchObject({ resultCode: "subflow.trial_offline_yes", resultReason: "retry_allowed" });
      expect(answered.evidence).toMatchObject({ ok: false, verdict: "yes", retestsLeft: 1, instruction: AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION });
      expect(gate.standing(proposal)).toBeUndefined();
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
    }
  });

  it("treats a port with no kind, or a live one, as before: hook, reset, and a yes that completes", async () => {
    for (const kind of [undefined, "live" as const]) {
      const { gate, calls } = gateOf(kind, ["yes"]);
      const answered = await gate.test(receipt);
      expect(calls).toEqual({ trials: 1, hooks: 1, resets: 1, ran: 1 });
      expect(answered).toMatchObject({ resultCode: "subflow.trial_yes", evidence: { ok: true, verdict: "yes" } });
      expect(gate.completion(proposal)).toEqual({ ok: true });
    }
  });
});
