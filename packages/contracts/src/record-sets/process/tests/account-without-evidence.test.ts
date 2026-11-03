// A public read's account holds neither the tested cells nor the evaluated condition (t841).
import { describe, expect, it } from "vitest";
import { automationStudioRecordProcessingAccountWithoutEvidence } from "../account-without-evidence.ts";
import { processAutomationStudioRecordRows } from "../process-rows.ts";

const produced = () => processAutomationStudioRecordRows({
  rows: [{ title: "Kept", shelf: "Open" }, { title: "Out", shelf: "Closed" }].map((values) => ({ values, nodeId: "read", batchKey: "one" })),
  schema: { schemaVersion: "0.1", fields: ["title", "shelf"].map((id) => ({ id, label: id, valueType: "string" as const })) },
  process: { where: [{ field: "shelf", equals: "Open" }] },
  now: 1
}).account;

describe("a processing account without its evidence", () => {
  it("drops the tested cell and the evaluated condition and keeps everything else", () => {
    const account = produced();
    const { conditions, ...counts } = automationStudioRecordProcessingAccountWithoutEvidence(account);
    expect(conditions).toEqual([{ field: "shelf", condition: account.conditions![0]!.condition, rejected: 1, alone: 1, leftOutOnlyByThis: [{ field: "title", label: "Out" }] }]);
    expect(counts.kept).toBe(account.kept);
    expect(counts.passes).toEqual(account.passes);
    expect(JSON.stringify(conditions)).not.toContain("Closed");
  });

  it("leaves the account it was given untouched, and one with no conditions as it is", () => {
    const account = produced();
    automationStudioRecordProcessingAccountWithoutEvidence(account);
    expect(account.conditions![0]!.leftOutOnlyByThis[0]!.tested).toEqual({ state: "present", value: "Closed" });
    const { conditions: _conditions, ...plain } = account;
    expect(automationStudioRecordProcessingAccountWithoutEvidence(plain)).toBe(plain);
  });
});
