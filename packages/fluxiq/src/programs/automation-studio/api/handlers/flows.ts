// Flow listings, metadata, create/read/save, settings, and graph editing.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type ApplyGraphPatchRequest, type CreateFlowRequest, type FlowIdProjectRequest, type FlowMetadataPageRequest, type FlowProjectRequest, type GraphViewportRequest, type SaveFlowRequest } from "../contracts.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import { assertFlowLlmExecutionSettings } from "./llm-execution-settings.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerFlowEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlows,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listFlows(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSummaries,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listAutomationFlowSummaries(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowMetadataPage,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowMetadataPageRequest> : {};
      return { ok: true, payload: { page: await service.listFlowMetadataPage({ projectId: String(payload.projectId ?? ""), ...(typeof payload.status === "string" ? { status: payload.status } : {}), ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}), ...(typeof payload.cursor === "string" ? { cursor: payload.cursor } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowMetadataDetail,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      return { ok: true, payload: { flow: await service.getFlowMetadataDetail(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<CreateFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { flow: await service.createFlow({ projectId: String(payload.projectId ?? ""), name: payload.name, description: payload.description, ...(typeof payload.flowId === "string" ? { flowId: payload.flowId } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlow,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      return { ok: true, payload: { flow: await service.getFlow(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<SaveFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow object is required." };
      return { ok: true, payload: { flow: await service.saveFlow({ projectId: String(payload.projectId ?? ""), flow: payload.flow, ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, any>;
      await authorizeProgramPin(identityAccess, payload);
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? payload.flow?.flowId ?? "");
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow settings are required." };
      const current = await service.getFlow(projectId, flowId);
      const patch = payload.flow as Record<string, any>;
      const metadata = patch.metadata && typeof patch.metadata === "object" ? patch.metadata : {};
      assertFlowLlmExecutionSettings(metadata as Record<string, unknown>);
      const next = {
        ...current,
        ...(typeof patch.name === "string" ? { name: patch.name } : {}),
        ...(typeof patch.description === "string" ? { description: patch.description } : {}),
        ...(patch.visibility === "private" || patch.visibility === "public" ? { visibility: patch.visibility } : {}),
        ...(patch.interface && typeof patch.interface === "object" ? { interface: patch.interface } : {}),
        ...(patch.executionDefaults && typeof patch.executionDefaults === "object" ? { executionDefaults: patch.executionDefaults } : {}),
        metadata: { ...(current.metadata ?? {}), ...metadata },
        ...(current.source?.mode === "code" && patch.source?.mode === "code"
          ? { source: { ...current.source, declaredDependencies: Array.isArray(patch.source.declaredDependencies) ? patch.source.declaredDependencies : current.source.declaredDependencies } }
          : {})
      };
      await service.saveFlow({
        projectId,
        flow: next,
        ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {})
      });
      return { ok: true, payload: { flow: await service.getFlowMetadataDetail(projectId, flowId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<ApplyGraphPatchRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      if (!Array.isArray(payload.operations)) return { ok: false, error: "Graph patch operations are required." };
      const baseRevision = Number(payload.baseRevision);
      if (!Number.isInteger(baseRevision) || baseRevision < 1) return { ok: false, error: "A valid graph base revision is required." };
      const mutationId = String(payload.mutationId ?? "").trim();
      if (!mutationId) return { ok: false, error: "A graph mutation ID is required." };
      return {
        ok: true,
        payload: await service.applyFlowGraphPatch({
          projectId: String(payload.projectId ?? ""),
          flowId: String(payload.flowId ?? ""),
          baseRevision,
          mutationId,
          operations: payload.operations as Parameters<AutomationStudioService["applyFlowGraphPatch"]>[0]["operations"],
          message: typeof payload.message === "string" ? payload.message : "Save Flow graph"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
    permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<GraphViewportRequest>;
      const bounds = payload.bounds && typeof payload.bounds === "object" ? payload.bounds : null;
      if (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every((value) => Number.isFinite(value))) {
        return { ok: false, error: "Finite graph viewport bounds are required." };
      }
      return {
        ok: true,
        payload: await service.getFlowGraphViewport({
          projectId: String(payload.projectId ?? ""),
          flowId: String(payload.flowId ?? ""),
          bounds,
          ...(typeof payload.cursor === "string" || payload.cursor === null ? { cursor: payload.cursor } : {}),
          ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}),
          ...(Array.isArray(payload.pinnedNodeIds) ? { pinnedNodeIds: payload.pinnedNodeIds } : {})
        })
      };
    }
  });
}
