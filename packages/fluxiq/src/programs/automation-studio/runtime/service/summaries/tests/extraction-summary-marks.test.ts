// The marks a read's client found on the rows it left out (t810): the page's
// `rejectedMarks` are admitted as `conditions.aloneMarks` beside `aloneRows` and
// as a together set's `marks`, and a malformed member drops only the marks.
// A hobby club's notice board: no task, site, item or answer of any realistic
// scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { extractionSummaryFromOutputs } from "../extraction-summary.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../../../result-verification/read-account/index.ts";

const FRIEND = { club: "Ann Lee", posted: "6 March 2027" };
const SUGGESTED = { club: "Chess Circle", posted: "2 March 2027" };
const BOTH = { club: "Bo Kim", posted: "1 May 2026" };
const OFFER = { kind: "outside", said: "Join club", entity: "Chess Circle" };

function page(rejectedMarks: unknown): JsonObject {
  return {
    recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["club", "posted"], missingFields: [], itemsSeen: 4,
    conditions: { applied: 4, kept: 1, rejected: [3, 2], unfiltered: false, alone: [2, 0] },
    rejectedSamples: [[FRIEND, SUGGESTED, BOTH], [BOTH, { club: "", posted: "" }]],
    rejectedSamplesAlone: [2, 0],
    rejectedMarks
  } as JsonObject;
}

const conditionsOf = (summary: JsonObject | undefined): JsonObject => summary?.conditions as JsonObject;

describe("the marks on the rows a read left out (t810)", () => {
  it("admits the marks aligned with the alone rows and the together rows", () => {
    const summary = extractionSummaryFromOutputs({ result: { extraction: page([[null, [OFFER], [OFFER]], [[OFFER], null]]) } });
    const conditions = conditionsOf(summary);
    expect(conditions.aloneRows).toHaveLength(2);
    expect(conditions.aloneMarks).toEqual([[null, [OFFER]], []]);
    expect(conditions.togetherRows).toEqual([{ failed: [0, 1], rows: [expect.objectContaining({ club: "Bo Kim" })], marks: [[OFFER]] }]);
  });

  it("sends no marks member when no row carries one", () => {
    const conditions = conditionsOf(extractionSummaryFromOutputs({ result: { extraction: page([[null, null, null], [null, null]]) } }));
    expect(conditions.aloneMarks).toBeUndefined();
    expect((conditions.togetherRows as JsonObject[])[0]!.marks).toBeUndefined();
  });

  it("keeps a row's marks with its label: a row with no text is not kept, nor are its marks", () => {
    const summary = extractionSummaryFromOutputs({ result: { extraction: { ...page([[[OFFER], [OFFER], null], [null, null]]), rejectedSamples: [[{ club: "", posted: "" }, SUGGESTED, BOTH], [BOTH, FRIEND]] } } });
    expect(conditionsOf(summary).aloneMarks).toEqual([[[OFFER]], []]);
  });

  it.each([
    ["not aligned with the lists", [[null, null, null]]],
    ["not aligned with a list's rows", [[null, null], [null, null]]],
    ["an empty marks list", [[[], null, null], [null, null]]],
    ["an unknown kind", [[null, [{ kind: "inside", said: "x" }], null], [null, null]]],
    ["an extra key", [[null, [{ ...OFFER, href: "/x" }], null], [null, null]]],
    ["empty words", [[null, [{ kind: "outside", said: " " }], null], [null, null]]]
  ])("drops only the marks for %s, never the summary", (_name, marks) => {
    const summary = extractionSummaryFromOutputs({ result: { extraction: page(marks) } });
    expect(summary).toBeDefined();
    const conditions = conditionsOf(summary);
    expect(conditions.aloneRows).toHaveLength(2);
    expect(conditions.aloneMarks).toBeUndefined();
    expect((conditions.togetherRows as JsonObject[])[0]!.marks).toBeUndefined();
  });
});

describe("a row two conditions left out together keeps its mark all the way to the read account (t810)", () => {
  it("places the page's mark of a together row on the account's leftOutTogether set", () => {
    const extraction = extractionSummaryFromOutputs({ result: { extraction: page([[null, [OFFER], [OFFER]], [[OFFER], null]]) } });
    const node: AutomationStudioFlowNode = { id: "read", definitionId: "web.output.dom-extract_list", parameterValues: { extractList: { item: ".n", fields: { club: { kind: "text" }, posted: { kind: "text" } }, where: [{ field: "club", contains: "Circle" }, { field: "posted", contains: "2027" }] } } };
    const attempt = { attemptId: "a", nodeId: "read", definitionId: node.definitionId, order: 1, status: "succeeded" as const, startedAt: 1, metadata: { extraction } };
    const read = automationStudioResultReadAccounts({ actionAttempts: [attempt], flowNodes: [node], deniedEvidenceKeys: [] } as never).reads[0]!;
    expect(read.leftOutTogether?.[0]?.rows).toHaveLength(1);
    expect(read.leftOutTogether?.[0]?.marks).toEqual([[OFFER]]);
  });
});
