// A repeat over a listing visits every row the listing's read kept (t800): a
// where in the listing's `recordOutput.process` shapes only the saved answer,
// so a lasting act in the repeat would land on rows the answer leaves out.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { automationStudioFlowPlanRepeatWhereInProcessIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const READ = "web.output.dom-extract_list";
const SCHEMA = { schemaVersion: "0.1", fields: [{ id: "number", label: "Number", valueType: "string" }] };

/** The shape a `repeat over: rows` span assembles into; `looped` false leaves the listing feeding nothing. */
function plan(listing: JsonObject, act: { consequences?: string[] }, looped = true): AutomationStudioFlowBootstrapPlan {
  const nodes = [
    { key: "s1", definitionId: "web.output.browser-navigate" },
    { key: "s2", definitionId: READ, parameters: listing },
    { key: "s3", definitionId: "builtin.control.merge" },
    { key: "s4", definitionId: "builtin.control.for-each" },
    { key: "s5", definitionId: "web.output.dom-click", ...act },
    { key: "s6", definitionId: "builtin.control.merge" }
  ];
  const edges = ["s1.success>s2.in", "s2.success>s3.in", ...(looped ? ["s2.records>s4.items"] : []), "s3.success>s4.in", "s4.body>s5.in", "s4.item>s5.item", "s5.success>s3.branches", "s4.done>s6.in"];
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

const listing = (process?: JsonObject): JsonObject => ({ extractList: { handle: "extraction.1" }, recordOutput: { datasetId: "invoices", schema: SCHEMA, ...(process ? { process } : {}) } });
const issues = (built: AutomationStudioFlowBootstrapPlan) => automationStudioFlowPlanRepeatWhereInProcessIssues({ plan: built, registry, resolution });
const WHERE = [{ field: "number", is: "present" }];

describe("a listing whose recordOutput.process narrows the rows a lasting repeat acts on", () => {
  it("is refused once, at the process where, with Core's own sentence", () => {
    const found = issues(plan(listing({ where: WHERE }), { consequences: ["modify_existing"] }));
    expect(found).toEqual([expect.objectContaining({ severity: "error", code: "record_output.process_where_in_repeat", path: "plan.subflows.0.nodes.1.parameters.recordOutput.process.where" })]);
    expect(found[0]!.message).toContain("Put the condition on the listing's read so the repeat runs over kept rows only");
  });

  it("is left alone when the repeat makes no lasting act", () => {
    expect(issues(plan(listing({ where: WHERE }), {}))).toEqual([]);
    expect(issues(plan(listing({ where: WHERE }), { consequences: ["none"] }))).toEqual([]);
  });

  it("is left alone when no repeat walks the listing, or the process has no where", () => {
    expect(issues(plan(listing({ where: WHERE }), { consequences: ["delete"] }, false))).toEqual([]);
    expect(issues(plan(listing({ columns: ["number"] }), { consequences: ["delete"] }))).toEqual([]);
    expect(issues(plan(listing({ where: [] }), { consequences: ["delete"] }))).toEqual([]);
    expect(issues(plan(listing(), { consequences: ["delete"] }))).toEqual([]);
  });
});
