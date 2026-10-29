// A repeat over a listing visits the listing's own rows in its own order
// (t741): a sort or limit in the listing's `recordOutput.process` shapes only
// the saved answer, so a lasting act in the repeat's span would land on rows in
// page order. Refused at the listing, unless the span makes no lasting act.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { automationStudioFlowPlanListingOrderInRepeatIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const READ = "web.output.dom-extract_list";
const CLICK = "web.output.dom-click";

type Node = { key: string; definitionId: string; parameters?: JsonObject; consequences?: string[] };

/** The shape a `repeat over: rows` span assembles into: the listing feeds a For Each, whose body joins back before it. */
function rowsLoop(listing: JsonObject, act: { consequences?: string[] }, most?: string | number, order?: JsonValue): AutomationStudioFlowBootstrapPlan {
  const loop: JsonObject = { ...(most === undefined ? {} : { stopAfter: most }), ...(order === undefined ? {} : { order }) };
  const nodes: Node[] = [
    { key: "s1", definitionId: "web.output.browser-navigate" },
    { key: "s2", definitionId: READ, parameters: listing },
    { key: "s3", definitionId: "builtin.control.merge" },
    { key: "s4", definitionId: "builtin.control.for-each", ...(Object.keys(loop).length ? { parameters: loop } : {}) },
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

// t751, photo rerun 5 (`run-mvhibis0-b536958b`): the web read hands its rows on in page order and
// moves `extractList.sort`/`maxItems` into the process, so the t741 `instead` was refused in turn and
// so was the one coherent shape left. A listing node now says so in its definition's metadata.
describe("a listing whose node declares it hands its rows on in page order", () => {
  const pageOrder = new AutomationStudioNodeRegistry([
    ...canonicalBuiltinAutomationNodeDefinitions,
    ...webDomainNodeDefinitionsFixture().map((definition) => definition.id !== READ ? definition : {
      ...definition,
      metadata: { ...definition.metadata, answersRows: "page_order", recordProcessWrittenAt: { sort: "extractList.sort", limit: "extractList.maxItems" } }
    })
  ]);
  const declared = (built: AutomationStudioFlowBootstrapPlan) => automationStudioFlowPlanListingOrderInRepeatIssues({ plan: built, registry: pageOrder, resolution });

  it("admits a process limit equal to repeat most, with no sort, under a lasting repeat", () => {
    expect(declared(rowsLoop(processed({ limit: 3 }), { consequences: ["modify_existing"] }, "3"))).toEqual([]);
    expect(declared(rowsLoop(processed({ limit: 3, columns: ["number"] }), { consequences: ["delete"] }, 3))).toEqual([]);
  });

  it("still refuses a limit that is not the repeat's own, or a repeat that walks every row, naming that N", () => {
    const other = declared(rowsLoop(processed({ limit: 5 }), { consequences: ["modify_existing"] }, "3"));
    expect(other.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.recordOutput.process.limit"]);
    expect(other[0]!.instead).toContain("`repeat most: 3`");
    expect(other[0]!.instead).toContain("`\"limit\": 3` in `recordOutput.process`");
    const every = declared(rowsLoop(processed({ limit: 3 }), { consequences: ["modify_existing"] }));
    expect(every.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.recordOutput.process.limit"]);
    expect(every[0]!.instead).toContain("`repeat most: <N>`");
  });

  it("refuses a limit beside a process where, which saves rows the repeat did not act on", () => {
    const found = declared(rowsLoop(processed({ where: [{ field: "due", is: "present" }], limit: 3 }), { consequences: ["modify_existing"] }, "3"));
    expect(found.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.recordOutput.process.limit"]);
    expect(found[0]!.instead).toContain("Take `recordOutput.process.where` out.");
  });

  // t796 (`run-mvtdn37t-e1e4d0a7`, 0105, 0140, 0230): each `extractList.sort` was refused under a sentence about
  // `recordOutput.process`, a key the model had not written, and "the N most recent" had no way to be said.
  // Core now hands the For Each the rows in the listing's own sort (`../repeat-order.ts`).
  const newestFirst = [{ field: "due", order: "desc", as: "date" }];

  it("admits the listing's own sort when every lasting repeat over it is handed its rows in that order", () => {
    const sorted = { extractList: { handle: "extraction.1", sort: newestFirst }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: newestFirst } } };
    expect(declared(rowsLoop(sorted, { consequences: ["modify_existing"] }, "3", newestFirst))).toEqual([]);
    // With a limit of the same N, the rows it saves are the first N of the same order.
    const limited = { extractList: { handle: "extraction.1", sort: newestFirst, maxItems: 3 }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: newestFirst, limit: 3 } } };
    expect(declared(rowsLoop(limited, { consequences: ["modify_existing"] }, 3, newestFirst))).toEqual([]);
  });

  it("refuses the listing's sort a repeat is not handed, at the key the model wrote, never naming recordOutput.process", () => {
    const sortWritten = { extractList: { handle: "extraction.1", sort: [{ field: "due", order: "asc" }], maxItems: 3 }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: [{ field: "due", order: "asc" }], limit: 3 } } };
    for (const order of [undefined, newestFirst]) {
      const sorted = declared(rowsLoop(sortWritten, { consequences: ["modify_existing"] }, "3", order));
      expect(sorted.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.extractList.sort"]);
      expect(sorted[0]!.message).toContain("`extractList.sort`");
      expect(sorted[0]!.message).not.toContain("recordOutput.process");
      expect(sorted[0]!.instead).toContain("`repeat over:`");
      expect(sorted[0]!.instead).not.toContain("recordOutput.process");
    }
    // A maxItems the domain has not moved into the process is read too.
    const unmoved = { extractList: { handle: "extraction.1", maxItems: 5 }, recordOutput: { datasetId: "invoices", schema: SCHEMA } };
    const limited = declared(rowsLoop(unmoved, { consequences: ["modify_existing"] }, "3"));
    expect(limited.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.extractList.maxItems"]);
    expect(limited[0]!.message).toContain("`extractList.maxItems`");
    expect(limited[0]!.message).not.toContain("recordOutput.process");
    expect(declared(rowsLoop({ ...unmoved, extractList: { handle: "extraction.1", maxItems: 3, sort: [] } }, { consequences: ["modify_existing"] }, "3"))).toEqual([]);
  });

  it("refuses a sort written only in recordOutput.process, naming it, and puts the order on the listing instead", () => {
    const found = declared(rowsLoop(processed({ sort: [{ field: "due", order: "asc", as: "date" }], limit: 3 }), { consequences: ["modify_existing"] }, "3"));
    expect(found).toEqual([expect.objectContaining({ code: "record_output.process_order_in_repeat", path: "plan.subflows.0.nodes.1.parameters.recordOutput.process.sort" })]);
    expect(found[0]!.message).toContain("`recordOutput.process.sort`");
    const instead = found[0]!.instead!;
    expect(instead).toContain("`extractList.sort`");
    expect(instead).toContain("`repeat most: 3`");
    expect(instead).toContain("Take `recordOutput.process.sort` out.");
  });

  it("refuses a limit beside an applied sort that is not the repeat's own, and keeps the sort in its instead", () => {
    const refused = { extractList: { handle: "extraction.1", where: [{ field: "due", is: "present" }], sort: newestFirst, maxItems: 5 }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: newestFirst, limit: 5 } } };
    const found = declared(rowsLoop(refused, { consequences: ["modify_existing"] }, "3", newestFirst));
    expect(found.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.extractList.maxItems"]);
    expect(found[0]!.instead).toContain("in the order `extractList.sort` asks for");
    expect(found[0]!.instead).toContain("`extractList.maxItems: 3`");
    expect(found[0]!.instead).not.toContain("Take `extractList.sort` out");
  });

  it("applying its instead literally gives a listing the rule admits", () => {
    const refused = { extractList: { handle: "extraction.1", where: [{ field: "due", is: "present" }], sort: newestFirst, maxItems: 5 }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: newestFirst, limit: 5 } } };
    expect(declared(rowsLoop(refused, { consequences: ["modify_existing"] }, "3", newestFirst))).toHaveLength(1);
    // Write extractList.maxItems: 3 with the repeat's own 3 (the domain moves it to the process limit).
    const answered = { extractList: { handle: "extraction.1", where: [{ field: "due", is: "present" }], sort: newestFirst, maxItems: 3 }, recordOutput: { datasetId: "invoices", schema: SCHEMA, process: { sort: newestFirst, limit: 3 } } };
    expect(declared(rowsLoop(answered, { consequences: ["modify_existing"] }, "3", newestFirst))).toEqual([]);
  });

  it("a sort on a page-order listing feeding a lasting repeat is applied by Core before the loop", () => {
    // A library catalogue lists two featured books first: the three newest are a sort and `repeat most: 3`.
    const script = [
      "flow: Place a hold on the three newest books",
      "step: open the catalogue",
      "  node: web.browser.navigate",
      "  url: https://library.test/catalogue",
      "step books: list the books",
      "  node: web.dom.extract_list",
      "  extractList: extraction.1",
      "  extractList.sort: [{\"field\": \"published\", \"order\": \"desc\", \"as\": \"date\"}]",
      "step: place a hold on the book",
      "  node: web.dom.click",
      "  target: t30",
      "  consequences: create_new",
      "  repeat over: books",
      "  repeat most: 3"
    ].join("\n");
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: script }, registry: pageOrder, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    if (!accepted.ok) return;
    const loop = accepted.plan.subflows[0]!.nodes.find((node) => node.definitionId === "builtin.control.for-each")!;
    expect(loop.parameters).toMatchObject({ stopAfter: 3, order: [{ field: "published", order: "desc", as: "date" }] });
    expect(declared(accepted.plan)).toEqual([]);
  });

  it("leaves a listing that declares no capability on today's rule", () => {
    const found = issues(rowsLoop(processed({ limit: 3 }), { consequences: ["modify_existing"] }, "3"));
    expect(found.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.1.parameters.recordOutput.process.limit"]);
    expect(found[0]!.instead).toContain("`extractList.sort:");
  });
});
