// A from-step run's start (t804): the whole-candidate runner takes a plan key,
// resolved in the selected graph to the executor's start node
// (`../from-node.ts`), and still refuses a caller's own `startNodeId`.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioDetachedFromNode, runAutomationStudioDetachedCandidate } from "../index.ts";

function fixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const constant = (key: string) => ({ key, definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: key } });
  const nodes = [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, constant("first"), constant("second"), constant("third")];
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes,
      edges: nodes.slice(1).map((node, index) => ({ key: `next${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } })) }]
  };
  const buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution }).validated!;
  const identity = { projectId: "project", flowId: "parent", revision: 1, digest: "trusted-digest", baseDependencyDigest: "base", requirementsDigest: "requirements" };
  const input: Parameters<typeof runAutomationStudioDetachedCandidate>[0] = { parentFlow, resolution, identity,
    candidate: { revision: 1, digest: identity.digest, baseDependencyDigest: "base", buildPlan },
    currentIdentity: async () => identity, snapshots: [], sourceInstructionIds: ["instruction"], runId: "run1",
    start: { receiptId: "start", preparedAt: 1, conditionsDigest: "conditions", pageGeneration: 1, subjectStates: [] }, options: { now: () => 100 }
  };
  return { input, plan, parentFlow, resolution };
}

const ranKeys = (result: Awaited<ReturnType<typeof runAutomationStudioDetachedCandidate>>) => (result.trace?.attempts ?? []).map((attempt) => attempt.nodeId.split(".").at(-1));

describe("a detached run from a named step", () => {
  it("starts at the node the key names in the selected graph, skipping the steps before it", async () => {
    const { input } = fixture();
    const result = await runAutomationStudioDetachedCandidate({ ...input, fromNodeKey: "second" });
    expect(ranKeys(result)).toEqual(["second", "third"]);
    // The steps before the start were never visited, which the executor says of the frame; its caller reads that (`service/subflow-trial/from-step.ts`).
    expect(result.trace?.failure?.code).toBe("executor.graph.unvisited_nodes");
  });

  it("runs from the start without a key, as before", async () => {
    const { input } = fixture();
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(ranKeys(result)).toEqual(["start", "first", "second", "third"]);
  });

  it("refuses a key no node carries, and one that is no key, before anything runs", async () => {
    const { input } = fixture();
    expect(await runAutomationStudioDetachedCandidate({ ...input, fromNodeKey: "absent" })).toMatchObject({ code: "candidate.from_node_unknown", receipt: { status: "not_run", executedNodeCount: 0 } });
    expect(await runAutomationStudioDetachedCandidate({ ...input, fromNodeKey: "" })).toMatchObject({ code: "candidate.from_node_invalid", receipt: { executedNodeCount: 0 } });
    expect(await runAutomationStudioDetachedCandidate({ ...input, fromNodeKey: " second" })).toMatchObject({ code: "candidate.from_node_invalid" });
  });

  it("still refuses a caller's own start node, with or without a key", async () => {
    const { input } = fixture();
    const own = { ...input, options: { ...input.options, startNodeId: "node.any" } };
    expect(await runAutomationStudioDetachedCandidate(own)).toMatchObject({ code: "candidate.partial_execution_unsupported", receipt: { executedNodeCount: 0 } });
    expect(await runAutomationStudioDetachedCandidate({ ...own, fromNodeKey: "second" })).toMatchObject({ code: "candidate.partial_execution_unsupported", receipt: { executedNodeCount: 0 } });
  });

  it("refuses a key two nodes carry", () => {
    const graph = { nodes: [{ id: "a", metadata: { bootstrapSymbolicKey: "same" } }, { id: "b", metadata: { bootstrapSymbolicKey: "same" } }] } as unknown as Parameters<typeof automationStudioDetachedFromNode>[0];
    expect(automationStudioDetachedFromNode(graph, "same")).toEqual({ refused: "candidate.from_node_ambiguous" });
    expect(automationStudioDetachedFromNode(graph, undefined)).toBeUndefined();
  });
});
