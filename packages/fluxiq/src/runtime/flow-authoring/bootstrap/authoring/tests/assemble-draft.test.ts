// A plan built from what a build did, rather than from what it later wrote.
//
// The point of every assertion here is the same one: a step that was performed
// reaches the plan, and a step nothing could write down is said out loud rather
// than quietly absent. The Flow that started this work kept none of the
// dismissals its build had performed, and no line anywhere said so.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../assemble-draft.ts";

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

function step(position: number, actionId: string, input: Record<string, string>): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept" };
}

/** What the web domain would say about each of its own actions. */
function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  if (draftStep.actionId === "press") {
    return { description: "press the control", node: "web.dom.click", entries: [{ key: "selector", value: String(draftStep.input.target) }] };
  }
  if (draftStep.actionId === "enter") {
    return { description: "type into the field", node: "web.dom.type", entries: [{ key: "selector", value: String(draftStep.input.target) }, { key: "text", value: String(draftStep.input.value) }] };
  }
  return undefined;
}

describe("the plan a draft makes", () => {
  it("writes every performed step into the plan, in the order it happened", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [
        step(1, "press", { target: "#consent-accept" }),
        step(2, "press", { target: "#notifications-dismiss" }),
        step(3, "enter", { target: "#search", value: "wireless earbuds" }),
        step(4, "press", { target: "#search-submit" })
      ],
      write, registry, resolution, summary: "Collect the first page of results"
    });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const nodes = assembled.plan?.subflows[0]?.nodes ?? [];
    // The node the step named is matched to its definition, and the output
    // action that definition fixes is derived, exactly as for a written script.
    expect(nodes.map((node) => node.definitionId)).toEqual(["web.output.dom-click", "web.output.dom-click", "web.output.dom-type", "web.output.dom-click"]);
    expect(nodes.map((node) => node.outputActionId)).toEqual(["web.dom.click", "web.dom.click", "web.dom.type", "web.dom.click"]);
    expect(nodes.map((node) => node.parameters?.selector)).toEqual(["#consent-accept", "#notifications-dismiss", "#search", "#search-submit"]);
    // Keys, versions, the edge between two consecutive steps and the router
    // are all derived, exactly as they are for a written script.
    expect(assembled.plan?.subflows[0]?.edges).toHaveLength(3);
    expect(assembled.plan?.subflows[0]?.role).toBe("primary");
  });

  it("refuses the plan, naming the step, when nothing can write one down", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [step(1, "press", { target: "#consent-accept" }), step(2, "wave", { target: "#nothing" })],
      write, registry, resolution, summary: "Collect the first page of results"
    });
    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toContain("flow_draft.step_not_written");
    expect(assembled.issues.find((issue) => issue.code === "flow_draft.step_not_written")?.path).toBe("draft.steps.2");
  });

  it("refuses a draft with nothing in it rather than building an empty Flow", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [], write, registry, resolution, summary: "Nothing happened" });
    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toEqual(["flow_draft.no_steps"]);
  });

  it("passes a step whose node does not resolve to the same refusal a written script gets", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [step(1, "press", { target: "#consent-accept" })],
      write: () => ({ description: "do the thing", node: "web.dom.not_a_node" }),
      registry, resolution, summary: "Collect the first page of results"
    });
    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toContain("flow_script.unknown_node");
  });
});

