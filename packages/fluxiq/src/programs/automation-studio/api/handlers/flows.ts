// Flow listings, metadata, create/read/save, settings, and graph editing.

import { AUTOMATION_STUDIO_ENDPOINTS, type ApplyGraphPatchRequest, type CreateFlowRequest, type FlowIdProjectRequest, type FlowMetadataPageRequest, type FlowProjectRequest, type GraphViewportRequest, type SaveFlowRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { updateFlowSettingsForRequest, withFlowSizeSettings } from "../../../../framework/automation-service/service/flow-settings-requests/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource, type ProgramResourceRef } from "../../../_shared/iam/index.ts";
import type { ProgramApiRequest } from "../../../_shared/api.ts";

function payloadObject(request: ProgramApiRequest): Record<string, unknown> {
  return request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
}

function flowOfFlowObject(request: ProgramApiRequest, preferFlowId: boolean): ProgramResourceRef {
  const payload = payloadObject(request);
  const flow = payload.flow !== null && typeof payload.flow === "object" ? payload.flow as Record<string, unknown> : {};
  return { kind: "project-child", projectId: payload.projectId, child: "flow", childId: preferFlowId ? payload.flowId ?? flow.flowId : flow.flowId };
}

/** save-flow names its Flow only by the Flow object it carries (the handler ignores `flowId`). */
const savedFlowResource = endpointResource.custom(["project/flow"], (request) => flowOfFlowObject(request, false));
/** update-flow-settings names its Flow by `flowId`, else by the Flow object it carries, as the handler does. */
const flowSettingsResource = endpointResource.custom(["project/flow"], (request) => flowOfFlowObject(request, true));

export function registerFlowEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlows,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlows",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listFlows(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSummaries,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowSummaries",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listAutomationFlowSummaries(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowMetadataPage,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowMetadataPage",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowMetadataPageRequest> : {};
      return { ok: true, payload: { page: await service.listFlowMetadataPage({ projectId: String(payload.projectId ?? ""), ...(typeof payload.status === "string" ? { status: payload.status } : {}), ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}), ...(typeof payload.cursor === "string" ? { cursor: payload.cursor } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowMetadataDetail,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowMetadataDetail",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? "");
      const detail = await service.getFlowMetadataDetail(projectId, flowId);
      // A detail exists only for a Flow that does, so its read is not guarded:
      // a Flow that cannot be read must not report the default size as stored.
      return { ok: true, payload: { flow: withFlowSizeSettings(detail, detail ? await service.getFlow(projectId, flowId) : null) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlow,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CreateFlow",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<CreateFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { flow: await service.createFlow({ projectId: String(payload.projectId ?? ""), name: payload.name, description: payload.description, ...(typeof payload.flowId === "string" ? { flowId: payload.flowId } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlow,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlow",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      return { ok: true, payload: { flow: await service.getFlow(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlow,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:SaveFlow",
    accessLevel: "Write",
    resource: savedFlowResource,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<SaveFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow object is required." };
      return { ok: true, payload: { flow: await service.saveFlow({ projectId: String(payload.projectId ?? ""), flow: payload.flow, ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:UpdateFlowSettings",
    accessLevel: "Write",
    resource: flowSettingsResource,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, any>;
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? payload.flow?.flowId ?? "");
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow settings are required." };
      return { ok: true, payload: { flow: await updateFlowSettingsForRequest(service, projectId, flowId, payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ApplyGraphPatch",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<ApplyGraphPatchRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
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
    classification: "read",
    action: "studio:GetGraphViewport",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
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
