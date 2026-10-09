// Every plan path a refusal can name is placed at the step the model wrote
// (t378): a node at its step's `step:` line, a node Core derived at the step
// whose statement made it, a script line at the step it is in, a block's own
// line at the block, an edge at the step it leaves, a router rule at its block.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapIssuePlace, type AutomationStudioFlowBootstrapIssueLocator } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const SCRIPT = [
  "flow: Find the cheapest kettle",          // 1
  "step: open the shop",                      // 2
  "  node: web.browser.navigate",             // 3
  "  url: https://shop.test/",                // 4
  "step banner: close the banner if it shows", // 5
  "  node: web.dom.click",                    // 6
  "  selector: .close",                       // 7
  "  consequences: none",                     // 8
  "  optional: yes",                          // 9
  "step: search for kettles",                 // 10
  "  node: web.dom.type",                     // 11
  "  selector: #q",                           // 12
  "  text: kettle",                           // 13
  "subflow sale: The sale page",              // 14
  "  when: state.page.url contains /sale",    // 15
  "step: read the sale",                      // 16
  "  node: web.dom.extract_list",             // 17
  "  extractList: {\"item\": \".deal\", \"fields\": {\"name\": \".name\"}}" // 18
].join("\n");

function locator(text = SCRIPT): AutomationStudioFlowBootstrapIssueLocator {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: text }, registry, resolution });
  if (!accepted.locator) throw new Error("no locator");
  return accepted.locator;
}

describe("where a refusal is in the script", () => {
  it("places each node at the step it is, and the optional step's join at the optional step", () => {
    const at = locator();
    const place = (path: string) => automationStudioFlowBootstrapIssuePlace(at, path);
    expect(place("plan.subflows.0.nodes.0.parameters.url")).toEqual({ step: "open the shop", line: 2 });
    expect(place("plan.subflows.0.nodes.1.parameters")).toEqual({ step: "close the banner if it shows", label: "banner", line: 5 });
    // Node 2 is the Merge the optional step at line 5 joins at: Core's, so it is said to be that step.
    expect(place("plan.subflows.0.nodes.2")).toEqual({ step: "close the banner if it shows", label: "banner", line: 5 });
    expect(place("plan.subflows.0.nodes.3.parameters.text")).toEqual({ step: "search for kettles", line: 10 });
    expect(place("plan.subflows.1.nodes.0.parameters.extractList")).toEqual({ step: "read the sale", line: 16 });
  });

  it("places a script line at the step it is in, and a block's own line at the block", () => {
    const at = locator();
    const place = (line: number) => automationStudioFlowBootstrapIssuePlace(at, `flow.line.${line}`);
    expect(place(9)).toEqual({ step: "close the banner if it shows", label: "banner", line: 9 });
    expect(place(13)).toEqual({ step: "search for kettles", line: 13 });
    expect(place(14)).toEqual({ step: "The sale page", label: "sale", line: 14 });
    expect(place(15)).toEqual({ step: "The sale page", label: "sale", line: 15 });
    expect(place(18)).toEqual({ step: "read the sale", line: 18 });
  });

  it("places an edge at the step it leaves, a Subflow and a rule at their block, and the fallback at the steps outside every block", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: SCRIPT }, registry, resolution });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const at = accepted.locator;
    const place = (path: string) => automationStudioFlowBootstrapIssuePlace(at, path);
    const edges = accepted.plan.subflows[0]!.edges;
    const leaving = (nodeKey: string) => `plan.subflows.0.edges.${edges.findIndex((edge) => edge.source.nodeKey === nodeKey)}.source.portId`;
    expect(place(leaving("s1"))).toEqual({ step: "open the shop", line: 2 });
    // The edge out of the optional step's join is the optional step's.
    expect(place(leaving("s3"))).toEqual({ step: "close the banner if it shows", label: "banner", line: 5 });
    expect(place("plan.subflows.1")).toEqual({ step: "The sale page", label: "sale", line: 14 });
    expect(place("plan.router.rules.0.condition")).toEqual({ step: "The sale page", label: "sale", line: 14 });
    expect(place("plan.router.fallback.targetSubflowKey")).toEqual({ step: "open the shop", line: 2 });
    // The whole Flow is no one step's.
    expect(place("flow")).toBeUndefined();
    expect(place("plan")).toBeUndefined();
  });

  it("places a step that named no node at its own line, though it became no node", () => {
    const text = SCRIPT.replace("  node: web.dom.type", "  node: web.dom.levitate");
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: text }, registry, resolution });
    expect(accepted.ok).toBe(false);
    const unknown = accepted.issues.find((issue) => issue.code === "flow_script.unknown_node");
    expect(automationStudioFlowBootstrapIssuePlace(accepted.locator, unknown?.path)).toEqual({ step: "search for kettles", line: 10 });
  });
});
