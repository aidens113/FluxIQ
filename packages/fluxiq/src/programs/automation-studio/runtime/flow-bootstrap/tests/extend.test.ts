// Building onto a Flow that already exists: what the door refuses, which
// Subflow it writes into, and the property that makes it an edit -- the
// normalisation keeps the ids the Flow already has.

import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../model/index.ts";
import {
  automationStudioBootstrapExtendSubflow,
  automationStudioBootstrapTargetRefusal,
  normalizeAutomationStudioFlowBuildPlan,
  type AutomationStudioFlowBuildPlan
} from "../index.ts";

const ADAPTATION_ID = "adaptation.bootstrap.9d2b7f10-4c31-4a8e-8b77-2f6d1e0a3c55";
const CREATED_AT = 1_700_000_000_000;

function parentFlow(): AutomationStudioFlowArtifact {
  return createBlankAutomationStudioFlowArtifact({ flowId: "flow.catalog", projectId: "project.demo", name: "Catalog", now: CREATED_AT });
}

/** The shape an extend always has: one block, so one Subflow. */
function buildPlan(): AutomationStudioFlowBuildPlan {
  const primary = {
    key: "main",
    name: "Main",
    role: "primary" as const,
    nodes: [
      { key: "s1", definitionId: "domain.demo.open", definitionVersion: "1.0.0", parameters: { url: "https://example.test" }, position: { x: 0, y: 0 } },
      { key: "s2", definitionId: "domain.demo.click", definitionVersion: "1.0.0", position: { x: 240, y: 0 } },
      { key: "s3", definitionId: "domain.demo.extract", definitionVersion: "1.0.0", position: { x: 480, y: 0 } }
    ],
    edges: [
      { key: "e1", source: { nodeKey: "s1", portId: "success" }, target: { nodeKey: "s2", portId: "in" } },
      { key: "e2", source: { nodeKey: "s2", portId: "success" }, target: { nodeKey: "s3", portId: "in" } }
    ]
  };
  return {
    plan: {
      schemaVersion: "0.1",
      router: { name: "Catalog router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
      subflows: [{ ...primary, nodes: primary.nodes.map(({ position: _position, ...node }) => node) }]
    },
    risk: "low",
    subflows: [primary]
  };
}

const EXISTING = {
  routerId: "router.bootstrap.abc123",
  subflowId: "subflow.bootstrap.abc123.main",
  graphFlowId: "flow.catalog.bootstrap.abc123.main.graph",
  // The Flow had two steps; the build added one between them, which gets a
  // minted id because it is not a node that existed.
  nodeIdByKey: { s1: "node.bootstrap.abc123.main.open", s3: "node.bootstrap.abc123.main.extract" }
};

function normalize(existing?: typeof EXISTING) {
  return normalizeAutomationStudioFlowBuildPlan({
    adaptationId: ADAPTATION_ID,
    parentFlow: parentFlow(),
    buildPlan: buildPlan(),
    sourceInstructionIds: ["instruction.catalog"],
    now: CREATED_AT,
    ...(existing ? { existing } : {})
  });
}

describe("which Flow may be built onto", () => {
  it("refuses a create on a Flow that already has a topology, exactly as before", () => {
    expect(automationStudioBootstrapTargetRefusal({ mode: "create", representation: "orchestration", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: true, subflowCount: 0 }))
      .toBe("Flow Bootstrap requires a Flow without a Router.");
    expect(automationStudioBootstrapTargetRefusal({ mode: "create", representation: "orchestration", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: false, subflowCount: 1 }))
      .toBe("Flow Bootstrap requires a Flow without Subflows.");
    expect(automationStudioBootstrapTargetRefusal({ mode: "create", representation: "orchestration", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: false, subflowCount: 0 }))
      .toBeUndefined();
  });

  it("accepts an extend on the Flow a create would have refused, and refuses the blank one", () => {
    expect(automationStudioBootstrapTargetRefusal({ mode: "extend", representation: "orchestration", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: true, subflowCount: 1 }))
      .toBeUndefined();
    expect(automationStudioBootstrapTargetRefusal({ mode: "extend", representation: "orchestration", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: false, subflowCount: 0 }))
      .toContain("build one instead");
  });

  it("refuses either mode on a Flow that is not a blank top-level orchestration", () => {
    for (const mode of ["create", "extend"] as const) {
      expect(automationStudioBootstrapTargetRefusal({ mode, representation: "graph", parentNodeCount: 0, parentEdgeCount: 0, hasRouter: true, subflowCount: 1 }))
        .toBe("Flow Bootstrap requires a blank top-level orchestration Flow.");
    }
  });
});

describe("which Subflow an extend writes into", () => {
  it("takes the one primary Subflow", () => {
    expect(automationStudioBootstrapExtendSubflow([
      { subflowId: "subflow.main", graphFlowId: "graph.main", role: "primary" },
      { subflowId: "subflow.recovery", graphFlowId: "graph.recovery", role: "recovery" }
    ])).toEqual({ subflowId: "subflow.main", graphFlowId: "graph.main" });
  });

  it("answers nothing rather than guessing between two primaries", () => {
    expect(automationStudioBootstrapExtendSubflow([
      { subflowId: "subflow.a", graphFlowId: "graph.a", role: "primary" },
      { subflowId: "subflow.b", graphFlowId: "graph.b", role: "primary" }
    ])).toBeUndefined();
  });

  it("passes over a Subflow with no graph Flow and one that is not active", () => {
    expect(automationStudioBootstrapExtendSubflow([{ subflowId: "subflow.a", role: "primary" }])).toBeUndefined();
    expect(automationStudioBootstrapExtendSubflow([{ subflowId: "subflow.a", graphFlowId: "graph.a", role: "primary", status: "archived" }])).toBeUndefined();
  });
});

describe("normalising a plan that extends a Flow", () => {
  it("keeps the Router, the Subflow, the graph Flow and every node the build did not add", () => {
    const [entry] = normalize(EXISTING).subflows;
    expect(normalize(EXISTING).router.routerId).toBe(EXISTING.routerId);
    expect(entry!.subflow.subflowId).toBe(EXISTING.subflowId);
    expect(entry!.subflow.graphFlowId).toBe(EXISTING.graphFlowId);
    expect(entry!.graphFlow.flowId).toBe(EXISTING.graphFlowId);
    expect(entry!.graphFlow.nodes.map((node) => node.id)).toEqual([
      "node.bootstrap.abc123.main.open",
      // The step the build added is the only one with a new id.
      expect.stringContaining(".main.s2"),
      "node.bootstrap.abc123.main.extract"
    ]);
  });

  it("wires the added step between the two nodes that were already there", () => {
    const [entry] = normalize(EXISTING).subflows;
    const added = entry!.graphFlow.nodes[1]!.id;
    expect(entry!.graphFlow.edges.map((item) => [item.sourceNodeId, item.targetNodeId])).toEqual([
      ["node.bootstrap.abc123.main.open", added],
      [added, "node.bootstrap.abc123.main.extract"]
    ]);
  });

  it("mints every id when nothing is carried, which is every creation", () => {
    const [entry] = normalize().subflows;
    expect(normalize().router.routerId).not.toBe(EXISTING.routerId);
    expect(entry!.subflow.subflowId).not.toBe(EXISTING.subflowId);
    expect(entry!.graphFlow.nodes.every((node) => node.id.startsWith("node.bootstrap."))).toBe(true);
    expect(entry!.graphFlow.nodes.some((node) => node.id === EXISTING.nodeIdByKey.s1)).toBe(false);
  });

  it("is the same topology twice, which is what apply compares against", () => {
    expect(JSON.stringify(normalize(EXISTING))).toBe(JSON.stringify(normalize(EXISTING)));
  });
});
