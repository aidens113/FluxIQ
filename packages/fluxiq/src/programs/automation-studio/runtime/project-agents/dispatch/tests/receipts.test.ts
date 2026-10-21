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

  // t634: the port answers before the brief's gate weighs the trial; the gate's verdict is the one listed.
  it("carry the gate's verdict where the gate weighed the trial otherwise: a no the gate held unsure is listed unsure", async () => {
    const receipts = new AutomationStudioProjectDispatchReceipts("brief-1");
    const port = receipts.wrap(async () => result("no", { code: "candidate.trial_judged_no", stored: { rows: 3 } }, "run-1"));
    await port({} as AutomationStudioSubflowTrialRequest);
    expect(receipts.list()[0]).toMatchObject({ receiptId: "run-1", verdict: "no" });

    const unsure = result("unsure", { code: "candidate.trial_judged_no", contradictedByBuild: "Core's record of this build contradicts this no.", stored: { rows: 3 } }, "run-1");
    const remade = receipts.weighed(unsure);
    expect(remade).toMatchObject({ kind: "subflow_trial", receiptId: "run-1", verdict: "unsure", rows: 3 });
    const listed = receipts.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(remade);
    // Its digest binds what the gate answered, by the same rule as every reference.
    expect(listed[0]!.digest).toBe(automationStudioProjectDigest("project.subflow_trial_receipt.v1", { receiptId: "run-1", identity, revision: 1, digest: "b".repeat(64), verdict: "unsure", entryPrepared: true }));
    // Told once: the same answer again, or one for a trial the port has not answered since, changes nothing.
    expect(receipts.weighed(unsure)).toBeUndefined();
  });

  it("keep the port's reference where the gate's answer agrees or is about another trial", async () => {
    const receipts = new AutomationStudioProjectDispatchReceipts("brief-1");
    const port = receipts.wrap(async () => result("no", { code: "candidate.trial_judged_no" }, "run-1"));
    await port({} as AutomationStudioSubflowTrialRequest);
    const before = receipts.list();
    expect(receipts.weighed(result("no", { code: "candidate.trial_judged_no" }, "run-1"))).toBeUndefined();
    await port({} as AutomationStudioSubflowTrialRequest);
    expect(receipts.weighed({ ...result("unsure", {}, "run-1"), revision: 2 })).toBeUndefined();
    expect(receipts.list()[0]).toEqual(before[0]);
    expect(receipts.list().map((ref) => ref.verdict)).toEqual(["no", "no"]);
  });

  // t752: a trial's rows are its answer set's, never the sum of every set it stored.
  it("carry the answer set's rows where the feedback names them, not every set's sum", async () => {
    const receipts = new AutomationStudioProjectDispatchReceipts("brief-1");
    const port = receipts.wrap(async () => result("no", { code: "candidate.trial_judged_no", stored: { rows: 30, answerRows: 3 } }, "run-1"));
    await port({} as AutomationStudioSubflowTrialRequest);
    expect(receipts.list()[0]).toMatchObject({ receiptId: "run-1", verdict: "no", rows: 3 });
  });
});
