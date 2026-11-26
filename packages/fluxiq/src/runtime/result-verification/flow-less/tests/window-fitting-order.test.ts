// The order the Flow-less judge's summary is summarised in when both the run trail and the declared result's evidence
// (`resultEvidence`, t905) are present (t963, t965): resultEvidence's looks and pages before any trail entry, the trail's
// asked before its found, the acts, and the rows last. A working read's page goes with its rows (t1048) and is summarised
// after the looks and before the pages; coverage, a working read said only by its count and the answer contract are never
// summarised, and every summarised item still names what it stood for. A kind of site no realistic scenario uses
// (a lending library's reading room).
import { describe, expect, it } from "vitest";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";
import { automationStudioFlowLessSummaryFitting } from "../window-fitting.ts";

const LONG = "a quiet table beside the shelves with a reading lamp ".repeat(30);
const rows = Array.from({ length: 6 }, (_, index) => ({ table: `Table ${index + 1}`, note: LONG }));
const page = { source: "read", step: "reader", version: 3, fields: { table: "table_field" }, conditions: [], place: "page=1", kept: rows.length, rows };
const evidence = {
  pages: [page],
  coverage: [{ step: "reader", version: 3, places: ["page=1"], first: "read" as const }],
  answerContract: { columns: ["table"] },
  working: [{ step: "reader", kept: rows.length }],
  looks: [{ ...page, source: "look" }]
};
const trail = [0, 1, 2].map((index) => ({ callId: `call-${index}`, did: `read-${index}`, asked: { query: `${index} ${LONG}` }, outcome: "ok", where: `http://127.0.0.1:5000/tables/${index}`, found: { text: `${index} ${LONG}` } }));
const summary = (extra: Partial<AutomationStudioFlowLessSummary> = {}): AutomationStudioFlowLessSummary => ({
  instructions: "List every free table in the reading room.",
  rows: { totalRows: rows.length, truncated: false, columns: [{ id: "table", label: "Table" }, { id: "note", label: "Note" }], rows },
  acts: [],
  resultEvidence: evidence,
  trail,
  ...extra
});
const sent = (given: AutomationStudioFlowLessSummary) => automationStudioFlowLessJudgedSummary(given, []).sent;
/** A form as the model reads it. */
const shown = (form: unknown) => JSON.parse(JSON.stringify(form));
const forms = () => automationStudioFlowLessSummaryFitting(sent(summary())).map(shown);
const entries = (form: { trail: { entries: unknown[] } }) => form.trail.entries;

