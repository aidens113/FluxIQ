// The dispatcher's partial-trial port hands the gate's row check to the
// brief's own port as it is (t692, `../trial-port.ts`): without it, a yes over
// a read Core flagged would always be unsure, the gate having no check to ask.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowTrialPreparingPort } from "../../../flow-bootstrap/subflow-candidate/index.ts";
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
