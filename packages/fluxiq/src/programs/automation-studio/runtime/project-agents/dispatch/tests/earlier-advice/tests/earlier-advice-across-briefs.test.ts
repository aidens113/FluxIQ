// A subflow's earlier judged trials' advice crosses its briefs (t752,
// `../../../trial-port.ts`): each advice a brief's gate kept, told to its port
// (`weighed`, `advised`), is kept for the build by subflow and plan, and a later
// brief of the same subflow and plan is handed the latest three as its gate is
// made (`earlierTrials`), as standing nos are (t634). Generic words only.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialResult } from "../../../../../flow-bootstrap/subflow-candidate/index.ts";
import { AutomationStudioProjectDispatchReceipts } from "../../../receipts.ts";
import { AutomationStudioProjectDispatchStandingNos } from "../../../standing-nos.ts";
import { automationStudioProjectDispatchTrialPort } from "../../../trial-port.ts";

function wrapped(advised: Map<string, unknown[]>, planDigest = "plan.1") {
  const port: AutomationStudioSubflowTrialPreparingPort = async () => { throw new Error("not asked"); };
  return automationStudioProjectDispatchTrialPort({
    port, scope: { subflowKey: "find_books", planDigest }, receipts: new AutomationStudioProjectDispatchReceipts("brief.1"),
    spend: { allowance: undefined, trials: [] }, standingNos: new AutomationStudioProjectDispatchStandingNos(), advised, remember: () => undefined
  });
}

const answer = (revision: number) => ({ partial: true, scope: "subflow", identity: { buildId: "b", briefId: "brief.1", planDigest: "plan.1", subflowKey: "find_books" }, revision, digest: `d${revision}`, verdict: "no", feedback: { code: "candidate.trial_judged_no" }, entryPrepared: true }) as AutomationStudioSubflowTrialResult;
const advice = (revision: number) => ({ revision, verdict: "no" as const, advice: `Advice after revision ${revision}.` });

describe("a subflow's earlier judged trials' advice across its briefs (t752)", () => {
  it("hands a later brief of the same subflow and plan the latest three its earlier briefs kept, and another plan none", () => {
    const advised = new Map<string, unknown[]>();
    const first = wrapped(advised);
    expect(first.earlierTrials).toBeUndefined();
    for (const revision of [1, 2, 3, 4]) first.weighed?.({ answer: answer(revision), advised: advice(revision) });
    first.weighed?.({ answer: answer(5) });
    expect(wrapped(advised).earlierTrials).toEqual([advice(2), advice(3), advice(4)]);
    expect(wrapped(advised, "plan.2").earlierTrials).toBeUndefined();
  });
});
