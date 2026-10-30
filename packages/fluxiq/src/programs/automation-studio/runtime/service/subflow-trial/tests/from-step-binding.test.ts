// A from-step run seeds no values (t804, `../from-step-binding.ts`): it is
// refused `subflow.from_step_unbound` from a step whose run would read a value
// no step before it in the run makes, naming the step to start at or before.
import { describe, expect, it } from "vitest";
import { automationNodeStateBinding } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapEdge, AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioSubflowFromStepOrder, automationStudioSubflowFromStepUnbound } from "../index.ts";

const edge = (source: string, sourcePort: string, target: string, targetPort = "in"): AutomationStudioFlowBootstrapEdge => ({ key: `${source}.${sourcePort}.${target}`, source: { nodeKey: source, portId: sourcePort }, target: { nodeKey: target, portId: targetPort } });
const node = (key: string, definitionId: string, parameters?: AutomationStudioFlowBootstrapSubflow["nodes"][number]["parameters"]) => ({ key, definitionId, definitionVersion: "1.0.0", ...(parameters ? { parameters } : {}) });

/** A part shaped as `repeat over: posts` compiles (`flow-bootstrap/authoring/draft-routing.ts`): read the posts, open and like each, then a step after. */
function posts(): AutomationStudioFlowBootstrapSubflow {
  return {
    key: "feed", name: "feed", role: "utility",
    nodes: [
      node("start", "builtin.control.start"), node("posts", "web.read-list"), node("loop", "builtin.control.merge"), node("each", "builtin.control.for-each"),
      node("open", "web.click"), node("like", "web.click", { name: automationNodeStateBinding("item.name") }), node("exit", "builtin.control.merge"),
      node("after", "web.type", { text: automationNodeStateBinding("$node.open.title") })
    ],
    edges: [
      edge("start", "success", "posts"), edge("posts", "success", "loop", "branches"), edge("posts", "records", "each", "items"),
      edge("loop", "success", "each"), edge("each", "body", "open"), edge("each", "item", "open", "item"), edge("open", "success", "like"),
      edge("like", "success", "loop", "branches"), edge("each", "done", "exit"), edge("exit", "success", "after")
    ]
  };
}

describe("a from-step run's binding check", () => {
  it("orders the steps a run from a step reaches, along control edges only", () => {
    expect(automationStudioSubflowFromStepOrder(posts(), "posts")).toEqual(["posts", "loop", "each", "open", "exit", "like", "after"]);
    expect(automationStudioSubflowFromStepOrder(posts(), "missing")).toEqual([]);
  });

  it("lets a run start at the listing a repeat walks, or before it", () => {
    expect(automationStudioSubflowFromStepUnbound(posts(), "posts")).toBeUndefined();
    expect(automationStudioSubflowFromStepUnbound(posts(), "start")).toBeUndefined();
  });

  it("refuses a step inside the repeat, naming the listing its row comes from", () => {
    expect(automationStudioSubflowFromStepUnbound(posts(), "open")).toEqual({ code: "subflow.from_step_unbound", reader: "open", producer: "posts", chain: ["each", "posts"] });
    // A step that reads the row by `$row.<field>` alone is held to its loop the same way.
    expect(automationStudioSubflowFromStepUnbound(posts(), "like")).toEqual({ code: "subflow.from_step_unbound", reader: "like", producer: "posts", chain: ["each", "posts"] });
    expect(automationStudioSubflowFromStepUnbound(posts(), "each")).toEqual({ code: "subflow.from_step_unbound", reader: "each", producer: "posts", chain: ["posts"] });
  });

  it("refuses a step that reads an earlier step's output the run would not reach first", () => {
    expect(automationStudioSubflowFromStepUnbound(posts(), "after")).toEqual({ code: "subflow.from_step_unbound", reader: "after", producer: "posts", chain: ["open", "each", "posts"] });
  });

  it("refuses an interface input with no value, and takes one written with its test value", () => {
    const pay = (fallback?: string): AutomationStudioFlowBootstrapSubflow => ({
      key: "pay", name: "pay", role: "utility",
      interface: { inputs: [{ id: "card", name: "Card", valueType: { kind: "unknown" } }], outputs: [] },
      nodes: [node("start", "builtin.control.start"), node("enter", "web.type", { text: automationNodeStateBinding("card", fallback) })],
      edges: [edge("start", "success", "enter")]
    });
    expect(automationStudioSubflowFromStepUnbound(pay(), "enter")).toEqual({ code: "subflow.from_step_unbound", reader: "enter", input: "card" });
    expect(automationStudioSubflowFromStepUnbound(pay(), "start")).toEqual({ code: "subflow.from_step_unbound", reader: "enter", input: "card" });
    expect(automationStudioSubflowFromStepUnbound(pay("4111"), "enter")).toBeUndefined();
  });

  it("refuses a key that is none of the subflow's steps", () => {
    expect(automationStudioSubflowFromStepUnbound(posts(), "missing")).toEqual({ code: "subflow.from_step_unknown" });
  });
});
