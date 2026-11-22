import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../index.ts";

function result(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "answer", recordCount: 1, refusedCount: 0, truncated: false, columns: ["id", "amount"], columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ id: "Original item", amount: "$12.50" }] }],
    flowShape: [{ nodeId: "read", definitionId: "read.example" }], withheld: false,
    evidenceProjection: { version: 1, missing: [] }
  };
}

describe("a model yes with semantic evidence", () => {
  it("holds an explicit semantic gap as unsure while preserving the original rows and uncertainty", () => {
    const summary = result();
    summary.evidenceProjection = { version: 1, missing: [{ source: "trail.2", codes: ["effect.not_proven"] }] };
    summary.trail = { note: "Actual action record", entries: [{ n: 1, did: "action.example", outcome: "succeeded", found: { effectUncertain: "The response did not prove the lasting effect" } }] };
    const before = structuredClone(summary);
    const verdict = automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes" } });
    expect(verdict.verdict).toBe("unsure");
    expect(verdict.basis).toBe("model_unconfirmed");
    expect(verdict.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.semanticEvidenceMissing);
    expect(verdict.repair).toBeUndefined();
    expect(summary).toEqual(before);
    expect(summary.recordSets[0]?.sampleRows).toEqual([{ id: "Original item", amount: "$12.50" }]);
    expect(summary.trail.entries[0]?.found).toEqual({ effectUncertain: "The response did not prove the lasting effect" });
  });

  it("accepts a complete data projection without requiring a raw capture", () => {
    const summary = result();
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes", checked: [{ row: "Original item", column: "amount", value: "$12.50" }] } }).verdict).toBe("answers");
  });

  it("accepts a proven action projection without requiring a raw capture", () => {
    const summary = result();
    summary.trail = { note: "Actual action record", entries: [{ n: 1, did: "action.example", outcome: "succeeded", found: { confirmation: "The requested item was saved", before: false, after: true } }] };
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
  });

  it("does not turn existing privacy-only withholding into a new semantic gap", () => {
    const summary = result();
    summary.withheld = true;
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    delete summary.evidenceProjection;
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
  });

  it("preserves a model no rather than replacing it with a semantic-gap yes hold", () => {
    const summary = result();
    summary.evidenceProjection = { version: 1, missing: [{ source: "legacy", codes: ["judge_evidence.projector_missing"] }] };
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "no" } }).verdict).toBe("does_not_answer");
  });
});
