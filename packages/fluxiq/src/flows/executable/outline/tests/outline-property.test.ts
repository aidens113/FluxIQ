// The outline's invariant, over generated graphs: every node of the graph is
// in exactly one step, whatever shape the graph has, and every step has a
// number of its own.
import { describe, expect, it } from "vitest";
import { outlineFlow } from "../outline-flow.ts";
import { outlineFlatSteps } from "../walk/index.ts";
import { placements } from "./graph-fixture.ts";
import { randomGraph } from "./random-graph.ts";

const GRAPHS = 600;

describe("outlineFlow over random graphs", () => {
  it("puts every node in exactly one step", () => {
    for (let seed = 1; seed <= GRAPHS; seed += 1) {
      const graph = randomGraph(seed);
      const outline = outlineFlow(graph);
      const placed = placements(outline);
      const misplaced = graph.nodes.filter((node) => placed.get(node.id) !== 1).map((node) => `${node.id} x${placed.get(node.id) ?? 0}`);
      const strangers = [...placed.keys()].filter((id) => !graph.nodes.some((node) => node.id === id));
      expect({ seed, misplaced, strangers }).toEqual({ seed, misplaced: [], strangers: [] });
    }
  });

  it("numbers every step uniquely and words every step without a node type id", () => {
    for (let seed = 1; seed <= GRAPHS; seed += 1) {
      const steps = outlineFlatSteps(outlineFlow(randomGraph(seed)).steps).filter((step) => step.kind !== "handlers" && step.kind !== "section");
      const numbers = steps.map((step) => step.number);
      expect({ seed, duplicate: numbers.length !== new Set(numbers).size, unnumbered: numbers.includes(""), unworded: steps.some((step) => !step.words), typeIds: steps.some((step) => /builtin\.|web\.output|composite\.flow/u.test(step.words)) }).toEqual({ seed, duplicate: false, unnumbered: false, unworded: false, typeIds: false });
    }
  });
});
