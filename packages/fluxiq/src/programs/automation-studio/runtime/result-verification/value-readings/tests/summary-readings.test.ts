// The judge's summary says how Core read the values each condition and the
// sort compared (t511), set by `summarizeAutomationStudioRunResult` through
// `../summary-readings.ts`.
//
// Live run `run-mv6qr7fk-77f30b49` (job-board): `salary atLeast 70000` left out
// "£72k – £80k per annum", which Core reads as 72, and nobody was shown the 72;
// `title matches "Rust"` kept "Trust & Safety Engineer"; and both judges, four
// times, called an answer Core had sorted by relative dates, newest first,
// "not newest-first". The model followed them into two regressions. The order
// claim's marking is tested beside the other contradicted readings
// (`../../tests/agreement-both-readings.test.ts`).
import { processAutomationStudioRecordRows, readAutomationStudioRecordNumber, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { datasetSummary } from "../../tests/run-outcome-harness.ts";

const NOW = Date.UTC(2026, 9, 13, 12);
const READ_ID = "node.read";

const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["title", "salary", "posted"].map((id) => ({ id, label: id, valueType: "string" as const })) };

const rows: JsonObject[] = [
  { title: "Trust & Safety Engineer", salary: "£85,000 a year", posted: "Today" },
  { title: "Rust Engineer", salary: "£90,000 a year", posted: "Posted 3 days ago" },
  { title: "Senior Rust Developer", salary: "£75,000 – £88,000 a year", posted: "Posted 9 days ago" }
];

const readNode = (): AutomationStudioFlowNode => ({
  id: READ_ID,
  definitionId: "web.output.dom-extract_list",
  parameterValues: {
    extractList: {
      item: ".row",
      fields: { title: { kind: "text", selector: ".t" }, salary: { kind: "text", selector: ".s" }, posted: { kind: "text", selector: ".p" } },
      where: [{ field: "title", matches: ["Rust"] }, { field: "salary", atLeast: 70000 }]
    },
    recordOutput: { datasetId: "roles", writeMode: "append", process: { sort: [{ field: "posted", order: "desc" }] } }
  }
});

const readAttempt = (): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "attempt.read",
  nodeId: READ_ID,
  definitionId: "web.output.dom-extract_list",
  order: 2,
  status: "succeeded",
  startedAt: 10,
  metadata: {
    extraction: {
      recordCount: 3,
      pagesRead: 1,
      truncated: false,
      itemsSeen: 6,
      conditions: {
        applied: 6, kept: 3, rejected: [1, 2], alone: [1, 2], unfiltered: false,
        aloneRows: [
          [{ title: "Platform Lead" }],
          [{ title: "Systems Engineer", salary: "£72k – £80k per annum" }, { title: "Graduate Engineer", salary: "£38,000 a year" }]
        ]
      }
    }
  }
});

function summary(): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary({ datasetId: "roles", recordCount: 3 }), schema, rows }],
    flowNodes: [{ id: "node.open", definitionId: "web.output.browser-navigate", parameterValues: { url: "https://site.test/" } }, readNode()],
    actionAttempts: [readAttempt()],
    deniedEvidenceKeys: [],
    now: NOW
  });
}

