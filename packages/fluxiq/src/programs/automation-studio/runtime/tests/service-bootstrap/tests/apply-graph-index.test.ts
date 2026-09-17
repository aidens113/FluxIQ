// An applied Flow Bootstrap stays revertable after someone looks at it.
//
// Applying a bootstrap saved each Subflow's graph as a document only, and
// recorded the Flow's dependency digest on the spot. The first time anyone
// opened that graph's Nodes view, the viewport found no canonical graph index
// and created one, which gave the graph a revision -- and a graph revision is
// part of the digest. The Flow's digest then no longer matched the one the
// apply recorded, so the bootstrap could never be reverted
// (`FLOW_BOOTSTRAP_STALE`), and an exploration baseline on it failed as an
// unexplained binding drift. Found in a live run, by opening the new Subflow.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";

let tempRoot: string;
let instance: AutomationStudioService;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-graph-index-"));
  instance = new AutomationStudioService({ dataDir: tempRoot });
});

afterEach(async () => {
  await instance.close();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function buildPlan(): AutomationStudioFlowBuildPlan {
  const result = validateAutomationStudioFlowBootstrapPlan({
    plan: {
      schemaVersion: "0.1",
      router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary",
        name: "Primary",
        role: "primary",
        nodes: [
          { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
          { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
        ],
        edges: [{ key: "start_end", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "end", portId: "in" } }]
      }]
    },
    registry: new AutomationStudioNodeRegistry(),
    resolution: { scope: { kind: "global" }, runtimeCapabilities: [], permissions: [] }
  });
  if (!result.validated) throw new Error(JSON.stringify(result.issues));
  return result.validated;
}

describe("applying a Flow Bootstrap", () => {
  it("indexes each Subflow graph before recording the applied digest, so opening it does not make the bootstrap unrevertable", async () => {
    const project = await instance.createProject({ name: "Bootstrap graph index" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.bootstrap", name: "Blank instruction Flow" });
    const now = Date.now();
    await instance.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.active",
      title: "Build a deterministic Flow",
      body: "Create a primary path from Start to End.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const adaptation = await instance.createFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId),
      sourceInstructionIds: ["instruction.active"],
      summary: "Build the requested deterministic Flow.",
      buildPlan: buildPlan()
    });
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, actorId: "reviewer" };
    await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    const applied = await instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });
    expect(applied.status).toBe("applied");

    // What a person does next: open the new Subflow's Nodes view.
    const graphFlowId = applied.topology.subflows[0]!.subflow.graphFlowId!;
    const viewport = await instance.getFlowGraphViewport({ projectId: project.id, flowId: graphFlowId, bounds: { minX: -10_000, minY: -10_000, maxX: 10_000, maxY: 10_000 } });
    expect(viewport.page.nodes).toHaveLength(2);

    await expect(instance.getLlmExecutionDependencyDigest(project.id, flow.flowId)).resolves.toBe(applied.application!.appliedDependencyDigest);
    await expect(instance.reviewFlowBootstrapAdaptation({ ...review, action: "revert" })).resolves.toMatchObject({ status: "reverted" });
  }, 60_000);
});
