// Covers handlers/flows.ts, whose graph patch endpoints are the normal editor
// write API.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio graph patch API", () => {
  it("registers the editor mutation endpoint and persists its bounded graph operations", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Graph patch API" });
      const flow = await service.createFlow({ projectId: project.id, name: "Patched Flow" });
      const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
      if (!subflow.graphFlowId) throw new Error("Expected the primary Subflow to own a graph Flow.");
      const graphFlowId = subflow.graphFlowId;
      // The registry holds Identity Access, so a PIN *could* be taken here.
      // Graph editing is authoring, so it must not be.
      const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin } as any });
      registerAutomationStudioApi(registry, service);
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        permission: "flows.write",
        classification: "authoring"
      });
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        permission: "programs.read",
        classification: "read"
      });

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        scope: {},
        actor: { ...cacheActor("user.graph"), permissions: ["programs.read", "programs.write", "flows.write"] },
        payload: {
          projectId: project.id,
          flowId: graphFlowId,
          authSessionId: "session.user.graph",
          baseRevision: 1,
          mutationId: "graph-api.initial",
          operations: [
            {
              op: "add_node",
              node: {
                nodeId: "node.start",
                flowId: graphFlowId,
                definitionId: "builtin.control.start",
                definitionVersion: "1.0.0",
                label: "Start",
                description: "",
                x: 0,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_node",
              node: {
                nodeId: "node.end",
                flowId: graphFlowId,
                definitionId: "builtin.control.end",
                definitionVersion: "1.0.0",
                label: "End",
                description: "",
                x: 420,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_edge",
              edge: {
                edgeId: "edge.start.end",
                flowId: graphFlowId,
                sourceNodeId: "node.start",
                targetNodeId: "node.end",
                sourcePortId: "success",
                targetPortId: "in",
                label: "Next",
                metadata: {}
              }
            }
          ]
        }
      });

      expect(response.ok, response.error).toBe(true);
      expect(response).toMatchObject({
        ok: true,
        payload: {
          result: { status: "applied", baseRevision: 1, revisionNumber: 2 },
          replayed: false,
          flow: { flowId: graphFlowId, graphRevision: 2 }
        }
      });
      expect(authorizeSessionPin).not.toHaveBeenCalled();
      const saved = await service.getFlow(project.id, graphFlowId);
      expect(saved.nodes.map((node) => node.id).sort()).toEqual(["node.end", "node.start"]);
      expect(saved.edges.map((edge) => edge.id)).toEqual(["edge.start.end"]);
      expect(saved.metadata?.graphRevision).toBe(2);
      const parent = await service.getFlow(project.id, flow.flowId);
      expect(parent.nodes).toEqual([]);
      expect(parent.edges).toEqual([]);
      const viewport = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        scope: {},
        actor: cacheActor("user.graph"),
        payload: {
          projectId: project.id,
          flowId: graphFlowId,
          bounds: { minX: -100, minY: -100, maxX: 1_000, maxY: 1_000 },
          limit: 500
        }
      });
      expect(viewport).toMatchObject({
        ok: true,
        payload: {
          flow: { flowId: graphFlowId, nodes: [], edges: [], metadata: { graphRevision: 2 } },
          page: { graphRevision: 2, hasMore: false, nodes: [{ nodeId: "node.end" }, { nodeId: "node.start" }], edges: [{ edgeId: "edge.start.end" }] }
        }
      });
    } finally {
      await cleanup();
    }
  });
});

// `update-flow-settings` is how a caller that never opens the settings view
// sets a Flow's intervention mode: the Lab's live run names `manual_approval`
// and nothing else. The mode was kept in the Flow's document and lost
// everywhere else. The training and policy settings it governs stayed at the
// creation defaults, and the SQL row the settings view reads re-derived
// `no_llm_intervention` from them, so a Flow asked to propose repairs was
// stored, and shown, as one that never may.
describe("Automation Studio Flow settings: the intervention mode a caller names", () => {
  const writer: ProgramApiActor = { ...cacheActor("user.settings"), permissions: ["programs.read", "programs.write", "flows.write"] };

  it("stores, applies and shows manual_approval for a new Flow whose patch names only the mode", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Settings API" });
      const flow = await service.createFlow({ projectId: project.id, name: "Created Flow" });
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn() } as any });
      registerAutomationStudioApi(registry, service);

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings,
        scope: {},
        actor: writer,
        payload: { projectId: project.id, flowId: flow.flowId, flow: { flowId: flow.flowId, metadata: { adaptationModeVersion: 1, adaptationMode: "manual_approval" } } }
      });

      expect(response.ok, response.error).toBe(true);
      expect(response).toMatchObject({ payload: { flow: { settings: { interventionMode: "manual_approval" } } } });
      expect((await service.getFlowMetadataDetail(project.id, flow.flowId))?.settings?.interventionMode).toBe("manual_approval");
      const saved = await service.getFlow(project.id, flow.flowId);
      expect(saved.metadata).toMatchObject({
        adaptationModeVersion: 1,
        adaptationMode: "manual_approval",
        trainingModeSettings: { mode: "continuous_adaptive", allowLlmIntervention: true, allowAdaptationCreation: true, proposalApprovalMode: "manual", allowPromotion: false },
        adaptationPolicySettings: { preset: "adaptive", proposalMode: "manual" }
      });
    } finally {
      await cleanup();
    }
  });

  it("stores the mode a saved document states even where its training settings were never updated", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Settings store" });
      const flow = await service.createFlow({ projectId: project.id, name: "Written elsewhere" });
      // Any writer that sets the mode without the settings it governs, as the
      // endpoint once did: the creation defaults are left beside it.
      await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), adaptationModeVersion: 1, adaptationMode: "manual_approval" } } });

      const saved = await service.getFlow(project.id, flow.flowId);
      expect(saved.metadata).toMatchObject({ trainingModeSettings: { mode: "normal", allowLlmIntervention: false } });
      expect((await service.getFlowMetadataDetail(project.id, flow.flowId))?.settings?.interventionMode).toBe("manual_approval");
    } finally {
      await cleanup();
    }
  });

  it("leaves a Flow that names no mode at no_llm_intervention, however its settings are patched", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Settings default" });
      const flow = await service.createFlow({ projectId: project.id, name: "Never opted in" });
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn() } as any });
      registerAutomationStudioApi(registry, service);
      expect((await service.getFlowMetadataDetail(project.id, flow.flowId))?.settings?.interventionMode).toBe("no_llm_intervention");

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings,
        scope: {},
        actor: writer,
        payload: { projectId: project.id, flowId: flow.flowId, flow: { flowId: flow.flowId, description: "Renamed", metadata: { llmProvider: "deepseek", llmModel: "deepseek-chat" } } }
      });

      expect(response.ok, response.error).toBe(true);
      expect((await service.getFlowMetadataDetail(project.id, flow.flowId))?.settings?.interventionMode).toBe("no_llm_intervention");
      expect((await service.getFlow(project.id, flow.flowId)).metadata).toMatchObject({ adaptationMode: "no_llm_intervention", trainingModeSettings: { mode: "normal", allowLlmIntervention: false } });
    } finally {
      await cleanup();
    }
  });
});
