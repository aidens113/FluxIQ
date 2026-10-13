// A condition that keeps only the rows lacking something its own read finds
// (t482, N3; lane D round 12, `run-mv636xyp-2e4fe54d`). It was said "the item's
// text is absent", which names neither what is absent nor that the rest of the
// item is not tested, and both trial judges called the result fragile. It is now
// said by the words its read found on a row it left out. The fixture is a
// reading list, not a Lab scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";

const witness = (value: string, item: number): JsonObject => ({ conditionIndex: 0, state: "present", value, source: "read", readKind: "text", page: 1, item });

function read(observations: JsonObject[] | undefined): AutomationStudioFlowRunActionAttemptRecord {
  return { attemptId: "unit.read", nodeId: "unit.read", definitionId: "unit.list", order: 1, status: "succeeded", startedAt: 1,
    metadata: { extraction: { recordCount: 3, pagesRead: 1, truncated: false, conditions: {
      rejected: [2], alone: [2], aloneRows: [[{ title: "Unit alpha" }, { title: "Unit beta" }]],
      ...(observations ? { aloneObservations: [observations] } : {})
    } } } };
}

const node = (condition: JsonObject): AutomationStudioFlowNode => ({ id: "unit.read", definitionId: "unit.list", parameterValues: {
  fields: { title: { kind: "text", selector: ".title" } }, where: [condition]
} });

const conditionOf = (condition: JsonObject, observations: JsonObject[] | undefined) =>
  automationStudioResultReadAccounts({ actionAttempts: [read(observations)], flowNodes: [node(condition)], deniedEvidenceKeys: [] }).reads[0]?.conditions?.[0]?.condition;

const LACKING = { read: { kind: "text", selector: ".row button.borrow" }, is: "absent" };

describe("a condition that keeps the rows lacking what its own read finds", () => {
  it("is said by the words that read found on a row it left out, and what that keeps", () => {
    expect(conditionOf(LACKING, [witness("Borrow", 1), witness("Borrow", 2)]))
      .toBe("the item's text \"Borrow\" is absent (a row is kept only when it has no \"Borrow\")");
  });

  it("is said as before where its read found no word that may be said, or it tests more than presence", () => {
    expect(conditionOf(LACKING, undefined)).toBe("the item's text is absent");
    expect(conditionOf(LACKING, [witness("#row-1 > button.borrow", 1), witness("#row-2 > button.borrow", 2)])).toBe("the item's text is absent");
    expect(conditionOf({ ...LACKING, not: true }, [witness("Borrow", 1), witness("Borrow", 2)])).toBe("the item's text not is absent");
    // A presence test said by a column keeps the column's name.
    expect(conditionOf({ field: "title", is: "absent" }, [witness("Borrow", 1), witness("Borrow", 2)])).toBe("title is absent");
  });
});
