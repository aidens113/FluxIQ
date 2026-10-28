// The dispatcher's partial-trial port hands the gate's row check to the
// brief's own port as it is (t692, `../trial-port.ts`): without it, a yes over
// a read Core flagged would always be unsure, the gate having no check to ask.
// It also hands on the port's environment kind (F3) and offline-first check (trace plan P6, t769) as they are,
// and lists a trial the gate kept from the recording, which the port never answered, as the brief's trial.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { AutomationStudioProjectDispatchReceipts } from "../receipts.ts";
import { AutomationStudioProjectDispatchStandingNos } from "../standing-nos.ts";
import { automationStudioProjectDispatchTrialPort } from "../trial-port.ts";

function wrapped(port: AutomationStudioSubflowTrialPreparingPort) {
  return automationStudioProjectDispatchTrialPort({
    port, scope: { subflowKey: "approve", planDigest: "plan.1" }, receipts: new AutomationStudioProjectDispatchReceipts("brief.1"),
    spend: { allowance: undefined, trials: [] }, standingNos: new AutomationStudioProjectDispatchStandingNos(), remember: () => undefined
  });
}

describe("the dispatcher's partial-trial port", () => {
  it("hands the gate's row check to the brief's own port", async () => {
    const trial: AutomationStudioSubflowTrialPreparingPort = async () => { throw new Error("not asked"); };
    const asked: unknown[] = [];
    trial.checkRows = async (input) => {
      asked.push(input.trialRunId);
      return { converse: "confirmed" };
    };
    const port = wrapped(trial);
    expect(await port.checkRows?.({ scope: { buildId: "b", briefId: "brief.1", planDigest: "plan.1", subflowKey: "approve", predecessors: [], parts: [], interface: { inputs: [], outputs: [] } }, revision: 1, digest: "d", trialRunId: "trial.1", reads: [], signal: new AbortController().signal })).toEqual({ converse: "confirmed" });
    expect(asked).toEqual(["trial.1"]);
  });

  it("offers none where the brief's port has none", () => {
    expect(wrapped(async () => { throw new Error("not asked"); }).checkRows).toBeUndefined();
  });
});

const identity = { buildId: "b", briefId: "brief.1", planDigest: "plan.1", subflowKey: "approve" };
const kept = (verdict: AutomationStudioSubflowTrialResult["verdict"], trialRunId?: string): AutomationStudioSubflowTrialResult => ({
  partial: true, scope: "subflow", identity, revision: 1, digest: "d".repeat(64), verdict, feedback: { code: "candidate.trial_judged_no" }, entryPrepared: true, ...(trialRunId ? { trialRunId } : {})
});
const unused = (): AutomationStudioSubflowTrialPreparingPort => async () => { throw new Error("not asked"); };

describe("the dispatcher's partial-trial port, offline", () => {
  it("keeps the brief's port offline to the gate", () => {
    const trial: AutomationStudioSubflowTrialPreparingPort = unused();
    Object.assign(trial, { environmentKind: "trace" });
    expect(wrapped(trial).environmentKind).toBe("trace");
    expect(wrapped(unused()).environmentKind).toBeUndefined();
  });

  it("hands the offline-first check on unchanged", () => {
    const trial: AutomationStudioSubflowTrialPreparingPort = unused();
    const check = async () => ({ kind: "not_tried" });
    Object.assign(trial, { offlineFirst: check });
    expect(wrapped(trial).offlineFirst).toBe(check);
    expect(wrapped(unused()).offlineFirst).toBeUndefined();
  });

  it("lists a trial the gate kept from the recording as the brief's trial, remembered and the last heard", () => {
    const receipts = new AutomationStudioProjectDispatchReceipts("brief.1");
    const remembered: unknown[] = [];
    const spend: Parameters<typeof automationStudioProjectDispatchTrialPort>[0]["spend"] = { allowance: undefined, trials: [] };
    const told: unknown[] = [];
    const trial: AutomationStudioSubflowTrialPreparingPort = unused();
    trial.weighed = (weighed) => { told.push(weighed.answer.verdict); };
    const port = automationStudioProjectDispatchTrialPort({
      port: trial, scope: { subflowKey: "approve", planDigest: "plan.1" }, receipts, spend, standingNos: new AutomationStudioProjectDispatchStandingNos(), remember: (ref) => { remembered.push(ref); }
    });
    port.weighed?.({ answer: kept("no") });
    expect(receipts.list()).toMatchObject([{ kind: "subflow_trial", receiptId: "brief.1.trial-1", verdict: "no" }]);
    expect(remembered).toEqual(receipts.list());
    expect(spend.trial?.verdict).toBe("no");
    expect(told).toEqual(["no"]);
  });

  it("lists a port-answered trial once, the gate's verdict replacing the port's", async () => {
    const receipts = new AutomationStudioProjectDispatchReceipts("brief.1");
    const port = automationStudioProjectDispatchTrialPort({
      port: async () => kept("no", "run-1"), scope: { subflowKey: "approve", planDigest: "plan.1" }, receipts, spend: { allowance: undefined, trials: [] }, standingNos: new AutomationStudioProjectDispatchStandingNos(), remember: () => undefined
    });
    await port({ proposal: { scope: identity, revision: 1, digest: "d".repeat(64) } } as unknown as Parameters<typeof port>[0]);
    port.weighed?.({ answer: { ...kept("no", "run-1"), verdict: "unsure" } });
    expect(receipts.list()).toMatchObject([{ receiptId: "run-1", verdict: "unsure" }]);
  });
});
