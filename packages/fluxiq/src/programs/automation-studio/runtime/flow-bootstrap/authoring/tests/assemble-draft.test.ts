// A plan built from what a build did, rather than from what it later wrote.
//
// The point of every assertion here is the same one: a step that was performed
// reaches the plan, and a step nothing could write down is said out loud rather
// than quietly absent. The Flow that started this work kept none of the
// dismissals its build had performed, and no line anywhere said so.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
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