describe("the judge's summary says how values were read", () => {
  it("a bound says the number it read on kept and left-out rows", () => {
    const salary = summary().reads?.[0]?.conditions?.[1];
    expect(salary?.condition).toBe("salary atLeast 70000");
    expect(salary?.valuesRead).toEqual([
      `kept "Trust & Safety Engineer": salary read as 85000 from "£85,000 a year"`,
      `kept "Rust Engineer": salary read as 90000 from "£90,000 a year"`,
      `kept "Senior Rust Developer": salary read as 75000 from "£75,000 – £88,000 a year"`,
      `left out "Systems Engineer": salary read as ${readAutomationStudioRecordNumber("£72k – £80k per annum")} from "£72k – £80k per annum"`,
      `left out "Graduate Engineer": salary read as 38000 from "£38,000 a year"`
    ]);
  });

  it("a text test says which part of each kept row it matched", () => {
    const title = summary().reads?.[0]?.conditions?.[0];
    expect(title?.valuesRead?.[0]).toBe(`kept "Trust & Safety Engineer": title "Trust & Safety Engineer" matched "rust" inside the word "Trust" (matches "Rust")`);
    expect(title?.valuesRead).toHaveLength(3);
  });

  it("the record set says how its sort read the column and that the rows are in that order", () => {
    expect(summary().recordSets[0]?.sortRead).toEqual([{
      field: "posted",
      inOrder: true,
      said: `Core sorts this answer by posted, newest first, reading posted as a date: 3 of 3 rows state one. The rows above are in that order. Read: "Today" as 2026-10-13; "Posted 3 days ago" as 2026-10-10; "Posted 9 days ago" as 2026-10-04.`
    }]);
  });

  // t515 (live run `run-mv6v2kzn-d593231f`): the answer was sorted newest first
  // by `posted`, which its `columns` leave out, and no judge was shown the order
  // Core read. Core's record of the sort, kept before the columns were applied,
  // is said instead; the column is never added to the answer.
  it("says the sort of a key the answer's columns leave out, from Core's record, and never adds the column", () => {
    const result = hiddenPostedSummary([]);
    const set = result.recordSets[0]!;
    expect(set.sortRead).toEqual([{
      field: "posted",
      inOrder: true,
      said: "Core sorts this answer by posted, newest first, reading posted as a date: 3 of 3 rows state one. posted is not one of the answer's columns: Core read it on the stored rows before leaving it out, and the answer's rows were in that order. Read, in row order: 2026-10-13; 2026-10-10; 2026-10-04."
    }]);
    expect(set.sampleRows?.length).toBe(3);
    expect(set.sampleRows?.some((row) => Object.hasOwn(row, "posted"))).toBe(false);
    expect(set.processing).not.toHaveProperty("hiddenSortKeys");
  });

  it("says nothing of a hidden sort key without a denied-keys declaration, and never passes Core's record on", () => {
    const set = hiddenPostedSummary(undefined).recordSets[0]!;
    expect(set.sortRead).toBeUndefined();
    expect(set.processing).toBeDefined();
    expect(set.processing).not.toHaveProperty("hiddenSortKeys");
  });

  it("says nothing of values without a denied-keys declaration", () => {
    const bare = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "roles", recordCount: 3 }), schema, rows }],
      flowNodes: [readNode()],
      actionAttempts: [readAttempt()],
      now: NOW
    });
    expect(bare.recordSets[0]?.sortRead).toBeUndefined();
    expect(JSON.stringify(bare)).not.toContain("valuesRead");
  });
});

/** The rows answered with `posted` sorted newest first and left out by `columns`, as the store would hold them. */
function hiddenPostedSummary(deniedEvidenceKeys: string[] | undefined): AutomationStudioRunResultSummary {
  const process: AutomationStudioRecordProcessing = { sort: [{ field: "posted", order: "desc" }], columns: ["title", "salary"] };
  const shuffled = [rows[1]!, rows[2]!, rows[0]!];
  const answered = processAutomationStudioRecordRows({ rows: shuffled.map((values) => ({ values, nodeId: READ_ID, batchKey: "b1" })), schema, process, now: NOW });
  const node = readNode();
  const recordOutput = (node.parameterValues as { recordOutput: JsonObject }).recordOutput;
  recordOutput.process = process as unknown as JsonObject;
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary({ datasetId: "roles", recordCount: 3, processing: answered.account }), schema, rows: answered.rows as JsonObject[] }],
    flowNodes: [node],
    actionAttempts: [readAttempt()],
    ...(deniedEvidenceKeys ? { deniedEvidenceKeys } : {}),
    now: NOW
  });
}
