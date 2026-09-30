import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS } from "../graph-trim.ts";
import { automationStudioCappedProse } from "../prose-cap.ts";
import { automationStudioRecoverySectionAtTrimLevel } from "../section-trim.ts";

const LONG_ID = `node.bootstrap.${"0123456789abcdef".repeat(10)}.main.s11`;

describe("automationStudioCappedProse", () => {
  it("shortens sentences and never an identity, wherever it sits", () => {
    const capped = automationStudioCappedProse({
      advice: "x".repeat(300),
      nodeId: LONG_ID,
      failingNode: { incomingEdgeIds: [LONG_ID] },
      edges: [{ from: LONG_ID, to: LONG_ID }]
    } as JsonObject, 120);
    expect(capped.advice).toBe(`${"x".repeat(119)}…`);
    expect(capped.nodeId).toBe(LONG_ID);
    expect(capped.failingNode).toEqual({ incomingEdgeIds: [LONG_ID] });
    expect(capped.edges).toEqual([{ from: LONG_ID, to: LONG_ID }]);
  });
});

describe("the graph ladder", () => {
  const graph = (): JsonObject => {
    const ids = Array.from({ length: 12 }, (_, index) => `n.${index + 1}`);
    return {
      nodes: ids.map((nodeId) => ({ nodeId, definitionId: "web.dom.click", label: `Step ${nodeId}` })),
      edges: [
        ...ids.slice(1).map((to, index) => ({ edgeId: `e.${index + 1}`, from: ids[index]!, to, fromPort: "success", toPort: "in" })),
        ...ids.slice(0, -1).map((from) => ({ edgeId: `f.${from}`, from, to: "n.12", fromPort: "failed", toPort: "in" }))
      ],
      failingNode: { nodeId: "n.9", incomingEdgeIds: ["e.8"], outgoingEdgeIds: ["e.9", "f.n.9"] }
    };
  };

  it("keeps the failing node, its label and the ids of its own edges at every rung", () => {
    for (let level = 1; level <= AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS.length; level += 1) {
      const section = automationStudioRecoverySectionAtTrimLevel("flow_graph", graph(), level, "n.9")!;
      expect(section.trimmedToFit).toBe(true);
      expect((section.nodes as JsonObject[]).find((node) => node.nodeId === "n.9")).toMatchObject({ label: "Step n.9" });
      const edgeIds = (section.edges as JsonObject[]).map((edge) => edge.edgeId).filter(Boolean);
      expect(edgeIds).toEqual(expect.arrayContaining(["e.8", "e.9", "f.n.9"]));
      expect(section.failingNode).toEqual(graph().failingNode);
    }
  });

  it("narrows the window around the failing node, keeping the true counts and no edge from a hidden node", () => {
    const narrowest = automationStudioRecoverySectionAtTrimLevel("flow_graph", graph(), AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS.length, "n.9")!;
    expect((narrowest.nodes as JsonObject[]).map((node) => node.nodeId)).toEqual(["n.7", "n.8", "n.9", "n.10", "n.11"]);
    expect(narrowest).toMatchObject({ nodeCount: 12, firstNodePosition: 7, edgeCount: 22 });
    const shown = new Set(["n.7", "n.8", "n.9", "n.10", "n.11"]);
    expect((narrowest.edges as JsonObject[]).every((edge) => shown.has(String(edge.from)) || edge.to === "n.9")).toBe(true);
  });

  it("has no rung past the end of a ladder, and no ladder for a section outside the essentials", () => {
    expect(automationStudioRecoverySectionAtTrimLevel("flow_graph", graph(), AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS.length + 1, "n.9")).toBeUndefined();
    expect(automationStudioRecoverySectionAtTrimLevel("recent_nodes", { succeeded: [] }, 1, "n.9")).toBeUndefined();
  });
});