// t243: each step records the page it started on and the page it left, as the
// host's route signatures, and the plan node it becomes carries them.
describe("the route signatures a draft step recorded", () => {
  // Core's built-ins too, for the join an optional step adds.
  const withJoins = new AutomationStudioNodeRegistry();
  for (const definition of webDomainNodeDefinitionsFixture()) withJoins.register(definition);
  const signed = (position: number, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep => ({
    ...step(position, "press", { target: `#control-${position}` }), id: `d${position}`, stateBefore: `D${position - 1}`, stateAfter: `D${position}`, ...(routing ? { routing } : {})
  });
  const signaturesOf = (draftStep: { stateBefore?: string; stateAfter?: string }) => ({
    ...(draftStep.stateBefore ? { before: { page: draftStep.stateBefore } } : {}),
    ...(draftStep.stateAfter ? { after: { page: draftStep.stateAfter } } : {})
  });

  it("puts each step's signatures on the plan node it became", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [signed(1), signed(2)], write, registry, resolution, summary: "Press twice", routeSignaturesOf: signaturesOf });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(assembled.plan?.subflows[0]?.nodes.map((node) => node.routeSignatures)).toEqual([
      { before: { page: "D0" }, after: { page: "D1" } },
      { before: { page: "D1" }, after: { page: "D2" } }
    ]);
  });

  it("gives the join a routed draft adds no signatures, and a step with none stays without", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [signed(1, { kind: "optional" }), signed(2)], write, registry: withJoins, resolution, summary: "Dismiss, then press",
      routeSignaturesOf: (draftStep) => draftStep.stateBefore === "D0" ? signaturesOf(draftStep) : undefined
    });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const nodes = assembled.plan?.subflows[0]?.nodes ?? [];
    expect(nodes.map((node) => [node.definitionId, node.routeSignatures])).toEqual([
      ["web.output.dom-click", { before: { page: "D0" }, after: { page: "D1" } }],
      ["builtin.control.merge", undefined],
      ["web.output.dom-click", undefined]
    ]);
    expect(nodes.every((node) => node.routeSignatures !== undefined || !("routeSignatures" in node))).toBe(true);
  });

  it("records nothing when the build had no signatures to give", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [signed(1)], write, registry, resolution, summary: "Press once" });
    expect(assembled.plan?.subflows[0]?.nodes.some((node) => "routeSignatures" in node)).toBe(false);
  });

  it("places a node after a routed join at its original draft position and id, without placing the join by a guess", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [signed(3, { kind: "optional" }), signed(8)],
      write: (draftStep) => ({ ...write(draftStep)!, node: "web.output.dom-click" }),
      registry: withJoins, resolution, summary: "Press the controls"
    });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(assembled.draftStepIdByNodeKey).toEqual({ s1: "d3", s3: "d8" });
    expect(assembled.locator?.nodes["0.2"]).toEqual({ step: "press", draftStep: 8, draftStepId: "d8", nodeDefinition: "web.output.dom-click" });
    expect(assembled.locator?.nodes["0.1"]).toBeUndefined();
    expect(assembled.locator?.paths["draft.steps.8"]).toMatchObject({ draftStep: 8, draftStepId: "d8" });
    expect(JSON.stringify(assembled.locator)).not.toContain("#control-");
  });
});

// A step that ran a saved part stays one pinned call step (`../draft-routing.ts`, `llm/node-tools/draft-step.ts`).
describe("a draft step that ran a saved part", () => {
  const withCalls = new AutomationStudioNodeRegistry();
  for (const definition of webDomainNodeDefinitionsFixture()) withCalls.register(definition);
  const CALL = "builtin.control.call-subflow";
  const ran: AutomationStudioFlowDraftStep = { position: 1, iteration: 1, callId: "call.1", toolId: "core.run_part", actionId: CALL, input: {}, effect: "mutate", effectApplied: true, disposition: "kept" };
  const writePart = (): AutomationStudioFlowDraftWrittenStep => ({ description: CALL, node: CALL, entries: [{ key: "part", value: JSON.stringify({ partId: "part.a", version: 3 }) }, { key: "inputs", value: JSON.stringify({ words: "x" }) }] });

  it("assembles to one call step holding the pin and the values, with no Subflow named", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [ran], write: writePart, registry: withCalls, resolution, summary: "Run the part" });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const nodes = assembled.plan!.subflows[0]!.nodes;
    expect(nodes.map((node) => node.definitionId)).toEqual([CALL]);
    expect(nodes[0]!.parameters).toMatchObject({ part: { partId: "part.a", version: 3 }, inputs: { words: "x" } });
    expect(nodes[0]!.parameters).not.toHaveProperty("subflowId");
  });

  it("the same step from any other tool is still refused: a written step does not name the grammar's own node", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [{ ...ran, toolId: "core.run_node" }], write: writePart, registry: withCalls, resolution, summary: "Run the part" });
    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toContain("flow_script.unknown_node");
  });
});