describe("the judge's summary told more briefly, with a trail and result evidence", () => {
  it("sends the trail and the result evidence whole where the request fits", () => {
    const whole = shown(sent(summary()));

    expect(whole.summarised).toBeUndefined();
    expect(whole.resultEvidence).toEqual(shown(evidence));
    expect(entries(whole)).toHaveLength(3);
    expect(entries(whole).map((entry: any) => ({ asked: entry.asked, found: entry.found }))).toEqual(trail.map(({ asked, found }) => ({ asked, found })));
  });

  it("summarises the result evidence's looks, then its pages, before any trail entry, the trail whole until then", () => {
    const [first, second, third] = forms();

    expect(first.summarised.items).toEqual(["resultEvidence.looks"]);
    expect(second.summarised.items).toEqual(["resultEvidence.looks", "resultEvidence.pages"]);
    expect(third.summarised.items.slice(0, 2)).toEqual(["resultEvidence.looks", "resultEvidence.pages"]);
    for (const form of [first, second]) expect(entries(form)).toEqual(entries(shown(sent(summary()))));
    expect(first.resultEvidence.pages).toEqual([shown(page)]);
    expect(third.summarised.items[2]).toBe("trail.entries[0].asked");
  });

  it("then summarises the trail, each entry's asked before any found, oldest first, and the rows after both", () => {
    const all = forms();
    const items: string[] = all.at(-1).summarised.items;

    expect(items.slice(0, 8)).toEqual([
      "resultEvidence.looks", "resultEvidence.pages",
      "trail.entries[0].asked", "trail.entries[1].asked", "trail.entries[2].asked",
      "trail.entries[0].found", "trail.entries[1].found", "trail.entries[2].found"
    ]);
    expect(items.slice(8)).toEqual(["recordSets[0].sampleRows"]);
    const rowsAt = all.findIndex((form) => form.summarised.items.includes("recordSets[0].sampleRows"));
    expect(rowsAt).toBeGreaterThan(all.findIndex((form) => form.summarised.items.includes("trail.entries[2].found")));
    // Before the rows form, every trail entry is already summarised and the rows are whole.
    expect(all[rowsAt - 1].recordSets[0].sampleRows).toHaveLength(6);
    expect(entries(all[rowsAt - 1]).every((entry: any) => entry.asked["core.summarised"] && entry.found["core.summarised"])).toBe(true);
  });

  it("never summarises the coverage, a working read said only by its count or the answer contract, at any size", () => {
    for (const form of forms()) {
      expect(form.resultEvidence.coverage).toEqual(shown(evidence.coverage));
      expect(form.resultEvidence.working).toEqual(shown(evidence.working));
      expect(form.resultEvidence.answerContract).toEqual(shown(evidence.answerContract));
      expect(form.summarised.items.filter((item: string) => /coverage|working|answerContract/.test(item))).toEqual([]);
    }
  });

  it("summarises working reads' pages after the looks and before the pages, and says so in the request (t1048)", () => {
    const working = { ...page, source: "working", step: "finder", version: 1 };
    const all = automationStudioFlowLessSummaryFitting(sent(summary({ resultEvidence: { ...evidence, working: [working] } }))).map(shown);

    expect(all[0].summarised.items).toEqual(["resultEvidence.looks"]);
    expect(all[0].resultEvidence.working).toEqual([shown(working)]);
    expect(all[1].summarised.items).toEqual(["resultEvidence.looks", "resultEvidence.working"]);
    expect(all[1].resultEvidence.working["core.summarised"]).toMatchObject({ item: "resultEvidence.working", kind: "list", entries: 1 });
    expect(all[1].resultEvidence.pages).toEqual([shown(page)]);
    expect(all[2].summarised.items).toEqual(["resultEvidence.looks", "resultEvidence.working", "resultEvidence.pages"]);
    // Leaving them out is said in plain words, never done silently.
    expect(all[1].summarised.note).toContain("summarised 2 of the evidence items");
    expect(all[1].summarised.note).toContain("answer unknown");
  });

  it("drops nothing: every summarised item says what it stood for, and the trail entries keep their identity", () => {
    const last = forms().at(-1);

    expect(last.resultEvidence.looks["core.summarised"]).toMatchObject({ item: "resultEvidence.looks", kind: "list", entries: 1 });
    expect(last.resultEvidence.pages["core.summarised"]).toMatchObject({ item: "resultEvidence.pages", kind: "list", entries: 1 });
    expect(last.recordSets[0].sampleRows["core.summarised"]).toMatchObject({ item: "recordSets[0].sampleRows", kind: "rows", rows: 6, columns: ["table", "note"] });
    entries(last).forEach((entry: any, index: number) => {
      expect(entry).toMatchObject({ n: index + 1, callId: `call-${index}`, did: `read-${index}`, outcome: "ok", where: `http://127.0.0.1:5000/tables/${index}` });
      expect(entry.asked["core.summarised"]).toMatchObject({ item: `trail.entries[${index}].asked`, kind: "object", keys: { query: expect.stringContaining("characters") } });
      expect(entry.found["core.summarised"]).toMatchObject({ item: `trail.entries[${index}].found`, kind: "object" });
    });
    expect(last.summarised.count).toBe(last.summarised.items.length);
    expect(last.summarised.note).toContain("core.summarised");
  });
});
