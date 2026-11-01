import { describe, expect, it } from "vitest";
import { inspectionFixture } from "../../unconfirmed-inspection/tests/fixture.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";

describe("a structured missing-row defect's own cell", () => {
  it("distinguishes unmeasured evidence from a located defect and a measured contradiction", () => {
    for (const [measured, expected] of [[undefined, "unmeasured"], ["Open", "located"], ["Closed", "refuted"]]) {
      const summary = inspectionFixture.summary(measured);
      const result = automationStudioResultDefectsLocated([inspectionFixture.defect()], { summary, record: automationStudioResultNoRecord({ summary }) });
      expect(result.unmeasured?.length ?? 0).toBe(expected === "unmeasured" ? 1 : 0);
      expect(result.located.length).toBe(expected === "located" ? 1 : 0);
      expect(result.refuted?.length ?? 0).toBe(expected === "refuted" ? 1 : 0);
    }
  });

  it("does not mark an unknown row, unsaid quote or unspecified cell as unmeasured", () => {
    const summary = inspectionFixture.summary();
    const record = automationStudioResultNoRecord({ summary, wording: automationStudioRequestWording([inspectionFixture.instruction], summary) });
    const result = automationStudioResultDefectsLocated([
      { ...inspectionFixture.defect(), row: "Unseen workshop" },
      { ...inspectionFixture.defect(), requestWords: "words nobody requested" },
      { kind: "asked_missing", row: "Amber workshop", requestWords: "every workshop marked open" }
    ], { summary, record });
    expect(result.unmeasured).toBeUndefined();
  });
});
