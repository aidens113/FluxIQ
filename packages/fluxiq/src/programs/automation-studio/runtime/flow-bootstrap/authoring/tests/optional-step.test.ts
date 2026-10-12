// A script step marked `optional: yes` (t357).
//
// Lane A's candidate scripts had no way to say a step is only sometimes needed
// -- a consent banner or popup that may not show -- although the runtime
// already skips an absent step of that kind (`executor/step-skip/absent-step.ts`).
// What is checked is the graph the line assembles to and what the runtime does
// with it, never a field copied back out of the line: the optional shape a
// drafted `optional` step becomes, which the absent-step skip goes past when
// the target is not there. The refusals are the one checker's
// (`../../script-statements/guarded-steps.ts`), and each names the line that said
// optional.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioAbsentStepSkip } from "../../../executor/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
// The real web library beside Core's built-in nodes, the Merge an optional step joins at among them.
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

function accept(lines: string[]) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
}

/** The banner flow: open, close the banner (optional or not), type the query. */
function banner(optionalLine?: string): string[] {
  return [
    "flow: Search the shop",
    "step: open the shop",
    "  node: web.browser.navigate",
    "  url: https://shop.test/",
    "step: close the cookie banner if it shows",
    "  node: web.dom.click",
    "  selector: #accept",
    "  consequences: none",
    ...(optionalLine === undefined ? [] : [`  ${optionalLine}`]),
    "step: type the query",
    "  node: web.dom.type",
    "  selector: #q",
    "  text: earbuds"
  ];
}

