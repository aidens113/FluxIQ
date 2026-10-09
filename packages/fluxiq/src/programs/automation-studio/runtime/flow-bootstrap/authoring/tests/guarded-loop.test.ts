// A loop that adapts to a site asking it to slow down (t378): inside a repeat
// span, a step that closes the site's notice when it shows (`optional: yes`),
// a wait that runs only on the passes where it did (`only after:`), and a pace
// between passes (`repeat pace:`). Lane D (`run-mv0fuual-f9e6f089`) could write
// none of the three: an optional step inside a span was refused, and its way
// past would have been refused again as a branch inside the span.
//
// What is checked is the graph the lines assemble to, what the runtime does
// with it when the notice is absent, and where a refusal about each derived
// node would point -- never a field copied back out of the lines.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioAbsentStepSkip } from "../../../executor/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

function accept(lines: string[]) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
}

function errors(accepted: ReturnType<typeof accept>) {
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => ({ code: issue.code, path: issue.path }));
}

/** Each edge as `source.port -> target.port`. */
function wiring(plan: AutomationStudioFlowBootstrapPlan): string[] {
  return plan.subflows[0]!.edges.map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}.${edge.target.portId}`);
}

/** The assembled plan's first Subflow as the document the executor runs. */
function flowDocument(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioFlowDocument {
  const subflow = plan.subflows[0]!;
  return {
    schemaVersion: "0.1", flowId: "flow.guarded-loop", ownerKind: "task", ownerId: "task.guarded-loop", name: "Guarded loop", createdAt: 1, updatedAt: 1,
    nodes: subflow.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) })),
    edges: subflow.edges.map((edge) => ({ id: edge.key, sourceNodeId: edge.source.nodeKey, targetNodeId: edge.target.nodeKey, sourcePortId: edge.source.portId, targetPortId: edge.target.portId }))
  };
}

const ABSENT = { status: "failed" as const, failure: { category: "target_not_found" as const, code: "web.target.not_found", retryable: false } };

/** Lane D's loop, adapted: lines 8-24 are the span, 15-19 the notice, 20-24 the wait. */
const SLOWED = [
  "flow: Confirm every request, as slowly as the site asks",
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
  "  repeat through: cooldown",
  "  repeat pace: 6 s",
  "step notice: close the slow-down notice if it shows",
  "  node: web.dom.click",
  "  selector: .notice-close",
  "  consequences: none",
  "  optional: yes",
  "step cooldown: wait as long as the site asked",
  "  node: builtin.timing.wait",
  "  duration: 6",
  "  unit: seconds",
  "  only after: notice"
];

describe("an optional step and the wait that runs only after it, inside a repeat span", () => {
  it("assembles into the guarded shape: the notice's way past goes to a join inside the span, and the join closes the loop", () => {
    const accepted = accept(SLOWED);
    expect(errors(accepted)).toEqual([]);
    if (!accepted.ok) return;
    const subflow = accepted.plan.subflows[0]!;
    expect(subflow.nodes.map((node) => `${node.key} ${node.definitionId}`)).toEqual([
      "s1 web.output.browser-navigate", "s2 web.output.dom-extract_list", "s3 builtin.control.merge", "s4 builtin.control.for-each",
      "s5 web.output.dom-click", "s6 web.output.dom-click", "s7 builtin.timing.wait", "s8 builtin.control.merge", "s9 builtin.control.merge"
    ]);
    expect(wiring(accepted.plan)).toEqual(expect.arrayContaining([
      // The pass: confirm, then the notice; closed, the wait; gone past, straight to the join.
      "s4.body -> s5.in", "s5.success -> s6.in", "s6.failed -> s8.in", "s6.success -> s7.in", "s7.success -> s8.branches",
      // The join is the span's last step, so every pass goes round from it, the notice closed or not.
      "s8.success -> s3.branches", "s4.done -> s9.in"
    ]));
    // The optional and only-after lines are statements about the steps, never parameters.
    expect(subflow.nodes[5]!.parameters).not.toHaveProperty("optional");
    expect(subflow.nodes[6]!.parameters).not.toHaveProperty("onlyAfter");
    expect(subflow.nodes[6]!.parameters).toMatchObject({ duration: 6, unit: "seconds" });
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("puts the span's pace on its first step's node, and nowhere else", () => {
    const accepted = accept(SLOWED);
    if (!accepted.ok) throw new Error("the slowed loop was refused");
    expect(accepted.plan.subflows[0]!.nodes.flatMap((node) => node.paceMs === undefined ? [] : [`${node.key} ${node.paceMs}`])).toEqual(["s5 6000"]);
  });

  // The runtime reads a guarded group's optional step as optional: its failed
  // edge enters the join its success path reaches through the wait
  // (`../../../executor/step-skip/optional-step.ts`, t378 W14), so an absent
  // notice is a skip, not a failure.
  it("goes past the wait when the notice is not there: the run skips the absent notice straight to the join", () => {
    const accepted = accept(SLOWED);
    if (!accepted.ok) throw new Error("the slowed loop was refused");
    const flow = flowDocument(accepted.plan);
    expect(automationStudioAbsentStepSkip(flow, flow.nodes[5]!, ABSENT)).toMatchObject({ sourceNodeId: "s6", sourcePortId: "failed", targetNodeId: "s8" });
  });

  it("says a refusal about any node it derived at the step whose line made it", () => {
    const accepted = accept(SLOWED);
    if (!accepted.ok) throw new Error("the slowed loop was refused");
    const place = (index: number) => accepted.locator?.nodes[`0.${index}`];
    // The written steps are themselves.
    expect(place(4)).toEqual({ step: "confirm the request", line: 8 });
    expect(place(5)).toEqual({ step: "close the slow-down notice if it shows", label: "notice", line: 15 });
    expect(place(6)).toEqual({ step: "wait as long as the site asked", label: "cooldown", line: 20 });
    // The join is the optional step's; the loop's Merges and For Each are the step that says repeat.
    expect(place(7)).toEqual({ step: "close the slow-down notice if it shows", label: "notice", line: 15 });
    for (const index of [2, 3, 8]) expect(place(index)).toEqual({ step: "confirm the request", line: 8 });
  });
});

describe("an optional step and the steps that run only after it, outside every span", () => {
  const lines = [
    "flow: Search the shop",
    "step: open the shop",
    "  node: web.browser.navigate",
    "  url: https://shop.test/",
    "step notice: close the slow-down notice if it shows",
    "  node: web.dom.click",
    "  selector: .notice-close",
    "  consequences: none",
    "  optional: yes",
    "step: wait as long as the site asked",
    "  node: builtin.timing.wait",
    "  duration: 3",
    "  unit: seconds",
    "  only after: notice",
    "step: type the query",
    "  node: web.dom.type",
    "  selector: #q",
    "  text: earbuds"
  ];

  it("runs the wait only when the notice was closed, then goes on to the next step either way", () => {
    const accepted = accept(lines);
    expect(errors(accepted)).toEqual([]);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]!.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-click", "builtin.timing.wait", "builtin.control.merge", "web.output.dom-type"
    ]);
    expect(wiring(accepted.plan)).toEqual(["s2.failed -> s4.in", "s1.success -> s2.in", "s2.success -> s3.in", "s3.success -> s4.branches", "s4.success -> s5.in"]);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  // The same guarded shape as inside a span (above).
  it("is skipped by the runtime when the notice is absent, past the wait to the join", () => {
    const accepted = accept(lines);
    if (!accepted.ok) throw new Error("the guarded steps were refused");
    const flow = flowDocument(accepted.plan);
    expect(automationStudioAbsentStepSkip(flow, flow.nodes[1]!, ABSENT)).toMatchObject({ sourceNodeId: "s2", sourcePortId: "failed", targetNodeId: "s4" });
  });
});

describe("an optional step at the end of a span", () => {
  it("builds: the span ends at the join, so a pass that went past the step still goes round", () => {
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
    if (!accepted.ok) return;
    expect(wiring(accepted.plan)).toEqual(expect.arrayContaining(["s6.failed -> s7.in", "s6.success -> s7.branches", "s7.success -> s3.branches"]));
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
