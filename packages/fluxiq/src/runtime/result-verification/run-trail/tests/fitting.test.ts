import { expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultTrailFitting } from "../fitting.ts";
import { automationStudioFlowLessSummaryFitting } from "../../flow-less/window-fitting.ts";

it("keeps full semantic findings, answer values and accounts while leaving legacy fitting available", () => {
  const rows = Array.from({ length: 40 }, (_, row) => ({ name: `Item ${row}`, exact: "Original semantic fact ".repeat(100) }));
  const summary: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: rows.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "answer", recordCount: rows.length, refusedCount: 0, columns: ["name", "exact"], columnsWithheld: false, truncated: false, rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows }], flowShape: [], withheld: false, trail: { note: "Core's actual source findings", entries: [{ n: 1, did: "example.read", found: { role: "data", evidence: { rows } } }] }, resultEvidence: { pages: [{ source: "read", rows }], account: { collected: 43, duplicates: 1, filteredOut: 2, kept: 40 } } };
  const semantic = { ...summary, evidenceProjection: { version: 1 as const, missing: [] } };
  const original = structuredClone(semantic);
  expect(automationStudioResultTrailFitting(semantic)).toEqual([]);
  expect(automationStudioFlowLessSummaryFitting(semantic)).toEqual([]);
  expect(semantic).toEqual(original);
  expect(automationStudioResultTrailFitting(summary).length).toBeGreaterThan(0);
  expect(automationStudioFlowLessSummaryFitting(summary).length).toBeGreaterThan(0);
});
