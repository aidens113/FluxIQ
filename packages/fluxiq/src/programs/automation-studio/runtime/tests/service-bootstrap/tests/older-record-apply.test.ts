// A Flow Bootstrap approved before node provenance existed still applies.
//
// Apply compares the stored topology with a fresh normalization of the plan.
// Normalization now stamps `adaptationIds` on every node it creates, so a record
// written before that, approved and waiting to be applied, no longer matched and
// was refused as "not the Core-owned normalization of its validated plan".
// Every read from storage now upgrades the record first.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/index.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot });
  services.add(service);
  return service;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-older-record-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
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

// Rewrites the stored record into the shape it had before modes, origins and
// node provenance: no `mode`, no `origin`, and no `adaptationIds` on any node.
async function rewriteAsOlderRecord(projectId: string, flowId: string, adaptationId: string): Promise<void> {
  const flowPaths = new AutomationStudioFlowPaths(new AutomationStudioProjectPaths(path.join(tempRoot, "programs", "automation-studio", "projects")));
  const file = new ProgramJsonStore<JsonObject>(flowPaths.flowBootstrapAdaptationFile(projectId, flowId, adaptationId), () => ({}));
  const record = structuredClone(await file.read()) as JsonObject & { topology: { subflows: Array<{ graphFlow: { nodes: Array<{ metadata?: JsonObject }> } }> } };
  // Approving a bootstrap moves it to `validated`, the state apply accepts.
  expect(record.status).toBe("validated");
  delete record.mode;
  delete record.origin;
  let unstamped = 0;
  for (const entry of record.topology.subflows) {
    for (const node of entry.graphFlow.nodes) {
      if (node.metadata && "adaptationIds" in node.metadata) {
        delete node.metadata.adaptationIds;
        unstamped += 1;
      }
    }
  }
  // Normalization stamps both created nodes; the rewrite is only meaningful if it removed them.
  expect(unstamped).toBe(2);
  await file.write(record);
}

describe("applying a Flow Bootstrap approved before node provenance existed", () => {
  it("applies it after a restart, and saves it in today's shape", async () => {
    let service = createService();
    const project = await service.createProject({ name: "Older bootstrap record" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.older-bootstrap", name: "Blank instruction Flow" });
    const now = Date.now();
    await service.saveFlowInstruction(project.id, {
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
    const adaptation = await service.createFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      baseDependencyDigest: await service.getLlmExecutionDependencyDigest(project.id, flow.flowId),
      sourceInstructionIds: ["instruction.active"],
      summary: "Build the requested deterministic Flow.",
      buildPlan: buildPlan()
    });
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, actorId: "reviewer" };
    await service.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    await rewriteAsOlderRecord(project.id, flow.flowId, adaptation.adaptationId);

    // A restart empties the store's cache, so the record comes from storage.
    await service.close();
    services.delete(service);
    service = createService();
    const applied = await service.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });

    expect(applied.status).toBe("applied");
    expect(applied).toMatchObject({ mode: "create", origin: { entryPoint: "instruction", instructionIds: ["instruction.active"] } });
    for (const node of applied.topology.subflows[0]!.graphFlow.nodes) expect(node.metadata?.adaptationIds).toEqual([adaptation.adaptationId]);
    await expect(service.reviewFlowBootstrapAdaptation({ ...review, action: "revert" })).resolves.toMatchObject({ status: "reverted" });
  }, 60_000);
});
