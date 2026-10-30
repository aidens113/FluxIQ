// What Core located in each judged trial reaches the judge of the build's later trials
// (t752, P5b, `../../../earlier-advice-memory.ts`): the whole-candidate gate keeps the
// defects Core located in a judged no's record, with the plan that ran, and hands the
// next revision's trial request what they trace to and whether the revision changed it.
// The judge's own advice is never kept. A library's catalogue search: no
// task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialRequest, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../../../index.ts";

const READ_1 = "node.bootstrap.aa11bb22.find_books.s3";
const ADVICE = `Condition 1 of ${READ_1} keeps only books on the shelf; also accept books on hold.`;
const LOCATED = 'Core located these defects in its record of that trial: it lacks "Ferns on Hold", which the request asks for.';

function candidate(revision: number, status: unknown): AutomationStudioFlowCandidate {
  const plan = { subflows: [{ key: "find_books", nodes: [
    { key: "s1", parameters: { url: "https://catalogue.test" } },
    { key: "s3", parameters: { extract: { where: [{ field: "status", contains: status }, { field: "pages", atMost: 300 }], fields: { title: "title" } } } }
  ] }] };
  return { revision, digest: String(revision).repeat(64), buildPlan: { plan } } as unknown as AutomationStudioFlowCandidate;
}

const STANDING_NO = {
  stored: ["A Field Guide to Ferns"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
  conditions: [{ name: "condition 1 (status contains [\"On shelf\"])", nodeId: READ_1, number: 1, leftOutAlone: ["Ferns on Hold"] }, { name: "condition 2 (pages atMost 300)", nodeId: READ_1, number: 2 }],
  located: [{ kind: "asked_missing", row: "Ferns on Hold" }]
};

function build(record: Record<string, unknown> = {}) {
  let latest = candidate(1, "On shelf");
  const requests: AutomationStudioCandidateTrialRequest[] = [];
  const port = async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
    requests.push(request);
    const base = { revision: request.revision, digest: request.digest };
    if (request.revision === 1) return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { observed: "Books on hold were left out.", advice: ADVICE } }, standingNo: { ...STANDING_NO, ...record } } as AutomationStudioCandidateTrialResult;
    return { ...base, verdict: "yes", feedback: { judge: "Judged twice to do what the instruction asks." } };
  };
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "candidate.library", port } });
  return { gate, requests, submit: (next: AutomationStudioFlowCandidate) => { latest = next; } };
}

const receipt = (of: AutomationStudioFlowCandidate): JsonObject => ({ revision: of.revision, digest: of.digest });

describe("the judge of a build's later trial is told each earlier judged trial's advice (t752)", () => {
  it("carries what Core located in trial 1 on trial 2's request, with Core's finding that revision 2 changed what it traces to", async () => {
    const { gate, requests, submit } = build();
    expect((await gate.test(receipt(candidate(1, "On shelf")))).resultCode).toBe("candidate.trial_no");
    expect(requests[0]).not.toHaveProperty("earlierAdvice");
    const next = candidate(2, ["On shelf", "On hold"]);
    submit(next);
    expect((await gate.test(receipt(next))).resultCode).toBe("candidate.trial_yes");
    expect(requests[1]!.earlierAdvice).toEqual([{
      revision: 1, verdict: "no", advice: LOCATED, followed: "changed",
      named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"],
      said: `After the trial of revision 1 (judged no) ${LOCATED} Revision 2 changed condition 1 (status contains ["On shelf"]) of step find_books.s3, which alone left a row out there.`
    }]);
    expect(JSON.stringify(requests[1]!.earlierAdvice)).not.toContain("also accept books on hold");
  });

  it("says unchanged where the next revision left what the advice named as it was", async () => {
    const { gate, requests, submit } = build();
    await gate.test(receipt(candidate(1, "On shelf")));
    const next = { ...candidate(2, "On shelf"), digest: "e".repeat(64) };
    submit(next);
    await gate.test(receipt(next));
    expect(requests[1]!.earlierAdvice?.[0]).toMatchObject({ revision: 1, followed: "unchanged" });
  });

  it("carries nothing of a no whose record located no defect, however the judge advised", async () => {
    const { gate, requests, submit } = build({ located: undefined });
    await gate.test(receipt(candidate(1, "On shelf")));
    const next = candidate(2, ["On shelf", "On hold"]);
    submit(next);
    await gate.test(receipt(next));
    expect(requests[1]).not.toHaveProperty("earlierAdvice");
  });

  it("keeps a Core no's record as it keeps a judge's: the advice it brings is Core's located defect, and its conditions stay kept", async () => {
    const { gate, requests, submit } = build({ source: "core", standing: [] });
    await gate.test(receipt(candidate(1, "On shelf")));
    const next = candidate(2, ["On shelf", "On hold"]);
    submit(next);
    await gate.test(receipt(next));
    expect(requests[1]!.earlierAdvice).toMatchObject([{ revision: 1, advice: LOCATED, followed: "changed" }]);
  });
});
