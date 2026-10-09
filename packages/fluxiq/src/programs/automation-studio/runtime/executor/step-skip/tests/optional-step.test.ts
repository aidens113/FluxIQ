// What counts as an optional step, and where the run goes on past it
// (`../optional-step.ts`). Besides the shape a lone optional step assembles to
// (both ways out enter one Merge), a guarded group (t378 W8) puts steps between
// the optional step's success and the join: `optional: yes` on a notice's
// close, then `only after:` steps such as a wait. Its failed edge is still the
// way on, so an absent notice is skipped with no retry and no recovery.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioOptionalStepWayOn } from "../index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const step = (id: string, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element" }, ...(metadata ? { metadata } : {}) });
const wait = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.timing.wait", parameterValues: { duration: 6, unit: "seconds" } });
const merge = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } });

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): Pick<AutomationStudioFlowDocument, "nodes" | "edges"> {
  return { nodes, edges };
}

const node = (flow: Pick<AutomationStudioFlowDocument, "nodes">, id: string) => flow.nodes.find((candidate) => candidate.id === id)!;

describe("the optional shape a lone optional step assembles to", () => {
  it("is optional, and the way on is its failed edge into the Merge", () => {
    const flow = flowOf([step("notice"), merge("join"), step("next")], [edge("notice", "failed", "join"), edge("notice", "success", "join", "branches"), edge("join", "success", "next")]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))?.id).toBe("notice.failed");
  });
});

describe("a guarded group: the optional step's success runs steps, then the join its failed edge enters", () => {
  it("is optional with one guarded step between, and the way on is the failed edge", () => {
    const flow = flowOf([step("notice"), wait("cooldown"), merge("join"), step("next")], [
      edge("notice", "failed", "join"), edge("notice", "success", "cooldown"), edge("cooldown", "success", "join", "branches"), edge("join", "success", "next")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))?.id).toBe("notice.failed");
  });

  it("is optional with several guarded steps, a Merge among them, between", () => {
    const flow = flowOf([step("notice"), step("acknowledge"), merge("inner"), wait("cooldown"), merge("join")], [
      edge("notice", "failed", "join"), edge("notice", "success", "acknowledge"), edge("acknowledge", "success", "inner"),
      edge("inner", "success", "cooldown"), edge("cooldown", "success", "join", "branches")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))?.id).toBe("notice.failed");
  });

  it("is not optional when a step on the success path branches on its own failure", () => {
    const flow = flowOf([step("notice"), step("acknowledge"), step("elsewhere"), merge("join")], [
      edge("notice", "failed", "join"), edge("notice", "success", "acknowledge"), edge("acknowledge", "failed", "elsewhere"), edge("acknowledge", "success", "join", "branches")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });

  it("is not optional when the success path goes through a loop before the Merge", () => {
    const flow = flowOf([step("notice"), { id: "each", definitionId: "builtin.control.for-each" }, step("row"), merge("join")], [
      edge("notice", "failed", "join"), edge("notice", "success", "each"), edge("each", "body", "row"), edge("row", "success", "each"), edge("each", "done", "join", "branches")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });

  it("is not optional when the failed edge enters a Merge the success path never reaches", () => {
    const flow = flowOf([step("notice"), wait("cooldown"), merge("join"), step("end")], [
      edge("notice", "failed", "join"), edge("notice", "success", "cooldown"), edge("cooldown", "success", "end"), edge("join", "success", "end")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });

  it("is not optional when the failed edge enters a step rather than a Merge, though the success path reaches it", () => {
    const flow = flowOf([step("notice"), wait("cooldown"), step("next")], [edge("notice", "failed", "next"), edge("notice", "success", "cooldown"), edge("cooldown", "success", "next")]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });

  it("stops on a success path that goes round without reaching the Merge", () => {
    const flow = flowOf([step("notice"), step("a"), step("b"), merge("join")], [edge("notice", "failed", "join"), edge("notice", "success", "a"), edge("a", "success", "b"), edge("b", "success", "a")]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });

  it("stops on a success path longer than its bound", () => {
    const chain = Array.from({ length: 40 }, (_, index) => step(`s${index}`));
    const edges = [edge("notice", "failed", "join"), edge("notice", "success", "s0"), ...chain.slice(1).map((next, index) => edge(`s${index}`, "success", next.id)), edge("s39", "success", "join", "branches")];
    const flow = flowOf([step("notice"), ...chain, merge("join")], edges);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))).toBeUndefined();
  });
});

describe("a step marked sometimes-present by its metadata", () => {
  it("goes on down its failed edge in the guarded shape", () => {
    const flow = flowOf([step("notice", { sometimesPresent: true }), wait("cooldown"), merge("join")], [
      edge("notice", "failed", "join"), edge("notice", "success", "cooldown"), edge("cooldown", "success", "join", "branches")
    ]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))?.id).toBe("notice.failed");
  });

  it("goes on down its success edge with no Merge to join at", () => {
    const flow = flowOf([step("notice", { sometimesPresent: true }), step("next")], [edge("notice", "success", "next")]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "notice"))?.id).toBe("notice.success");
  });
});

describe("a plain step", () => {
  it("is not optional", () => {
    const flow = flowOf([step("press"), step("next")], [edge("press", "success", "next")]);
    expect(automationStudioOptionalStepWayOn(flow, node(flow, "press"))).toBeUndefined();
  });
});
