// The marks the client read on the rows a read left out reach its account (t810):
// beside a condition's labels as `leftOutMarks` and beside a together set's as
// `marks`, screened as the cells are. A hobby club's notice board: no task,
// site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadLeftOutMarks } from "../../left-out-cells/index.ts";

const NODE = "read.notices";
const node: AutomationStudioFlowNode = {
  id: NODE, definitionId: "web.output.dom-extract_list",
  parameterValues: { extractList: { item: ".notice", fields: { club: { kind: "text", selector: "h3" }, posted: { kind: "text", selector: "time" } }, where: [{ field: "club", contains: "Circle" }, { field: "posted", contains: "2027" }], minItems: 0 } }
};
const OFFER = { kind: "outside", said: "Join club", entity: "Chess Circle" };

const attempt = (aloneMarks: JsonValue | undefined, togetherMarks: JsonValue | undefined): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "attempt.read", nodeId: NODE, definitionId: node.definitionId, order: 1, status: "succeeded", startedAt: 1,
  metadata: {
    extraction: {
      recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["club", "posted"], missingFields: [], itemsSeen: 4,
      conditions: {
        applied: 4, kept: 1, rejected: [2, 2], unfiltered: false, alone: [2, 0],
        aloneRows: [[{ club: "Ann Lee", posted: "6 March 2027" }, { club: "Chess Circle", posted: "2 March 2027" }], []],
        aloneMarks,
        togetherRows: [{ failed: [0, 1], rows: [{ club: "Bo Kim", posted: "1 May 2026" }], marks: togetherMarks }]
      }
    }
  }
});

describe("marks on the rows a read left out (t810)", () => {
  it("carries each alone row's marks and each together row's marks into the account", () => {
    const read = automationStudioResultReadAccounts({ actionAttempts: [attempt([[null, [OFFER]], []], [[OFFER]])], flowNodes: [node], deniedEvidenceKeys: [] }).reads[0]!;
    expect(read.conditions?.[0]?.leftOutOnlyByThis).toHaveLength(2);
    expect(read.conditions?.[0]?.leftOutMarks).toEqual([null, [OFFER]]);
    expect(read.conditions?.[1]?.leftOutMarks).toBeUndefined();
    expect(read.leftOutTogether?.[0]?.marks).toEqual([[OFFER]]);
  });

  it("has no marks where the read sent none, or sent them out of line", () => {
    const none = automationStudioResultReadAccounts({ actionAttempts: [attempt(undefined, undefined)], flowNodes: [node], deniedEvidenceKeys: [] }).reads[0]!;
    expect(none.conditions?.[0]?.leftOutMarks).toBeUndefined();
    expect(none.leftOutTogether?.[0]?.marks).toBeUndefined();
    const short = automationStudioResultReadAccounts({ actionAttempts: [attempt([[[OFFER]], []], [])], flowNodes: [node], deniedEvidenceKeys: [] }).reads[0]!;
    expect(short.conditions?.[0]?.leftOutMarks).toBeUndefined();
  });

  it("says a mark text shaped like a credential or a locator as withheld, and keeps the mark", () => {
    const marks = automationStudioResultReadLeftOutMarks([[{ kind: "outside", said: "Join", entity: "sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }], null], 2, []);
    expect(marks?.[0]?.[0]).toEqual({ kind: "outside", said: "Join", entity: "(withheld)" });
    expect(marks?.[1]).toBeNull();
  });

  it("refuses marks that are not one entry per row", () => {
    expect(automationStudioResultReadLeftOutMarks([[OFFER]], 2, [])).toBeUndefined();
    expect(automationStudioResultReadLeftOutMarks([null, null], 2, [])).toBeUndefined();
  });
});
