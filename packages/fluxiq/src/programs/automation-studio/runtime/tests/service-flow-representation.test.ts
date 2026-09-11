import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, withAutomationStudioFlowRepresentation } from "../../model/index.ts";
import { generateFlowTypeScript } from "../../dsl/index.ts";
import { AutomationStudioService } from "../service.ts";

describe("Automation Studio Flow representation boundary", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-representation-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("rejects graph saves and patches on newly created orchestration Flows", async () => {
    const project = await service.createProject({ name: "Modern boundary" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });

    await expect(service.saveFlow({
      projectId: project.id,
      flow: { ...parent, nodes: [{ id: "start", definitionId: "builtin.control.start" }] }
    })).rejects.toThrow("Top-level orchestration Flows cannot own Nodes");
    await expect(service.applyFlowGraphPatch({
      projectId: project.id,
      flowId: parent.flowId,
      baseRevision: 0,
      mutationId: "mutation.parent-node",
      operations: [{ op: "add_node", node: { nodeId: "start", flowId: parent.flowId, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start", description: "", parameterValues: {}, x: 0, y: 0, width: 180, height: 80, zIndex: 0, disabled: false, metadata: {} } }]
    })).rejects.toThrow("apply graph patches to a Subflow graph Flow");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
    expect(run).toMatchObject({ status: "failed", trace: { message: expect.stringContaining("no Router-selected Subflow") } });
  });

  it("runs a dedicated owned Subflow graph through its parent Router and refuses graph hijacking", async () => {
    const project = await service.createProject({ name: "Owned graph" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });
    const unrelated = await service.createFlow({ projectId: project.id, flowId: "flow.unrelated", name: "Unrelated" });
    await expect(service.saveFlowSubflow({
      schemaVersion: "0.1",
      projectId: project.id,
      flowId: parent.flowId,
      subflowId: "subflow.hijack",
      graphFlowId: unrelated.flowId,
      name: "Hijack",
      role: "utility",
      status: "active",
      createdAt: 1,
      updatedAt: 1
    })).rejects.toThrow("matching parent and Subflow ownership");

    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graph = await service.getFlow(project.id, subflow.graphFlowId!);
    const summaries = await service.listAutomationFlowSummaries(project.id);
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ flowId: parent.flowId, flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }),
      expect.objectContaining({ flowId: graph.flowId, flowRepresentationVersion: 1, flowRepresentationKind: "subflow_graph" })
    ]));
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...graph,
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
      }
    });
    const now = Date.now();
    await service.saveFlowRouter({
      schemaVersion: "0.1",
      routerId: "router.parent",
      projectId: project.id,
      flowId: parent.flowId,
      name: "Parent Router",
      rules: [],
      fallback: { kind: "subflow", subflowId: subflow.subflowId },
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(run.status).toBe("succeeded");
    expect(detail?.subflows).toEqual([expect.objectContaining({ subflowId: subflow.subflowId, metadata: expect.objectContaining({ graphFlowId: graph.flowId }) })]);
    await expect(service.updateFlowSubflow({ projectId: project.id, flowId: parent.flowId, subflowId: subflow.subflowId, graphFlowId: unrelated.flowId })).rejects.toThrow("cannot be reassigned");
  });

  it("retains parent and Subflow graph identity through generated source compilation and restart", async () => {
    const project = await service.createProject({ name: "Durable generated source" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.durable-parent", name: "Parent" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graph = await service.getFlow(project.id, subflow.graphFlowId!);

    const compiledParent = await service.compileAndSaveFlowSource({
      projectId: project.id,
      flowId: parent.flowId,
      moduleId: "flows/parent.flow.ts",
      sourceText: generateFlowTypeScript(parent)
    });
    const compiledGraph = await service.compileAndSaveFlowSource({
      projectId: project.id,
      flowId: graph.flowId,
      moduleId: "flows/graph.flow.ts",
      sourceText: generateFlowTypeScript(graph)
    });
    expect(compiledParent.flow?.metadata).toMatchObject({ flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" });
    expect(compiledGraph.flow?.metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "subflow_graph",
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    });

    await service.close();
    service = new AutomationStudioService({ dataDir, seedFixture: false });
    await expect(service.getFlow(project.id, parent.flowId)).resolves.toMatchObject({
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      metadata: {
        flowRepresentationVersion: 1,
        flowRepresentationKind: "subflow_graph",
        subflowGraph: true,
        parentFlowId: parent.flowId,
        parentSubflowId: subflow.subflowId
      }
    });
  });

  it("preserves legacy execution and refuses a public representation downgrade", async () => {
    const project = await service.createProject({ name: "Legacy compatibility" });
    const forged = createBlankAutomationStudioFlowArtifact({ projectId: project.id, flowId: "flow.forged", name: "Forged", origin: "migrated" });
    await expect(service.saveFlow({
      projectId: project.id,
      flow: { ...forged, legacyProvenance: { kind: "task", artifactId: "task.forged" }, nodes: [{ id: "start", definitionId: "builtin.control.start" }] }
    })).rejects.toThrow("Top-level orchestration Flows cannot own Nodes");
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.legacy", name: "Legacy", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const saved = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: saved.flowId, adaptiveMode: "no_llm_intervention" });
    expect(run.metadata).toMatchObject({ compatibilityDiagnostics: [expect.objectContaining({ code: "flow.legacy_single_graph_execution" })] });

    const attemptedDowngrade = await service.saveFlow({
      projectId: project.id,
      flow: { ...saved, nodes: [], edges: [], metadata: withAutomationStudioFlowRepresentation(saved.metadata, "orchestration") }
    });
    expect(attemptedDowngrade.metadata).toMatchObject({ flowRepresentationVersion: 1, flowRepresentationKind: "legacy_single_graph" });
  });
  it("explicitly migrates a legacy parent into the requested owned Subflow graph and is idempotent", async () => {
    const project = await service.createProject({ name: "Explicit legacy migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.explicit", name: "Explicit", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const importedLegacy = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const legacy = {
      ...importedLegacy,
      nodes: [{ id: "legacy-start", definitionId: "builtin.control.start" }]
    };
    await service.saveFlow({ projectId: project.id, flow: legacy });
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: legacy.flowId,
      name: "Requested target",
      role: "primary"
    });

    const blankTarget = await service.getFlow(project.id, subflow.graphFlowId!);
    await service.saveFlow({
      projectId: project.id,
      flow: { ...blankTarget, nodes: [{ id: "foreign", definitionId: "builtin.control.start" }] }
    });
    await expect(service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    })).rejects.toThrow("does not match it exactly");
    await service.saveFlow({
      projectId: project.id,
      flow: { ...await service.getFlow(project.id, subflow.graphFlowId!), nodes: [], edges: [] }
    });

    const result = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(result.parentFlow).toMatchObject({
      flowId: legacy.flowId,
      nodes: [],
      edges: [],
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    expect(result.graphFlow.nodes).toEqual(legacy.nodes);
    expect(result.graphFlow.edges).toEqual(legacy.edges);
    expect(await service.getFlowRouter(project.id, legacy.flowId)).toMatchObject({
      fallback: { kind: "subflow", subflowId: subflow.subflowId }
    });

    const repeated = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(repeated.parentFlow.metadata).toMatchObject({ flowRepresentationKind: "orchestration" });
    expect(repeated.graphFlow.flowId).toBe(subflow.graphFlowId);

    const { flowRepresentationKind: _kind, flowRepresentationVersion: _version, ...unmarkedMetadata } = repeated.parentFlow.metadata ?? {};
    await (service as any).repositories.flows.put({ ...repeated.parentFlow, metadata: unmarkedMetadata });
    const repaired = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(repaired.parentFlow.metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "orchestration"
    });
    expect((await service.getFlow(project.id, legacy.flowId)).metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "orchestration"
    });
  });
  it("finalizes an interrupted migration when the explicit legacy parent is already empty", async () => {
    const project = await service.createProject({ name: "Interrupted legacy migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.interrupted", name: "Interrupted", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const legacy = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: legacy.flowId,
      name: "Interrupted target",
      role: "primary"
    });
    const blankTarget = await service.getFlow(project.id, subflow.graphFlowId!);
    const target = await service.saveFlow({
      projectId: project.id,
      flow: {
        ...blankTarget,
        nodes: [{ id: "migrated-start", definitionId: "builtin.control.start" }],
        edges: [],
        ...(legacy.evidenceReferences ? { evidenceReferences: legacy.evidenceReferences } : {}),
        ...(legacy.executionDefaults ? { executionDefaults: structuredClone(legacy.executionDefaults) } : {})
      }
    });
    await service.setFlowMapFallback({
      projectId: project.id,
      flowId: legacy.flowId,
      kind: "subflow",
      targetSubflowId: subflow.subflowId
    });
    const { executionDefaults: _executionDefaults, ...legacyWithoutExecutionDefaults } = legacy;
    await (service as any).repositories.flows.put({
      ...legacyWithoutExecutionDefaults,
      nodes: [],
      edges: []
    });

    const finalized = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });

    expect(finalized.parentFlow).toMatchObject({
      nodes: [],
      edges: [],
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    expect(finalized.graphFlow.nodes).toEqual(target.nodes);
    expect(finalized.graphFlow.edges).toEqual(target.edges);
    expect(await service.getFlowRouter(project.id, legacy.flowId)).toMatchObject({
      fallback: { kind: "subflow", subflowId: subflow.subflowId }
    });
  });
});
