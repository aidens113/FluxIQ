// Subflow listing, targets, and the full subflow mutation surface.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type CreateFlowSubflowRequest, type DuplicateFlowSubflowRequest, type FlowExpansionSummaryRequest, type FlowSubflowRequest, type MigrateLegacyFlowRepresentationRequest, type RenameFlowSubflowRequest, type UpdateFlowSubflowRequest } from "../contracts.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerSubflowEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSubflows,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const page = await service.listFlowSubflowSummaries({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), limit: payload.limit, offset: payload.offset, ...(typeof payload.status === "string" ? { status: payload.status } : {}), ...(typeof payload.role === "string" ? { role: payload.role } : {}), ...(typeof payload.search === "string" ? { search: payload.search } : {}), ...((payload.sort === "updated" || payload.sort === "name" || payload.sort === "status" || payload.sort === "role") ? { sort: payload.sort } : {}), ...(payload.direction ? { direction: payload.direction } : {}) });
      return { ok: true, payload: { subflows: page.subflows, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSubflowTargets,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      const page = await service.listFlowSubflowTargets({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        ...(typeof payload.status === "string" ? { status: payload.status } : {}),
        ...(typeof payload.role === "string" ? { role: payload.role } : {}),
        ...(typeof payload.search === "string" ? { search: payload.search } : {}),
        limit: payload.limit,
        cursor: payload.cursor
      });
      return { ok: true, payload: { subflows: page.subflows, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowSubflow,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest : {} as FlowSubflowRequest;
      return { ok: true, payload: { subflow: await service.getFlowSubflow(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.subflowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as CreateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as CreateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["createFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? "") };
      if (typeof payload.description === "string") input.description = payload.description;
      if (typeof payload.role === "string") input.role = payload.role as any;
      if (typeof payload.parentCategoryId === "string" || payload.parentCategoryId === null) input.parentCategoryId = payload.parentCategoryId;
      if (Array.isArray(payload.routeTags)) input.routeTags = payload.routeTags.filter((tag): tag is string => typeof tag === "string");
      return { ok: true, payload: { subflow: await service.createFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateLegacyFlowRepresentation,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as MigrateLegacyFlowRepresentationRequest : {} as MigrateLegacyFlowRepresentationRequest;
      await authorizeProgramPin(identityAccess, payload);
      return {
        ok: true,
        payload: await service.migrateLegacyFlowRepresentation({
          projectId: String(payload.projectId ?? ""),
          flowId: String(payload.flowId ?? ""),
          subflowId: String(payload.subflowId ?? "")
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as UpdateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as UpdateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["updateFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") };
      if (typeof payload.expectedUpdatedAt === "number") input.expectedUpdatedAt = payload.expectedUpdatedAt;
      if (typeof payload.name === "string") input.name = payload.name;
      if (typeof payload.description === "string") input.description = payload.description;
      if (typeof payload.role === "string") input.role = payload.role as any;
      if (typeof payload.parentCategoryId === "string" || payload.parentCategoryId === null) input.parentCategoryId = payload.parentCategoryId;
      if (typeof payload.graphFlowId === "string") input.graphFlowId = payload.graphFlowId;
      if (Array.isArray(payload.routeTags)) input.routeTags = payload.routeTags.filter((tag): tag is string => typeof tag === "string");
      if (Array.isArray(payload.inputMapping)) input.inputMapping = payload.inputMapping;
      if (Array.isArray(payload.outputMapping)) input.outputMapping = payload.outputMapping;
      if (Array.isArray(payload.localInstructionIds)) input.localInstructionIds = payload.localInstructionIds.filter((id): id is string => typeof id === "string");
      if (typeof payload.proposalModeOverride === "string" || payload.proposalModeOverride === null) input.proposalModeOverride = payload.proposalModeOverride as any;
      if (payload.interventionModeOverride === "fully_adaptive" || payload.interventionModeOverride === "manual_approval" || payload.interventionModeOverride === "no_llm_intervention" || payload.interventionModeOverride === null) input.interventionModeOverride = payload.interventionModeOverride;
      return { ok: true, payload: { subflow: await service.updateFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.renameFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RenameFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as RenameFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.renameFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? ""), name: String(payload.name ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.duplicateFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DuplicateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DuplicateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["duplicateFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") };
      if (typeof payload.name === "string") input.name = payload.name;
      return { ok: true, payload: { subflow: await service.duplicateFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.disableFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.disableFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.archiveFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.archiveFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.enableFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.enableFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: await service.deleteFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) };
    }
  });
}
