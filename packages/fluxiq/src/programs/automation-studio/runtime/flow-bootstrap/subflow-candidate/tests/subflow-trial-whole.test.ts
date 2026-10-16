// The subflow trial gate on a single-subflow plan's whole test, and a trial its
// port did not run (t679, `../subflow-trial-gate.ts`): the tool and a yes say
// the test is the build's judged run; a port's `notRun` answer is the gate's
// answer, its code, words and retry reason the port's, and nothing is counted,
// kept, weighed or reset after it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialNotRun, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const proposal: AutomationStudioSubflowProposal = { scope: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey }, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function answer(request: AutomationStudioSubflowTrialRequest, overrides: Partial<AutomationStudioSubflowTrialResult> = {}): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: {}, entryPrepared: true, ...overrides };
}

/** A reset that admits each trial, counting its asks and what it was told ran. */
function countingReset() {
  const counted = { before: 0, ran: 0 };
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async () => {
      counted.before += 1;
      return { kind: "admit" };
    },
    trialRan: () => {
      counted.ran += 1;
      return [];
    }
  };
  return { counted, reset };
}

describe("the subflow trial gate on a single-subflow plan's whole test", () => {
  it("says the test is the build's judged run, and a yes completes the brief", async () => {
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => answer(request), whole: true });
    expect(gate.tool.description).toContain("Core joins it into the whole Flow and runs that once from its start");
    expect(gate.tool.description).not.toContain("partial verdict");
    const ran = await gate.test(receipt);
    expect(ran.evidence).toMatchObject({ verdict: "yes", instruction: expect.stringContaining("it is the build's judged run") });
    expect(String((ran.evidence as JsonObject).instruction)).not.toContain("partial trial");
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });

  it("answers a trial its port did not run as the port's refusal: no verdict, nothing counted, kept, weighed or reset after it", async () => {
    let first = true;
    const weighed: unknown[] = [];
    const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
      if (!first) return answer(request);
      first = false;
      const notRun: AutomationStudioSubflowTrialResult & AutomationStudioSubflowTrialNotRun = { ...answer(request, { verdict: "not_judged", entryPrepared: false }), notRun: { code: "candidate.trial_reset_required", instruction: "Undo the listed acts, then test again.", detail: { actsToUndo: [{ act: "act-1" }] }, retry: true } };
      return notRun;
    };
    port.weighed = (trial) => weighed.push(trial);
    const { counted, reset } = countingReset();
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset, whole: true });
    const refused = await gate.test(receipt);
    expect(refused).toMatchObject({ effectApplied: false, resultCode: "candidate.trial_reset_required", resultReason: "retry_allowed" });
    expect(refused.evidence).toEqual({ ok: false, code: "candidate.trial_reset_required", instruction: "Undo the listed acts, then test again.", actsToUndo: [{ act: "act-1" }] });
    expect(gate.standing(proposal)).toBeUndefined();
    expect(weighed).toHaveLength(0);
    expect(counted).toEqual({ before: 1, ran: 0 });
    // Not counted: the same revision may still be tested as often as ever, and the next test is a trial.
    for (let index = 0; index < 3; index += 1) expect((await gate.test(receipt)).evidence).toMatchObject({ verdict: "yes" });
    expect(weighed).toHaveLength(3);
  });

  it("reads a notRun without a code or words as no account, and the result as the port gave it", async () => {
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: async (request) => ({ ...answer(request), notRun: { code: "", instruction: "" } }) });
    expect((await gate.test(receipt)).evidence).toMatchObject({ verdict: "yes" });
  });
});
