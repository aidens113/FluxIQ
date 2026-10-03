import { describe, expect, it } from "vitest";
import { automationStudioActivityStepNumbers } from "../numbers.ts";

const node = (id: string, definitionId = "web.output.dom-click") => ({ id, definitionId });
const edge = (sourceNodeId: string, targetNodeId: string) => ({ sourceNodeId, targetNodeId });
const numbersOf = (numbers: ReturnType<typeof automationStudioActivityStepNumbers>, ids: string[]) => ids.map((id) => numbers.numberOf(id));

describe("the number each step carries in Step N of M", () => {
  it("follows the graph from the start, not the list order, and counts no Merge", () => {
    const numbers = automationStudioActivityStepNumbers({
      nodes: [node("n1.cart"), node("n10.join", "builtin.control.merge"), node("n2.coupon"), node("n9.open")],
      edges: [edge("n9.open", "n10.join"), edge("n10.join", "n2.coupon"), edge("n2.coupon", "n1.cart")]
    }, "n9.open");

    expect(numbers.count).toBe(3);
    expect(numbersOf(numbers, ["n9.open", "n10.join", "n2.coupon", "n1.cart"])).toEqual([1, undefined, 2, 3]);
  });

  it("changes no number for an edge back to an earlier step", () => {
    const numbers = automationStudioActivityStepNumbers({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "a"), edge("b", "c")]
    }, "a");

    expect(numbersOf(numbers, ["a", "b", "c"])).toEqual([1, 2, 3]);
  });

  it("numbers steps the walk does not reach after it, in list order, and every node without a start", () => {
    const flow = { nodes: [node("a"), node("loose"), node("b")], edges: [edge("a", "b")] };

    expect(numbersOf(automationStudioActivityStepNumbers(flow, "a"), ["a", "b", "loose"])).toEqual([1, 2, 3]);
    expect(automationStudioActivityStepNumbers(flow, undefined).count).toBe(3);
    expect(automationStudioActivityStepNumbers(flow, "missing").numberOf("a")).toBe(1);
  });
});
