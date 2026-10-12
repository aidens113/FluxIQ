// A condition over a column read only to filter by says what it read on a row
// it kept. Run `run-mv5jnc51-9eac63f2` filtered on a badge column its rows did
// not store; the judge saw the condition, eight `absent` witnesses and no value
// read on any kept row, and refuted an exact answer as a broken read. The
// fixture is a generic article list with a "Verified" badge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadStoredColumns } from "../stored-columns.ts";

const NODE_ID = "node.unit.articles.read";
const BADGE = { kind: "attribute", selector: ".article-card .badge i", attribute: "aria-label" };

/** An article read filtering on a badge column, storing title and link: the schema, the answer's columns and the page's field map are each optional. */
function articleNode(output: { schema?: string[]; columns?: string[] } = { schema: ["title", "link"], columns: ["title", "link"] }): AutomationStudioFlowNode {
  return {
    id: NODE_ID,
    definitionId: "web.output.dom-extract_list",
    parameterValues: {
      extractList: {
        item: ".article-card",
        fields: { title: { kind: "text", selector: ".article-card h3" }, link: { kind: "link", selector: ".article-card h3 a" }, badge: BADGE },
        where: [{ field: "badge", is: "present" }, { field: "title", contains: "garden" }]
      },
      recordOutput: {
        datasetId: "articles",
        ...(output.schema ? { schema: { schemaVersion: "0.1", fields: output.schema.map((id) => ({ id, label: id, valueType: "string" })) } } : {}),
        ...(output.columns ? { process: { columns: output.columns } } : {})
      }
    }
  };
}

function articleAttempt(seen: Array<string | null>, fieldNames = ["title", "link"]): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: "attempt.articles",
    nodeId: NODE_ID,
    definitionId: "web.output.dom-extract_list",
    order: 1,
    status: "succeeded",
    startedAt: 1,
    metadata: { extraction: { recordCount: 4, pagesRead: 1, truncated: false, fieldNames, missingFields: [], itemsSeen: 9, conditions: { applied: 9, kept: 4, rejected: [3, 2], unfiltered: false, seen } } }
  };
}

const conditionsOf = (node: AutomationStudioFlowNode, attempt: AutomationStudioFlowRunActionAttemptRecord, deniedEvidenceKeys: string[] = []) =>
  automationStudioResultReadAccounts({ actionAttempts: [attempt], flowNodes: [node], deniedEvidenceKeys }).reads[0]?.conditions?.map((entry) => entry.condition);

describe("a condition over a column the rows do not store", () => {
  it("says the value it read on a row it kept, and says nothing beside a stored column", () => {
    expect(conditionsOf(articleNode(), articleAttempt(["Verified", "Garden notes"]))).toEqual([
      "badge (read \"Verified\" on a row it kept) is present",
      "title contains \"garden\""
    ]);
  });

  it("knows the column is not stored from any one layer that leaves it out", () => {
    const said = "badge (read \"Verified\" on a row it kept) is present";
    // The page's field map kept the badge, but the schema does not store it.
    expect(conditionsOf(articleNode({ schema: ["title", "link"] }), articleAttempt(["Verified", null], ["title", "link", "badge"]))?.[0]).toBe(said);
    // Only the answer's columns leave it out.
    expect(conditionsOf(articleNode({ schema: ["title", "link", "badge"], columns: ["title", "link"] }), articleAttempt(["Verified", null], ["title", "link", "badge"]))?.[0]).toBe(said);
    // Only the page's field map leaves it out (the domain took it out of the read).
    expect(conditionsOf(articleNode({}), articleAttempt(["Verified", null]))?.[0]).toBe(said);
  });

  it("says nothing where every layer stores the column, or where no layer is stated", () => {
    const stored = articleNode({ schema: ["title", "link", "badge"] });
    expect(conditionsOf(stored, articleAttempt(["Verified", null], ["title", "link", "badge"]))?.[0]).toBe("badge is present");
    const attempt = articleAttempt(["Verified", null]);
    delete (attempt.metadata!.extraction as Record<string, unknown>).fieldNames;
    expect(conditionsOf(articleNode({}), attempt)?.[0]).toBe("badge is present");
  });

  it("names a read that is the unstored column's own read by the column, with its value", () => {
    const node = articleNode();
    (node.parameterValues!.extractList as { where: unknown[] }).where[0] = { read: { ...BADGE, required: false }, is: "present" };
    expect(conditionsOf(node, articleAttempt(["Verified", null]))?.[0]).toBe("badge (read \"Verified\" on a row it kept) is present");
  });

  it("withholds a found value shaped like a locator or a secret, or a denied key, and never names a denied column", () => {
    for (const value of [".badge > i", "sk-abcdefghij0123456789abcdef", "innerHTML"]) {
      const said = conditionsOf(articleNode(), articleAttempt([value, null]), ["inner_html"]);
      expect(said?.[0], value).toBe("badge is present");
    }
    expect(conditionsOf(articleNode(), articleAttempt(["Verified", null]), ["badge"])?.[0]).toBe("a value is present");
  });

  it("states the stored columns only from stated layers", () => {
    expect(automationStudioResultReadStoredColumns({}, undefined)).toBeUndefined();
    expect(automationStudioResultReadStoredColumns({ fieldNames: ["a", "b", "c"] }, { out: { datasetId: "d", schema: { fields: [{ id: "b" }, { id: "c" }] }, process: { columns: ["c", "b"] } } })).toEqual(new Set(["b", "c"]));
    expect(automationStudioResultReadStoredColumns({ fieldNames: ["a", "b"] }, { out: { datasetId: " ", schema: { fields: [{ id: "a" }] } } })).toEqual(new Set(["a", "b"]));
  });
});
