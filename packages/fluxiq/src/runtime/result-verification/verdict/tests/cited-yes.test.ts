import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../index.ts";

const summary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 2,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [{ datasetId: "d1", recordCount: 2, refusedCount: 0, missingRequiredColumns: [], truncated: false, columns: ["name", "minutes"], sampleRows: [{ name: "Lentil Soup", minutes: "40" }, { name: "Cheese Tart", minutes: "55" }] }],
  flowShape: [{ nodeId: "n1", definitionId: "extract" }],
  withheld: false
} as unknown as AutomationStudioRunResultSummary;

describe("a yes that cites what it checked", () => {
  it("stays a yes, carrying the count, when Core finds every citation", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes", checked: [{ row: "Lentil Soup", column: "minutes", value: "40" }] } });
    expect(verification.verdict).toBe("answers");
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers);
    expect(verification.yesCitations).toEqual({ cited: 1, refuted: [] });
  });

  it("is unsure, never a yes, when any citation is refuted", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes", expected: "Soups.", observed: "Two rows.", checked: [{ row: "Lentil Soup", column: "minutes", value: "40" }, { row: "Fish Pie", column: "minutes", value: "40" }] } });
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted);
    expect(verification.yesCitations?.cited).toBe(2);
    expect(verification.yesCitations?.refuted).toHaveLength(1);
    expect(verification.failure).toBeDefined();
    expect(verification.answeredReading).toEqual({ expected: "Soups.", observed: "Two rows." });
  });

  it("is exactly as before when the yes cites nothing", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes" } });
    expect(verification.verdict).toBe("answers");
    expect(verification.yesCitations).toBeUndefined();
    expect(automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "yes", checked: [] } }).yesCitations).toBeUndefined();
  });

  it("is unsure where its caller asks it to stand on the rows and it cites none, Core's sentence leading (t875)", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", yesOnRows: true, diagnosis: { answersRequest: "yes", answerRecords: { asked: true, siteShows: 2 } } });
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted);
    expect(verification.reason).toContain("does not stand on the rows the result holds");
    expect(verification.yesCitations).toEqual({ cited: 0, refuted: ["The yes cites no stored row, though the result holds 2 rows: a yes on rows cites in checked each stored row that answers the request."] });
  });

  it("leads with the count where the site shows other records than the rows held, before any citation Core cannot find (t875)", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", yesOnRows: true, diagnosis: { answersRequest: "yes", checked: [{ row: "Fish Pie", column: "minutes", value: "40" }], answerRecords: { asked: true, siteShows: 4 } } });
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted);
    expect(verification.yesCitations?.cited).toBe(1);
    expect(verification.yesCitations?.refuted[0]).toContain("counts 4 records the site shows as the answer, but the result holds 2 rows");
    expect(verification.yesCitations?.refuted[1]).toContain("is no row the result holds");
  });

  it("stays a yes on the rows when it cites one and counts the rows held (t875)", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", yesOnRows: true, diagnosis: { answersRequest: "yes", checked: [{ row: "Lentil Soup", column: "minutes", value: "40" }], answerRecords: { asked: true, siteShows: 2 } } });
    expect(verification.verdict).toBe("answers");
    expect(verification.yesCitations).toEqual({ cited: 1, refuted: [] });
  });

  it("is never read from a no", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model", diagnosis: { answersRequest: "no", checked: [{ row: "Fish Pie", column: "minutes", value: "1" }] } });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.yesCitations).toBeUndefined();
  });
});
