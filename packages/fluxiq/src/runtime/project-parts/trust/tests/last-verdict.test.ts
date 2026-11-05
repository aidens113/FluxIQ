import { describe, expect, it } from "vitest";
import { partTrustEvidenceFromRuns } from "../evidence.ts";
import { lastAutomationStudioPartVerdict } from "../last-verdict.ts";

const entry = (result: "confirmed" | "refuted" | "unverified", atMs: number) => ({ result, zeroModel: false, atMs });

describe("a version's last verdict", () => {
  it("is nothing when no run has said", () => {
    expect(lastAutomationStudioPartVerdict([])).toBeUndefined();
    expect(lastAutomationStudioPartVerdict([entry("unverified", 5)])).toBeUndefined();
  });

  it("is the newest verdict, whatever order the evidence comes in", () => {
    expect(lastAutomationStudioPartVerdict([entry("confirmed", 1), entry("confirmed", 2), entry("refuted", 3)])).toBe("failed");
    expect(lastAutomationStudioPartVerdict([entry("refuted", 3), entry("confirmed", 4), entry("unverified", 9)])).toBe("passed");
  });

  it("reads a failure and a success at one instant as a failure", () => {
    expect(lastAutomationStudioPartVerdict([entry("confirmed", 3), entry("refuted", 3)])).toBe("failed");
  });
});

describe("a part run's evidence", () => {
  it("is the verdict a judged run left, and a judged yes at zero model calls is a replay", () => {
    expect(partTrustEvidenceFromRuns([
      { outcome: "succeeded", modelCalls: 0, finishedAtMs: 1, judged: "yes" },
      { outcome: "failed", modelCalls: 1, finishedAtMs: 2, judged: "no" },
      { outcome: "stopped", modelCalls: 0, finishedAtMs: 3 }
    ])).toEqual([
      { result: "confirmed", zeroModel: true, atMs: 1 },
      { result: "refuted", zeroModel: false, atMs: 2 },
      { result: "unverified", zeroModel: true, atMs: 3 }
    ]);
  });
});
