// Each judged trial's advice reaches the judge of the brief's later trials,
// and of a later brief of the same subflow (t752, `../../../subflow-trial-gate.ts`,
// `../../../../candidate/earlier-advice-memory.ts`): the subflow gate keeps a judged
// no's advice as the builder was shown it, with Core's record and the plan that
// ran, hands the next revision's request what it named and whether the
// revision changed it, tells its port each kept advice (`weighed`), and is
// seeded from earlier briefs' (`earlierTrials`). A library's catalogue search:
// no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult, type AutomationStudioSubflowTrialWeighed } from "../../../index.ts";
import { testScope } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const READ_1 = `node.bootstrap.aa11bb22.${scope.subflowKey}.s3`;
const ADVICE = `Condition 1 of ${READ_1} keeps only books on the shelf; also accept books on hold.`;

function proposal(revision: number, status: unknown): AutomationStudioSubflowProposal {
  return {
    scope: { ...identity }, revision, digest: String(revision).repeat(64), summary: "Find the books.", changedPaths: [],
    subflows: [{ key: scope.subflowKey, nodes: [
      { key: "s1", parameters: { url: "https://catalogue.test" } },
      { key: "s3", parameters: { extract: { where: [{ field: "status", contains: status }, { field: "pages", atMost: 300 }], fields: { title: "title" } } } }
    ] }]
  } as unknown as AutomationStudioSubflowProposal;
}

const STANDING_NO = {
  stored: ["A Field Guide to Ferns"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
  conditions: [{ name: "condition 1 (status contains [\"On shelf\"])", nodeId: READ_1, number: 1 }, { name: "condition 2 (pages atMost 300)", nodeId: READ_1, number: 2 }]
};

function brief(first: AutomationStudioSubflowProposal, earlierTrials?: unknown[]) {
  let latest = first;
  const requests: AutomationStudioSubflowTrialRequest[] = [];
  const weighed: AutomationStudioSubflowTrialWeighed[] = [];
  const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
    requests.push(request);
    const base = { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true };
    if (request.proposal.revision === 1) return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { advice: ADVICE } }, standingNo: STANDING_NO } as AutomationStudioSubflowTrialResult;
    return { ...base, verdict: "yes", feedback: { judge: "Judged twice to do what the brief asks." } } as AutomationStudioSubflowTrialResult;
  };
  port.weighed = (trial) => { weighed.push(trial); };
  if (earlierTrials) port.earlierTrials = earlierTrials;
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => latest, port });
  return { gate, requests, weighed, submit: (next: AutomationStudioSubflowProposal) => { latest = next; } };
}

const receipt = (of: AutomationStudioSubflowProposal): JsonObject => ({ revision: of.revision, digest: of.digest });
const CHANGED = {
  revision: 1, verdict: "no", advice: ADVICE, followed: "changed",
  named: [`condition 1 (status contains ["On shelf"]) of step ${scope.subflowKey}.s3`],
  said: `After the trial of revision 1 (judged no) the judge advised: ${ADVICE} Revision 2 changed condition 1 (status contains ["On shelf"]) of step ${scope.subflowKey}.s3, which that advice named.`
};

describe("the judge of a subflow's later trial is told each earlier judged trial's advice (t752)", () => {
  it("carries trial 1's advice on trial 2's request, with Core's finding that revision 2 changed what it named", async () => {
    const { gate, requests, submit } = brief(proposal(1, "On shelf"));
    expect((await gate.test(receipt(proposal(1, "On shelf")))).resultCode).toBe("subflow.trial_no");
    expect(requests[0]).not.toHaveProperty("earlierAdvice");
    submit(proposal(2, ["On shelf", "On hold"]));
    expect((await gate.test(receipt(proposal(2, ["On shelf", "On hold"])))).resultCode).toBe("subflow.trial_yes");
    expect(requests[1]!.earlierAdvice).toEqual([CHANGED]);
  });

  it("tells its port each advice it kept, and a later brief's gate seeded with it carries it on its first request", async () => {
    const first = brief(proposal(1, "On shelf"));
    await first.gate.test(receipt(proposal(1, "On shelf")));
    const advised = first.weighed.flatMap((trial) => (trial.advised ? [trial.advised] : []));
    expect(advised).toHaveLength(1);
    expect(advised[0]).toMatchObject({ revision: 1, verdict: "no", advice: ADVICE });
    const later = brief(proposal(2, ["On shelf", "On hold"]), advised);
    await later.gate.test(receipt(proposal(2, ["On shelf", "On hold"])));
    expect(later.requests[0]!.earlierAdvice).toEqual([CHANGED]);
  });
  it("retains seeded advice when a rebrief restarts at the same revision, then keeps both trials", async () => {
    const first = brief(proposal(1, "On shelf"));
    await first.gate.test(receipt(proposal(1, "On shelf")));
    const seeded = first.weighed.flatMap((trial) => trial.advised ? [trial.advised] : []);
    const restart = proposal(1, ["On shelf", "On hold"]);
    const later = brief(restart, seeded);
    await later.gate.test(receipt(restart));
    expect(later.requests[0]!.earlierAdvice).toMatchObject([{ revision: 1, advice: ADVICE, followed: "changed" }]);
    const next = proposal(2, ["On shelf", "On hold"]);
    later.submit(next);
    await later.gate.test(receipt(next));
    expect(later.requests[1]!.earlierAdvice?.map((advice) => [advice.revision, advice.followed])).toEqual([[1, "changed"], [1, "unchanged"]]);
  });

});
