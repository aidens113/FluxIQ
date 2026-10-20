// A repeat over a listing visits the listing's own rows in its own order
// (t741): a sort or limit in the listing's `recordOutput.process` shapes only
// the saved answer, so a lasting act in the repeat's span would land on rows in
// page order. Refused at the listing, unless the span makes no lasting act.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { automationStudioFlowPlanListingOrderInRepeatIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const READ = "web.output.dom-extract_list";
const CLICK = "web.output.dom-click";

type Node = { key: string; definitionId: string; parameters?: JsonObject; consequences?: string[] };

/** The shape a `repeat over: rows` span assembles into: the listing feeds a For Each, whose body joins back before it. */
function rowsLoop(listing: JsonObject, act: { consequences?: string[] }): AutomationStudioFlowBootstrapPlan {
  const nodes: Node[] = [
    { key: "s1", definitionId: "web.output.browser-navigate" },
    { key: "s2", definitionId: READ, parameters: listing },
    { key: "s3", definitionId: "builtin.control.merge" },
    { key: "s4", definitionId: "builtin.control.for-each" },
    { key: "s5", definitionId: CLICK, ...act },
    { key: "s6", definitionId: "builtin.control.merge" }
  ];
  const edges = ["s1.success>s2.in", "s2.success>s3.in", "s2.records>s4.items", "s3.success>s4.in", "s4.body>s5.in", "s4.item>s5.item", "s5.success>s3.branches", "s4.done>s6.in"];
  return {
    schemaVersion: "0.1",
    router: { name: "Rows", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary", name: "Primary", role: "primary",
      nodes: nodes.map((node) => ({ definitionVersion: "1.0.0", ...node })),
      edges: edges.map((pair, index) => {
        const [source, target] = pair.split(">") as [string, string];
        const [sourceKey, sourcePort] = source.split(".") as [string, string];
        const [targetKey, targetPort] = target.split(".") as [string, string];
        return { key: `e${index}`, source: { nodeKey: sourceKey, portId: sourcePort }, target: { nodeKey: targetKey, portId: targetPort } };
      })
    }]
  };
}

const SCHEMA = { schemaVersion: "0.1", fields: [{ id: "number", label: "Number", valueType: "string" }, { id: "due", label: "Due", valueType: "string" }] };
const processed = (process: JsonObject): JsonObject => ({ extractList: { handle: "extraction.1" }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process } });
const issues = (built: AutomationStudioFlowBootstrapPlan) => automationStudioFlowPlanListingOrderInRepeatIssues({ plan: built, registry, resolution });

describe("a listing whose recordOutput.process orders or narrows the rows a lasting repeat acts on", () => {
  it("is refused once, at the listing's process sort, with what the repeat visits and where the order goes", () => {
    const found = issues(rowsLoop(processed({ sort: [{ field: "due", order: "asc", as: "date" }], limit: 2 }), { consequences: ["modify_existing"] }));
    expect(found).toEqual([expect.objectContaining({ severity: "error", code: "record_output.process_order_in_repeat", path: "plan.subflows.0.nodes.1.parameters.recordOutput.process.sort" })]);
    expect(found[0]!.message).toContain("A repeat visits the rows in the listing's own order");
    expect(found[0]!.instead).toContain("`extractList.sort: [{\"field\": \"<column>\", \"order\": \"asc\", \"as\": \"date\"}]`");
    expect(found[0]!.instead).toContain("`extractList.where`");
    expect(found[0]!.instead).toContain("`repeat most: <N>`");
  });

  it("is refused at a process limit alone, for each lasting class", () => {
    for (const lasting of ["create_new", "modify_existing", "delete", "move_money", "send_or_publish"]) {
      const found = issues(rowsLoop(processed({ limit: 3 }), { consequences: [lasting] }));
      expect(found.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.recordOutput.process.limit"]);
    }
  });

  it("allows a process sort or limit when the repeat makes no lasting act", () => {
    expect(issues(rowsLoop(processed({ sort: [{ field: "due", order: "desc" }], limit: 2 }), {}))).toEqual([]);
    expect(issues(rowsLoop(processed({ sort: [{ field: "due", order: "desc" }], limit: 2 }), { consequences: [] }))).toEqual([]);
  });

  it("allows the order on the listing itself, and a process that neither sorts nor limits", () => {
    const listingSort = { extractList: { handle: "extraction.1", sort: [{ field: "due", order: "asc", as: "date" }] }, recordOutput: { datasetId: "invoices", schema: SCHEMA } };
    expect(issues(rowsLoop(listingSort, { consequences: ["modify_existing"] }))).toEqual([]);
    expect(issues(rowsLoop(processed({ where: [{ field: "due", is: "present" }], columns: ["number"] }), { consequences: ["modify_existing"] }))).toEqual([]);
  });

  it("leaves a process sort alone on a listing no repeat walks", () => {
    const looped = rowsLoop(processed({ sort: [{ field: "due", order: "asc" }] }), { consequences: ["modify_existing"] });
    const subflow = looped.subflows[0]!;
    // The act stays in a loop after the read, but nothing feeds the For Each from it.
    const once = { ...looped, subflows: [{ ...subflow, edges: subflow.edges.filter((edge) => edge.target.portId !== "items") }] };
    expect(issues(once)).toEqual([]);
  });
});
