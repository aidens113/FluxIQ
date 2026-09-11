// Covers handlers/flows.ts, whose graph patch endpoints are the normal editor
// write API.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

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
      const registry = new GlobalProgramApiRegistry();
      const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
      registerAutomationStudioApi(registry, service, { authorizeSessionPin } as any);
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        permission: "flows.write"
      });
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        permission: "programs.read"
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
          authorizationPin: "123456",
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
      expect(authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.user.graph", pin: "123456" });
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
