// Which steps a loop runs again with a record output that replaces the run's
// rows (t498): a cycle through a Repeat or a For Each is a loop, any other
// cycle is not, and a step outside every loop may replace.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { automationStudioFlowPlanRecordReplaceInRepeatIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const READ = "web.output.dom-extract_list";

/** One Subflow of the nodes given, by key and definition, wired by `from>to` pairs. */
function plan(nodes: Array<[string, string, JsonObject?]>, edges: string[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary", name: "Primary", role: "primary",
      nodes: nodes.map(([key, definitionId, parameters]) => ({ key, definitionId, definitionVersion: "1.0.0", ...(parameters ? { parameters } : {}) })),
      edges: edges.map((pair, index) => {
        const [source, target] = pair.split(">") as [string, string];
        return { key: `e${index}`, source: { nodeKey: source, portId: "success" }, target: { nodeKey: target, portId: "in" } };
      })
    }]
  };
}

const replacing = (writeMode: string) => ({ recordOutput: { datasetId: "rows", writeMode, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] } } });
const issues = (built: AutomationStudioFlowBootstrapPlan) => automationStudioFlowPlanRecordReplaceInRepeatIssues({ plan: built, registry, resolution });

describe("a record output that replaces the run's rows", () => {
  it("is refused on a step a Repeat runs again, at its writeMode", () => {
    const found = issues(plan(
      [["open", "web.output.browser-navigate"], ["loop", "builtin.control.merge"], ["pass", "builtin.control.repeat"], ["read", READ, replacing("replace")], ["next", "web.output.dom-click"], ["exit", "builtin.control.merge"]],
      ["open>loop", "loop>pass", "pass>read", "read>next", "next>loop", "pass>exit"]
    ));
    expect(found).toEqual([expect.objectContaining({ severity: "error", code: "record_output.replace_in_repeat", path: "plan.subflows.0.nodes.3.parameters.recordOutput.writeMode" })]);
    expect(found[0]!.message).toContain("each pass would overwrite the rows the passes before it saved");
  });

  it("is refused on a step a For Each runs once per row, and not on the read that made the rows", () => {
    const found = issues(plan(
      [["rows", READ, replacing("replace")], ["loop", "builtin.control.merge"], ["each", "builtin.control.for-each"], ["detail", READ, replacing("replace")], ["exit", "builtin.control.merge"]],
      ["rows>loop", "loop>each", "each>detail", "detail>loop", "each>exit"]
    ));
    expect(found.map((issue) => issue.path)).toEqual(["plan.subflows.0.nodes.3.parameters.recordOutput.writeMode"]);
  });

  it("is left alone when it appends, when it runs once, and on a cycle through no loop node", () => {
    const appending = plan(
      [["loop", "builtin.control.merge"], ["pass", "builtin.control.repeat"], ["read", READ, replacing("append")], ["exit", "builtin.control.merge"]],
      ["loop>pass", "pass>read", "read>loop", "pass>exit"]
    );
    const once = plan([["open", "web.output.browser-navigate"], ["read", READ, replacing("replace")]], ["open>read"]);
    const recovery = plan([["join", "builtin.control.merge"], ["read", READ, replacing("replace")], ["retry", "web.output.dom-click"]], ["join>read", "read>retry", "retry>join"]);
    expect([...issues(appending), ...issues(once), ...issues(recovery)]).toEqual([]);
  });
});
