import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts.ts";
import { automationStudioResultExclusionEvidenceRecheck } from "../recheck.ts";

const deficient = (lines: string[]): AutomationStudioResultVerification => ({
  schemaVersion: "automation-studio.result-verification.v1", verdict: "unsure", basis: "model_unconfirmed",
  code: "core.result.exclusion_evidence_missing", reason: "Unconfirmed.", observation: "Three records.", exclusionEvidenceMissing: lines
});

describe("bounded exclusion evidence feedback", () => {
  it("carries exact missing-proof lines but no instruction to change the candidate", () => {
    const text = automationStudioResultExclusionEvidenceRecheck(deficient(["Missing row-local proof for the aluminium storage bin."]), []);
    expect(text).toContain("aluminium storage bin");
    expect(text).toContain("do not change the Flow");
    expect(text).toContain("full displayed name or exact distinguishing identifier");
  });

  it("declines an undeclared or denying domain screen and credential-shaped evidence", () => {
    const evidence = deficient(["Missing proof."]);
    expect(automationStudioResultExclusionEvidenceRecheck(evidence, undefined)).toBeUndefined();
    expect(automationStudioResultExclusionEvidenceRecheck(evidence, ["recheck"])).toBeUndefined();
    const synthetic = deficient(["Bearer abcdefghijklmnopqrstuvwxyz1234567890"]);
    expect(automationStudioResultExclusionEvidenceRecheck(synthetic, [])).toBeUndefined();
  });

  it("does not make a correction request for an ordinary semantic no", () => {
    const no: AutomationStudioResultVerification = { ...deficient([]), verdict: "does_not_answer", basis: "model" };
    delete no.exclusionEvidenceMissing;
    expect(automationStudioResultExclusionEvidenceRecheck(no, [])).toBeUndefined();
  });
});
