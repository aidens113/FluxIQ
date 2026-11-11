// The pages a result's rows were read from, as the judge is shown them (`../read-pages-shown.ts`): an entry per
// read for a result made of rows, none for one with no rows, a credential-shaped address withheld, the question
// saying what the entry is, and the digest moving with it. A parish hall's bookings, no realistic scenario's site.
import { describe, expect, it } from "vitest";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "../question.ts";
import { automationStudioFlowLessSummaryDigest } from "../summary-digest.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const ROWS = { totalRows: 5, truncated: false, columns: [{ id: "slot", label: "slot" }], rows: [1, 2, 3, 4, 5].map((n) => ({ slot: `Slot ${n}` })) };
const READS = [
  { where: "http://127.0.0.1:5000/bookings?month=may", place: "page=1", kept: 2 },
  { where: "http://127.0.0.1:5000/bookings?month=may", place: "page=2", kept: 3 }
];
const summary = (more: Partial<AutomationStudioFlowLessSummary>): AutomationStudioFlowLessSummary => ({ instructions: "List the free slots in May.", acts: [], endView: { after: "end", view: { page: "URL /bookings?month=may&page=3" } }, ...more });
const sentOf = (value: AutomationStudioFlowLessSummary) => automationStudioFlowLessJudgedSummary(value, []).sent as unknown as Record<string, unknown>;

describe("the pages a result's rows were read from", () => {
  it("shows one entry per read, with where it read and how many rows it kept", () => {
    expect(sentOf(summary({ rows: ROWS, readPages: READS })).readPages).toEqual(READS);
  });

  it("shows none for a result with no rows, whatever was read", () => {
    expect(sentOf(summary({ readPages: READS }))).not.toHaveProperty("readPages");
    expect(sentOf(summary({ rows: ROWS }))).not.toHaveProperty("readPages");
  });

  it("withholds a credential-shaped address and says the summary is withheld", () => {
    const secret = "sk-abcdef1234567890abcdef1234";
    const judged = automationStudioFlowLessJudgedSummary(summary({ rows: ROWS, readPages: [{ where: `http://127.0.0.1:5000/bookings?key=${secret}`, kept: 5 }] }), []);
    expect(JSON.stringify(judged.sent)).not.toContain(secret);
    expect(judged.read.withheld).toBe(true);
  });

  it("says what the entry is in the question, and the digest moves with it", () => {
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("readPages lists the reads the rows in recordSets came from");
    expect(automationStudioFlowLessSummaryDigest(summary({ rows: ROWS, readPages: READS }))).not.toBe(automationStudioFlowLessSummaryDigest(summary({ rows: ROWS })));
  });

  it("shows every read, however many, and every address, place and left-out label whole", () => {
    const reads = Array.from({ length: 55 }, (_, index) => ({ where: `http://127.0.0.1:5000/bookings?month=may&page=${index}&${"q".repeat(320)}`, place: `page=${index} ${"p".repeat(120)}`, kept: 1 }));
    const shown = sentOf(summary({ rows: ROWS, readPages: reads }));
    expect(shown.readPages).toEqual(reads);
    expect(shown).not.toHaveProperty("readPagesNotShown");
  });

  it("shows a 300-character left-out label whole", () => {
    const label = `Seat ${"A".repeat(295)}`;
    expect(label.length).toBe(300);
    const read: NonNullable<AutomationStudioFlowLessSummary["readPages"]>[number] = { where: "http://127.0.0.1:5000/seats", kept: 1, leftOut: { sets: [{ kind: "alone", conditions: [0], rows: [{ seat: label }] }] } };
    const pages = sentOf(summary({ rows: ROWS, readPages: [read] })).readPages as { leftOut?: { rows: string[] }[] }[];
    expect(JSON.stringify(pages[0]!.leftOut)).toContain(label);
  });
});