/** Each edge as `source.port -> target.port`. */
function wiring(plan: AutomationStudioFlowBootstrapPlan): string[] {
  return plan.subflows[0]!.edges.map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}.${edge.target.portId}`);
}

/** The assembled plan's first Subflow as the document the executor runs. */
function flowDocument(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioFlowDocument {
  const subflow = plan.subflows[0]!;
  return {
    schemaVersion: "0.1", flowId: "flow.optional-step", ownerKind: "task", ownerId: "task.optional-step", name: "Optional step", createdAt: 1, updatedAt: 1,
    nodes: subflow.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) })),
    edges: subflow.edges.map((edge) => ({ id: edge.key, sourceNodeId: edge.source.nodeKey, targetNodeId: edge.target.nodeKey, sourcePortId: edge.source.portId, targetPortId: edge.target.portId }))
  };
}

const ABSENT = { status: "failed" as const, failure: { category: "target_not_found" as const, code: "web.target.not_found", retryable: false } };

function errors(accepted: ReturnType<typeof accept>) {
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => ({ code: issue.code, path: issue.path }));
}

describe("a script step marked optional", () => {
  it("assembles into the optional shape: the step's failed and success ways out meet at a Merge, and the run goes on from it", () => {
    const accepted = accept(banner("optional: yes"));
    expect(errors(accepted)).toEqual([]);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]!.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-click", "builtin.control.merge", "web.output.dom-type"
    ]);
    // The drafted optional shape, edge for edge (`draft-routing.test.ts`: "click:failed -> merge:in").
    expect(wiring(accepted.plan)).toEqual(["s2.failed -> s3.in", "s1.success -> s2.in", "s2.success -> s3.branches", "s3.success -> s4.in"]);
    // The press keeps everything it said; optional is a statement about the step, never a parameter.
    expect(accepted.plan.subflows[0]!.nodes[1]).toMatchObject({ consequences: [], parameters: { selector: "#accept" } });
    expect(accepted.plan.subflows[0]!.nodes[1]!.parameters).not.toHaveProperty("optional");
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("is a step the runtime skips when its target is absent, exactly as it skips one marked sometimes present", () => {
    const accepted = accept(banner("optional: yes"));
    if (!accepted.ok) throw new Error("the optional banner flow was refused");
    const flow = flowDocument(accepted.plan);
    const skip = automationStudioAbsentStepSkip(flow, flow.nodes[1]!, ABSENT);
    expect(skip).toMatchObject({ sourceNodeId: "s2", sourcePortId: "failed", targetNodeId: "s3" });
    // The line is what makes it so: the same script without it is not skipped.
    const plain = accept(banner());
    if (!plain.ok) throw new Error("the plain banner flow was refused");
    const plainFlow = flowDocument(plain.plan);
    expect(automationStudioAbsentStepSkip(plainFlow, plainFlow.nodes[1]!, ABSENT)).toBeUndefined();
  });

  it("reads `sometimes present: yes` and a bare `optional:` as yes, and `optional: no` as a step written without the line", () => {
    const sometimes = accept(banner("sometimes present: yes"));
    const bare = accept(banner("optional:"));
    const no = accept(banner("optional: no"));
    const plain = accept(banner());
    for (const yes of [sometimes, bare]) expect(yes.ok && yes.plan.subflows[0]!.nodes.map((node) => node.definitionId)).toContain("builtin.control.merge");
    expect(no.ok && wiring(no.plan)).toEqual(plain.ok && wiring(plain.plan));
  });

  it("leaves a script with no optional line as it always was", () => {
    const plain = accept(banner());
    expect(plain.ok && plain.plan.subflows[0]!.nodes.map((node) => node.definitionId)).toEqual(["web.output.browser-navigate", "web.output.dom-click", "web.output.dom-type"]);
  });

  it("gives each block's optional step its own join, so two blocks never share a label", () => {
    const accepted = accept([
      "flow: Read the orders",
      "subflow notice: a notice is showing",
      "  when: state.page.dialog exists",
      "  step: close the banner",
      "    node: web.dom.click",
      "    selector: #accept",
      "    consequences: none",
      "    optional: yes",
      "  step: read the orders",
      "    node: web.dom.extract_list",
      "    extractList: {\"item\": \".order\", \"fields\": {\"name\": \".name\"}}",
      "end",
      "step: close the banner",
      "  node: web.dom.click",
      "  selector: #accept",
      "  consequences: none",
      "  optional: yes",
      "step: read the orders",
      "  node: web.dom.extract_list",
      "  extractList: {\"item\": \".order\", \"fields\": {\"name\": \".name\"}}"
    ]);
    expect(errors(accepted)).toEqual([]);
    expect(accepted.ok && accepted.plan.subflows.map((subflow) => subflow.nodes.filter((node) => node.definitionId === "builtin.control.merge").length)).toEqual([1, 1]);
  });
});

describe("an optional line where it cannot stand", () => {
  it("refuses a value that is neither yes nor no, naming the line", () => {
    expect(errors(accept(banner("optional: perhaps")))).toEqual([{ code: "flow_script.optional_invalid", path: "flow.line.9" }]);
  });

  it("refuses an optional step that also branches, naming the optional line", () => {
    const accepted = accept([...banner("optional: yes").slice(0, 9), "  on failed: go to query", "step query: type the query", "  node: web.dom.type", "  selector: #q", "  text: earbuds"]);
    expect(accepted.ok).toBe(false);
    expect(errors(accepted)).toContainEqual({ code: "flow_script.optional_misplaced", path: "flow.line.9" });
    expect(accepted.issues.find((issue) => issue.code === "flow_script.optional_misplaced")?.message).toContain("on failed:");
  });

  // t378 W8: an optional step inside a repeat is now taken (it is done on the
  // passes that need it), and its way past joins inside the span; the shape is
  // checked in `./guarded-loop.test.ts`. Only the one ending a `repeat while`
  // span, the check that repeats it, is still refused (below).
  it("takes an optional step inside a repeat, which it once refused", () => {
    const accepted = accept([
      "flow: Confirm every request",
      "step: open the requests",
      "  node: web.browser.navigate",
      "  url: https://social.test/requests",
      "step requests: list the requests",
      "  node: web.dom.extract_list",
      "  extractList: {\"item\": \".request\", \"fields\": {\"name\": \".name\"}}",
      "step: confirm the request",
      "  node: web.dom.click",
      "  selector: .confirm",
      "  consequences: modify_existing",
      "  repeat over: requests",
      "  repeat through: done",
      "step done: close the thank-you popup",
      "  node: web.dom.click",
      "  selector: .close",
      "  consequences: none",
      "  optional: yes"
    ]);
    expect(errors(accepted)).toEqual([]);
    expect(accepted.ok).toBe(true);
  });

  it("refuses the step that says repeat being optional too, when it alone is a repeat while span", () => {
    const accepted = accept([
      "flow: Read every page",
      "step: open the results",
      "  node: web.browser.navigate",
      "  url: https://shop.test/search",
      "step page: read this page",
      "  node: web.dom.extract_list",
      "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
      "  optional: yes",
      "  repeat while: page",
      "  repeat most: 3"
    ]);
    expect(errors(accepted)).toContainEqual({ code: "flow_script.optional_misplaced", path: "flow.line.8" });
  });

  it("refuses a node with no failed way out, which the run could not go past", () => {
    const accepted = accept([
      "flow: Stop",
      "step: open the shop",
      "  node: web.browser.navigate",
      "  url: https://shop.test/",
      "step: stop here",
      "  node: builtin.control.end",
      "  optional: yes"
    ]);
    expect(errors(accepted)).toEqual([{ code: "flow_script.optional_misplaced", path: "flow.line.7" }]);
  });
});

describe("an optional step before a repeat", () => {
  it("builds: the banner is skipped or closed, then the pages are read", () => {
    const accepted = accept([
      "flow: Earbuds on every page",
      "step: open the results",
      "  node: web.browser.navigate",
      "  url: https://shop.test/search?q=earbuds",
      "step: close the cookie banner if it shows",
      "  node: web.dom.click",
      "  selector: #accept",
      "  consequences: none",
      "  optional: yes",
      "step page: read this page",
      "  node: web.dom.extract_list",
      "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
      "  repeat while: page",
      "  repeat most: 3"
    ]);
    expect(errors(accepted)).toEqual([]);
    if (!accepted.ok) return;
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
