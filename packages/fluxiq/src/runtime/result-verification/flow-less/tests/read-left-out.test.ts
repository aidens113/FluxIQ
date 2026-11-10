// Each read the result's rows came from, as the judge is shown it (`../read-pages-shown.ts`): the rows it kept by
// label and what its own conditions left out, each set under the conditions that did it, worded as the read was
// asked, with what a condition read on the items it left out (run-mwaknxf9-7549d126, judges 0043, 0060, 0114: two
// cards of one name, one promoted, told apart by nothing they were shown). A library's catalogue, no realistic
// scenario's site.
import { describe, expect, it } from "vitest";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "../question.ts";
import { automationStudioFlowLessSummaryDigest } from "../summary-digest.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const KEPT = [{ title: "Garden Birds", price: "$9" }, { title: "Night Sky", price: "$11" }];
const ROWS = { totalRows: 2, truncated: false, columns: [{ id: "title", label: "title" }, { id: "price", label: "price" }], rows: KEPT };
const LEFT_OUT = {
  where: [{ field: "promo_badge", is: "absent" }, { field: "rating_text", atLeast: 4 }],
  columns: { title: "title_text", rating: "rating_text" },
  found: [["Promoted"], undefined],
  sets: [
    { kind: "alone" as const, conditions: [0], rows: [{ title: "Atlas of Rivers" }] },
    { kind: "alone" as const, conditions: [1], rows: [{ title: "Old Roads", rating: "3.9" }] },
    { kind: "together" as const, conditions: [0], rows: [{ title: "Pocket Atlas" }] },
    { kind: "unsplit" as const, conditions: [1], rows: [{ title: "Coastlines" }] }
  ]
};
const summary = (more: Partial<AutomationStudioFlowLessSummary>): AutomationStudioFlowLessSummary => ({ instructions: "List the map books rated 4 or better, leaving out promoted listings.", acts: [], rows: ROWS, ...more });
const pageOf = (value: AutomationStudioFlowLessSummary) => (automationStudioFlowLessJudgedSummary(value, []).sent as unknown as { readPages: Record<string, unknown>[] }).readPages[0]!;

describe("what each read kept and left out, as the judge is shown it", () => {
  it("names the rows a read kept by label, and each set it left out under the conditions that left it out", () => {
    const page = pageOf(summary({ readPages: [{ where: "http://127.0.0.1:5000/catalogue", kept: 2, rows: KEPT, leftOut: LEFT_OUT }] }));
    expect(page.keptRows).toEqual(["Garden Birds", "Night Sky"]);
    expect(page.leftOut).toEqual([
      { by: "condition 1 (promo_badge is absent; it read \"Promoted\" on the items it left out) by itself, every other condition keeping these rows", rows: ["Atlas of Rivers"] },
      { by: "condition 2 (rating atLeast 4) by itself, every other condition keeping these rows", rows: ["Old Roads — rating: 3.9"] },
      { by: "condition 1 (promo_badge is absent; it read \"Promoted\" on the items it left out) and another condition, each of which left these rows out", rows: ["Pocket Atlas"] },
      { by: "condition 2 (rating atLeast 4), by itself or with another condition", rows: ["Coastlines"] }
    ]);
  });

  // run-mwaudvnh-c208d32c, judges 0241 and 0260: one label kept on page 1 and left out on page 2 was read as one item both kept and dropped.
  it("says, in sameLabelKept, each left-out label that a read kept, on any page, and no other", () => {
    const later = { kind: "alone" as const, conditions: [0], rows: [{ title: "Garden Birds" }, { title: "Atlas of Rivers" }] };
    const sent = automationStudioFlowLessJudgedSummary(summary({ readPages: [
      { where: "http://127.0.0.1:5000/catalogue?page=1", kept: 2, rows: KEPT },
      { where: "http://127.0.0.1:5000/catalogue?page=2", kept: 0, leftOut: { ...LEFT_OUT, sets: [later, { kind: "alone", conditions: [1], rows: [{ title: "Night Sky", rating: "3.1" }] }] } }
    ] }), []).sent as unknown as { readPages: { leftOut?: { rows: string[]; sameLabelKept?: string[] }[] }[] };
    expect(sent.readPages[1]?.leftOut).toEqual([
      expect.objectContaining({ rows: ["Garden Birds", "Atlas of Rivers"], sameLabelKept: ["Garden Birds"] }),
      expect.objectContaining({ rows: ["Night Sky — rating: 3.1"], sameLabelKept: ["Night Sky"] })
    ]);
    // A label no read kept is not marked, and the first case's sets carry no marker at all.
    expect(pageOf(summary({ readPages: [{ kept: 2, rows: KEPT, leftOut: LEFT_OUT }] })).leftOut).toEqual(expect.not.arrayContaining([expect.objectContaining({ sameLabelKept: expect.anything() })]));
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("Where a leftOut set gives sameLabelKept, each label named there is also the label of a row a read kept");
  });

  it("never marks a withheld label, though a read kept it", () => {
    const secret = "sk-abcdef1234567890abcdef1234";
    const page = pageOf(summary({ readPages: [{ kept: 1, rows: [{ title: secret, price: "$1" }], leftOut: { sets: [{ kind: "alone", conditions: [0], rows: [{ title: secret }] }] } }] }));
    expect(page.leftOut).toEqual([expect.not.objectContaining({ sameLabelKept: expect.anything() })]);
  });

  it("withholds a credential-shaped label and says the summary is withheld", () => {
    const secret = "sk-abcdef1234567890abcdef1234";
    const judged = automationStudioFlowLessJudgedSummary(summary({ readPages: [{ kept: 2, rows: KEPT, leftOut: { sets: [{ kind: "alone", conditions: [0], rows: [{ title: secret }] }] } }] }), []);
    expect(JSON.stringify(judged.sent)).not.toContain(secret);
    expect(judged.read.withheld).toBe(true);
  });

  it("says neither where the read held neither, as before", () => {
    expect(pageOf(summary({ readPages: [{ kept: 2 }] }))).toEqual({ kept: 2 });
  });

  it("says what the members are in the question, and the digest moves with what was left out", () => {
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("keptRows names by label the rows that read kept, and leftOut the rows that read found on the site and did not keep");
    const page = { kept: 2, rows: KEPT };
    expect(automationStudioFlowLessSummaryDigest(summary({ readPages: [{ ...page, leftOut: LEFT_OUT }] }))).not.toBe(automationStudioFlowLessSummaryDigest(summary({ readPages: [page] })));
  });
});
