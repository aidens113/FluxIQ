import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";
import { partGraphFixture } from "../../tests/fixtures.ts";
import { deriveAutomationStudioPartCard } from "../derive-card.ts";
import { partTargetLeavesOf } from "../target-leaves.ts";

// A control's words, read with no knowledge of any domain: every string leaf of its target, compared
// with the person's request and shown only when the request holds them whole.

/** A part that opens an item and then presses a control, with what each step declares and what its target holds. */
function graphOf(input: { opens: string; opensDeclares: string[]; presses: string; pressLabel: string; pressDeclares: string[] }): AutomationStudioFlowArtifact {
  const graph = partGraphFixture({ typed: null, consequences: [] });
  const target = (text: string) => ({ kind: "element", fingerprint: { visibleText: text } });
  graph.nodes = graph.nodes.map((node) => {
    if (node.id === "a.type") return { ...node, label: "Open it", parameterValues: { target: target(input.opens) }, metadata: { declaredConsequences: input.opensDeclares } };
    if (node.id === "a.click") return { ...node, label: input.pressLabel, parameterValues: { target: target(input.presses) }, metadata: { declaredConsequences: input.pressDeclares } };
    return { ...node, metadata: { declaredConsequences: [] } };
  });
  return graph;
}

const derive = (graph: AutomationStudioFlowArtifact, requestWords: string) => deriveAutomationStudioPartCard({ partId: "part.one", graph, subflowName: "Do the thing", requestWords });

describe("partTargetLeavesOf", () => {
  it("reads every string leaf at any depth, under any key, and nothing that is not words", () => {
    expect(partTargetLeavesOf({ kind: "element", fingerprint: { visibleText: "Red Shoes", id: "a.b", path: ["div > p", "Next page"], count: 3, nothing: null, css: "#main" }, bounds: { x: 1 } })).toEqual(["element", "Red Shoes", "a.b", "Next page"]);
  });
});

describe("a control's words as fixed values by default", () => {
  it("does not refuse a lasting step for its own control label: Save pressed when the request says save the job", () => {
    const graph = graphOf({ opens: "Job board", opensDeclares: [], presses: "Save", pressLabel: "Press Save", pressDeclares: ["create_new"] });
    const result = derive(graph, "save the job");
    expect(result).not.toHaveProperty("skipped");
    expect("card" in result && result.card.lastingClasses).toEqual(["create_new"]);
    expect("card" in result && result.card.fixedValues).toEqual([]);
  });

  it("refuses a lasting part whose step opens an item the request names: Red Shoes when the request says add the red shoes", () => {
    const graph = graphOf({ opens: "Red Shoes", opensDeclares: [], presses: "Add", pressLabel: "Press Add", pressDeclares: ["create_new"] });
    expect(derive(graph, "add the red shoes")).toEqual({ skipped: "part.fixed_value_from_request" });
    // The same item, with nothing lasting: the part is kept and shows what it does to exactly that item.
    const reads = graphOf({ opens: "Red Shoes", opensDeclares: [], presses: "Add", pressLabel: "Press Add", pressDeclares: [] });
    const kept = derive(reads, "add the red shoes");
    expect("card" in kept && kept.card.fixedValues).toEqual(["Red Shoes", "Add"]);
  });

  it("counts a leaf only when it occurs whole in the request, ignoring case, and never lists one that is not in it", () => {
    const graph = graphOf({ opens: "Red Shoes", opensDeclares: [], presses: "Add", pressLabel: "Press Add", pressDeclares: ["create_new"] });
    const inside = derive(graph, "add the red shoesies");
    expect(inside).not.toHaveProperty("skipped");
    expect("card" in inside && inside.card.fixedValues).toEqual([]);
    expect(derive(graph, "ADD THE RED SHOES, please")).toEqual({ skipped: "part.fixed_value_from_request" });
    const unrelated = derive(partGraphFixture({ typed: null }), "find me some shoes");
    expect("card" in unrelated && unrelated.card.fixedValues).toEqual([]);
  });
});
