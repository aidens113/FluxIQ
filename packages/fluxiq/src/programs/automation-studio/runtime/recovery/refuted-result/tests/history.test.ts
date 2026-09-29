// The repair loop's memory and its stopping rule, driven by the shape of
// run-mulwm2dc-0bd95f22: twelve unfiltered rows, refuted, re-authored, and
// twelve unfiltered rows again.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS,
  automationStudioResultRepairContinuation,
  automationStudioResultRepairHistoryEntry,
  automationStudioResultRepairHistoryRecord,
  automationStudioResultRepairUnchangedInARow
} from "../history.ts";

const ADVICE = "Map the title column to the item's text rather than its address, and keep only the items the request names.";

function summary(rows: Array<Record<string, string>> = [{ title: "https://example.test/item/1" }], parameters: JsonObject = { fields: { title: "col.1@href" } }): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 12,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{ datasetId: "dataset.1", recordCount: 12, refusedCount: 0, truncated: false, columns: ["title", "company"], columnsWithheld: false, rowsChecked: 12, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows }],
    flowShape: [{ nodeId: "node.s1", definitionId: "domain.open" }, { nodeId: "node.s3", definitionId: "domain.read_list", parameters }],
    withheld: false
  };
}

function refuted(): AutomationStudioResultVerificationOutcome {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "does_not_answer",
    basis: "model",
    code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request.",
    observation: "12 records stored, across 1 record set.",
    repair: {
      schemaVersion: "automation-studio.result-repair-directive.v1",
      findings: [{ code: "result.counts_look_right", detail: "Nothing in the counts is wrong." }],
      fix: ["Compare which rows were kept against the request."],
      judgement: { expected: "Only the items the request names.", advice: ADVICE }
    }
  };
}

describe("what one refutation records", () => {
  it("keeps the step the rows came out of and its parameters, and the check's advice for the next repair", () => {
    const entry = automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: refuted(), summary: summary(), nodeId: "node.s3" });
    expect(entry).toMatchObject({ attempt: 1, produced: { totalRecordCount: 12, recordSets: [{ recordCount: 12, columns: ["title", "company"] }] }, step: { nodeId: "node.s3", definitionId: "domain.read_list" } });
    expect(entry.step?.parameters).toContain("col.1@href");
    expect(entry.directive?.judgement?.advice).toBe(ADVICE);
  });

  it("puts counts and Core's own lines on the run, and never the check's prose", () => {
    const record = automationStudioResultRepairHistoryRecord(automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: refuted(), summary: summary(), nodeId: "node.s3" }));
    expect(record).toMatchObject({ attempt: 1, totalRecordCount: 12, findingCodes: ["result.counts_look_right"], fix: ["Compare which rows were kept against the request."], advised: true, nodeId: "node.s3" });
    expect(JSON.stringify(record)).not.toContain(ADVICE);
  });

  it("reads the same rows as the same answer, and a changed value as a different one", () => {
    const first = automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: refuted(), summary: summary(), nodeId: "node.s3" });
    const same = automationStudioResultRepairHistoryEntry({ attempt: 2, outcome: refuted(), summary: summary(), nodeId: "node.s3" });
    // The title column now holds the text: same count, same columns, different answer.
    const changed = automationStudioResultRepairHistoryEntry({ attempt: 2, outcome: refuted(), summary: summary([{ title: "Senior Engineer" }]), nodeId: "node.s3" });
    expect(same.answerDigest).toBe(first.answerDigest);
    expect(changed.answerDigest).not.toBe(first.answerDigest);
  });
});

describe("whether another repair is made", () => {
  const entry = (attempt: number, rows?: Array<Record<string, string>>) => automationStudioResultRepairHistoryEntry({ attempt, outcome: refuted(), summary: summary(rows), nodeId: "node.s3" });

  it("repairs the first refutation, and a second one after a repair that changed nothing", () => {
    expect(automationStudioResultRepairContinuation({ history: [], current: entry(1) })).toEqual({ repair: true });
    expect(automationStudioResultRepairContinuation({ history: [entry(1)], current: entry(2) })).toEqual({ repair: true });
  });

  it("stops when two repairs in a row left the answer exactly as it was", () => {
    const history = [entry(1), entry(2)];
    expect(automationStudioResultRepairUnchangedInARow([...history, entry(3)])).toBe(2);
    expect(automationStudioResultRepairContinuation({ history, current: entry(3) })).toEqual({ repair: false, stopped: "result_repair.not_converging" });
  });

  it("keeps going while each repair changes the answer, up to the bound", () => {
    const history = [entry(1, [{ title: "a" }]), entry(2, [{ title: "b" }])];
    expect(automationStudioResultRepairContinuation({ history, current: entry(3, [{ title: "c" }]) })).toEqual({ repair: true });
    expect(automationStudioResultRepairContinuation({ history: [...history, entry(3, [{ title: "c" }])], current: entry(AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS + 1, [{ title: "d" }]) }))
      .toEqual({ repair: false, stopped: "result_repair.attempts_exhausted" });
  });
});
