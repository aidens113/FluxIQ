// A row across a call, in a script (`../called-parts.ts`): a part declares
// `input: row`, the step that calls it inside `repeat over:` says `row: $row`, and the graph
// that makes is the one the run's row re-check follows (`engine/automation/target-reacquire/`).
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../../framework/automation-service/nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapWrittenPlanBindingIssues } from "../../authoring/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition.id === "web.output.dom-click" ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition);

const LISTING = JSON.stringify({ item: ".station", fields: { name: ".name" } });
const part = ["part mark: mark the reading on one station", "  input: row", "  step press: mark it", "    node: web.dom.click", "    selector: .mark", "    consequences: modify_existing", "end"];
const script = (callLines: readonly string[], partLines: readonly string[] = part): string => [
  "flow: Mark every station's reading",
  "step open: open the list",
  "  node: web.browser.navigate",
  "  url: https://stations.example/",
  "step read: read the stations",
  "  node: web.dom.extract_list",
  `  extractList: ${LISTING}`,
  "step each: mark this station",
  "  call: mark",
  ...callLines,
  "  repeat over: read",
  ...partLines
].join("\n");
const accept = (flow: string) => acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
const codes = (flow: string) => {
  const accepted = accept(flow);
  return accepted.ok ? [] : accepted.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
};

describe("a row handed across a call", () => {
  it("`input: row` is the frame's row and `row: $row` hands the pass's row: the graph the run's re-check follows, with a For Each around the call", () => {
    const accepted = accept(script(["  row: $row"]));
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const main = accepted.plan.subflows.find((subflow) => subflow.key === "main")!;
    const called = accepted.plan.subflows.find((subflow) => subflow.key === "mark")!;
    const call = main.nodes.find((node) => node.definitionId === "builtin.control.call-subflow")!;
    expect(call.parameters).toMatchObject({ subflowId: "mark", inputs: { item: { $state: { path: "item" } } } });
    expect(called.interface?.inputs.map((port) => [port.id, port.required])).toEqual([["item", true]]);
    const each = main.nodes.find((node) => node.definitionId === "builtin.control.for-each")!;
    expect(main.edges.some((edge) => edge.source.nodeKey === each.key && edge.source.portId === "body" && edge.target.nodeKey === call.key), "the call is the loop's body").toBe(true);
    expect(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution }).filter((issue) => issue.severity === "error")).toEqual([]);
    const canonical = validateAutomationStudioFlowBootstrapPlan({ plan: structuredClone(accepted.plan), registry, resolution });
    expect(canonical.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("a part with no row input assembles exactly as before: its inputs keep their own names", () => {
    const accepted = accept(script(["  station: $row.name"], ["part mark: mark the reading on one station", "  input: station", "  step press: mark it", "    node: web.dom.click", "    selector: .mark", "    consequences: modify_existing", "end"]));
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const main = accepted.plan.subflows.find((subflow) => subflow.key === "main")!;
    expect(main.nodes.find((node) => node.definitionId === "builtin.control.call-subflow")!.parameters).toMatchObject({ inputs: { station: { $state: { path: "item.name" } } } });
    expect(accepted.plan.subflows.find((subflow) => subflow.key === "mark")!.interface?.inputs.map((port) => port.id)).toEqual(["station"]);
  });

  it("`$row` outside a repeat is refused, as a row's field is: there is no row there to hand", () => {
    const accepted = accept(script(["  row: $row"]).replace("  repeat over: read\n", ""));
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution }).map((issue) => issue.code)).toContain("flow_draft.row_binding_outside_loop");
  });

  it("`row:` takes `$row` and nothing else, refused at its line: anything else there would not be a row", () => {
    expect(codes(script(["  row: $row.name"]))).toContain("flow_script.invalid_binding");
    expect(codes(script(["  row: 3"]))).toContain("flow_script.invalid_binding");
  });

  it("`$input.row` is refused with what to write instead, rather than reading nothing at the run", () => {
    const accepted = accept(script(["  row: $row"], ["part mark: mark the reading on one station", "  input: row", "  step press: mark it", "    node: web.dom.type", "    selector: .note", "    text: $input.row", "end"]));
    expect(accepted.ok).toBe(false);
    const refused = accepted.ok ? undefined : accepted.issues.find((issue) => issue.code === "flow_script.invalid_binding");
    expect(refused?.message).toContain("`input: station`");
  });

  it("`item` stays refused as a part's input: `row` is the one word for it", () => {
    expect(codes(script(["  item: $row"], ["part mark: mark the reading on one station", "  input: item", "  step press: mark it", "    node: web.dom.click", "    selector: .mark", "    consequences: modify_existing", "end"]))).toContain("flow_script.part_interface_invalid");
  });
});
