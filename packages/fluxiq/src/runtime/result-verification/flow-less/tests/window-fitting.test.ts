// The shorter forms of the Flow-less judge's summary (W3, t899): one more evidence item summarised at each step, the
// views first and the rows last (by label, then by count), each form naming what it summarised, and nothing dropped
// without its account in its place. A kind of site no realistic scenario uses (a lending library's reading room).
import { describe, expect, it } from "vitest";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";
import { automationStudioFlowLessSummaryFitting } from "../window-fitting.ts";

const LONG = "a desk by the north windows with a lamp and a socket ".repeat(40);
const rows = Array.from({ length: 30 }, (_, index) => ({ desk: `Desk ${index + 1}`, note: LONG }));
const summary = (extra: Partial<AutomationStudioFlowLessSummary> = {}): AutomationStudioFlowLessSummary => ({
  instructions: "List every free desk in the reading room.",
  rows: { totalRows: rows.length, truncated: false, columns: [{ id: "desk", label: "Desk" }, { id: "note", label: "Note" }], rows },
  acts: [],
  endView: { after: "end", view: { lines: [LONG, LONG] } },
  ...extra
});
const sent = (given: AutomationStudioFlowLessSummary) => automationStudioFlowLessJudgedSummary(given, []).sent;
/** A form as the model reads it. */
const shown = (form: unknown) => JSON.parse(JSON.stringify(form));

describe("the judge's summary told more briefly", () => {
  it("summarises one more item at each step, the end view before the rows, and the rows by label before by count", () => {
    const forms = automationStudioFlowLessSummaryFitting(sent(summary()));

    expect(forms.map((form) => shown(form).summarised.items)).toEqual([
      ["endView.view"],
      ["endView.view", "recordSets[0].sampleRows"],
      ["endView.view", "recordSets[0].sampleRows"]
    ]);
    expect(shown(forms[0]).endView.view["core.summarised"]).toMatchObject({ item: "endView.view", kind: "object", keys: { lines: "list of 2 entries" } });
    expect(shown(forms[0]).recordSets[0].sampleRows).toHaveLength(30);
    expect(shown(forms[1]).recordSets[0].sampleRows["core.summarised"]).toEqual({
      item: "recordSets[0].sampleRows", characters: JSON.stringify(sent(summary()).recordSets[0]!.sampleRows).length, kind: "rows", rows: 30, columns: ["desk", "note"], labelColumn: "desk", labels: rows.map((row) => row.desk)
    });
    expect(shown(forms[2]).recordSets[0].sampleRows["core.summarised"]).toMatchObject({ kind: "rows", rows: 30, columns: ["desk", "note"] });
    expect(shown(forms[2]).recordSets[0].sampleRows["core.summarised"].labels).toBeUndefined();
    expect(shown(forms[2]).summarised).toMatchObject({ count: 2 });
  });

  it("leaves whole an item its account would be no shorter than, and has nothing to offer where every item is small", () => {
    const small = summary({ rows: { totalRows: 1, truncated: false, columns: [{ id: "desk", label: "Desk" }], rows: [{ desk: "Desk 1" }] }, endView: { after: "end", view: { lines: ["Desk 1"] } } });

    expect(automationStudioFlowLessSummaryFitting(sent(small))).toEqual([]);
  });

  it("never changes the summary it was given", () => {
    const given = sent(summary());
    const before = JSON.stringify(given);

    automationStudioFlowLessSummaryFitting(given);

    expect(JSON.stringify(given)).toBe(before);
  });
});
