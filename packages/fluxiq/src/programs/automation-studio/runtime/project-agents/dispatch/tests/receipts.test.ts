// Each trial a brief ran is listed by its reference, with what it answered and
// the rows it stored beside it (t606), and the reference's digest is made as
// it always was, so a brief that copies the reference still names it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectDigest } from "../../contracts/index.ts";
import { AutomationStudioProjectDispatchReceipts } from "../receipts.ts";

const identity = { buildId: "build.garden", briefId: "brief-1", planDigest: "a".repeat(64), subflowKey: "main" };
const result = (verdict: AutomationStudioSubflowTrialResult["verdict"], feedback: JsonObject, trialRunId: string): AutomationStudioSubflowTrialResult => ({
  partial: true, scope: "subflow", identity, revision: 1, digest: "b".repeat(64), verdict, feedback, trialRunId, entryPrepared: true
});

describe("the receipts a brief's trials are listed by", () => {
  it("carry each trial's verdict and stored rows beside a digest made from the same fields as before", async () => {
    const answers = [result("unsure", { stored: { rows: 9 } }, "run-1"), result("execution_failed", { code: "candidate.trial_execution_failed" }, "run-2")];
    const receipts = new AutomationStudioProjectDispatchReceipts("brief-1");
    const port = receipts.wrap(async () => answers.shift()!);
    await port({} as AutomationStudioSubflowTrialRequest);
    await port({} as AutomationStudioSubflowTrialRequest);

    const listed = receipts.list();
    expect(listed.map(({ receiptId, verdict, rows }) => ({ receiptId, verdict, rows }))).toEqual([
      { receiptId: "run-1", verdict: "unsure", rows: 9 },
      // A trial whose feedback states no stored rows lists none.
      { receiptId: "run-2", verdict: "execution_failed", rows: undefined }
    ]);
    expect(listed[1]).not.toHaveProperty("rows");
    // The digest rule is unchanged: verdict and rows ride beside it and are not hashed a second time.
    expect(listed[0]!.digest).toBe(automationStudioProjectDigest("project.subflow_trial_receipt.v1", { receiptId: "run-1", identity, revision: 1, digest: "b".repeat(64), verdict: "unsure", entryPrepared: true }));
  });
});
