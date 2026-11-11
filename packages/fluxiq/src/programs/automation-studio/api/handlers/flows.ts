// Flow listings, metadata, create/read/save, settings, and graph editing.

import { createFlowInput, getFlowInput, getFlowMetadataDetailInput, listFlowsInput, updateFlowSettingsInput } from "@fluxiq/contracts/program-api-inputs";
import { AUTOMATION_STUDIO_ENDPOINTS, type ApplyGraphPatchRequest, type CreateFlowRequest, type FlowIdProjectRequest, type FlowMetadataPageRequest, type FlowProjectRequest, type GraphViewportRequest, type SaveFlowRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { updateFlowSettingsForRequest, withFlowHumanness, withFlowSizeSettings, withStoredCheckAuthorization } from "../../../../framework/automation-service/service/flow-settings-requests/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource, type ProgramResourceRef } from "../../../_shared/iam/index.ts";
import type { ProgramApiRequest } from "../../../_shared/api.ts";

/** A saved Flow carries its metadata whole, so an authorization in it is replaced by what is stored, or dropped. */
async function withoutClientCheckAuthorization<TFlow extends { flowId: string; metadata?: Record<string, any> }>(service: AutomationStudioService, projectId: string, flow: TFlow): Promise<TFlow> {
  if (flow.metadata?.trainingModeSettings?.resultCheck?.authorization === undefined) return flow;
  const exists = (await service.listFlows(projectId)).some((entry) => entry.flow.flowId === flow.flowId);
  const stored = exists ? await service.getFlow(projectId, flow.flowId) : undefined;
  return { ...flow, metadata: withStoredCheckAuthorization(flow.metadata, stored?.metadata) };
}

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

/** Who made a graph edit, as the history records it; a person when not said. */
const GRAPH_PATCH_SOURCE_BY_MADE_BY: Record<string, string> = { person: "editor_patch", repair: "fluxiq_repair", assistant: "assistant_patch" };

export function registerFlowEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlows, assistant: { input: listFlowsInput, summary: "Lists the Flows in a project.", phrases: ["show my flows","what flows do I have"], contextArgs: { projectId: "projectId" } },
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSummaries, assistant: { hidden: "The same list as the plain Flow listing in a lighter form for screens; people ask for the Flow list." },
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowMetadataPage, assistant: { hidden: "A paged listing for the Flows screen; people ask for the Flow list, which needs no paging." },
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowMetadataDetail, assistant: { input: getFlowMetadataDetailInput, summary: "Shows a Flow's details and settings.", phrases: ["show the settings of this flow","how is this flow set up"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
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
      const stored = detail ? await service.getFlow(projectId, flowId) : null;
      return { ok: true, payload: { flow: withFlowHumanness(withFlowSizeSettings(detail, stored), stored) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlow, assistant: { input: createFlowInput, summary: "Creates a new, empty Flow in a project.", phrases: ["make a new flow","create a flow called"], contextArgs: { projectId: "projectId" } },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CreateFlow",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<CreateFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      // A starting level is the new Flow's own from the write that creates it (`service/flows/creation.ts`), which refuses one no run could use before anything is written.
      return { ok: true, payload: { flow: await service.createFlow({ projectId: String(payload.projectId ?? ""), name: payload.name, description: payload.description, ...(typeof payload.flowId === "string" ? { flowId: payload.flowId } : {}), ...(payload.humanness !== undefined ? { humanness: payload.humanness } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlow, assistant: { input: getFlowInput, summary: "Reads a Flow in full.", phrases: ["open this flow","show me everything in this flow"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlow, assistant: { hidden: "Saves a whole Flow document a screen built; a person asks for one change at a time, such as a rename or an instruction." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:SaveFlow",
    accessLevel: "Write",
    resource: savedFlowResource,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<SaveFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow object is required." };
      return { ok: true, payload: { flow: await service.saveFlow({ projectId: String(payload.projectId ?? ""), flow: await withoutClientCheckAuthorization(service, String(payload.projectId ?? ""), payload.flow), ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, assistant: { input: updateFlowSettingsInput, summary: "Renames a Flow or changes its description or visibility.", phrases: ["rename this flow","change the flow description","make this flow private"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch, assistant: { hidden: "Sends the graph editor's low-level edits with revision numbers; only the editor screen calls it." },
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
        payload: await service.flowGraphPatch.applyFlowGraphPatch({
          projectId: String(payload.projectId ?? ""),
          flowId: String(payload.flowId ?? ""),
          baseRevision,
          mutationId,
          operations: payload.operations as Parameters<AutomationStudioService["flowGraphPatch"]["applyFlowGraphPatch"]>[0]["operations"],
          source: GRAPH_PATCH_SOURCE_BY_MADE_BY[String((payload as { madeBy?: unknown }).madeBy ?? "")] ?? "editor_patch",
          message: typeof payload.message === "string" ? payload.message : "Save Flow graph"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport, assistant: { hidden: "Loads the part of the Flow canvas that is on screen; only the canvas calls it." },
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
